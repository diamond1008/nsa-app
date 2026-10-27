package leads

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/audit"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/classhistory"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

// Convert executes the full student conversion transaction:
// 1. Validates lead and class
// 2. Creates student account with randomized password
// 3. Assigns student role
// 4. Creates student profile
// 5. Enrolls student in class
// 6. Updates lead converted status & pipeline status
// 7. Creates registration order
// 8. Records class history and audit logs
func (s *Service) Convert(ctx context.Context, actorID string, isAdmin bool, leadIDValue string, input ConvertInput) (ConvertResult, error) {
	leadID, err := data.UUID(leadIDValue)
	if err != nil {
		return ConvertResult{}, ErrNotFound
	}
	var classID pgtype.UUID
	var classRow db.GetAdminClassRow
	hasClass := strings.TrimSpace(input.ClassID) != ""
	if hasClass {
		parsedClassID, err := data.UUID(input.ClassID)
		if err != nil {
			return ConvertResult{}, ErrClassNotFound
		}
		classID = parsedClassID
	}
	actorUUID, err := data.UUID(actorID)
	if err != nil {
		return ConvertResult{}, fmt.Errorf("invalid actor ID: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ConvertResult{}, fmt.Errorf("begin convert transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	lead, err := q.GetLeadForUpdate(ctx, leadID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ConvertResult{}, ErrNotFound
	}
	if err != nil {
		return ConvertResult{}, fmt.Errorf("get lead for convert: %w", err)
	}
	if lead.ConvertedStudentID.Valid {
		return ConvertResult{}, ErrAlreadyConverted
	}
	if !isAdmin && (!lead.AssignedTo.Valid || data.UUIDString(lead.AssignedTo) != actorID) {
		return ConvertResult{}, ErrUnauthorizedAccess
	}

	// 2. Validate class (if provided)
	if hasClass {
		classRow, err = q.GetAdminClass(ctx, classID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ConvertResult{}, ErrClassNotFound
		}
		if err != nil {
			return ConvertResult{}, fmt.Errorf("get target class: %w", err)
		}
		if classRow.Status != db.ClassStatusPlanning && classRow.Status != db.ClassStatusOpen && classRow.Status != db.ClassStatusInProgress {
			return ConvertResult{}, ErrClassNotFound
		}

		// Check class capacity
		if classRow.EnrolledStudents >= classRow.MaximumStudents {
			return ConvertResult{}, ErrClassFull
		}
	}

	// 3. Resolve user email & initial password
	var studentEmail string
	if strings.TrimSpace(input.Email) != "" {
		studentEmail = strings.TrimSpace(input.Email)
	} else if lead.Email.Valid && strings.TrimSpace(lead.Email.String) != "" {
		studentEmail = strings.TrimSpace(lead.Email.String)
	} else if lead.Phone.Valid && strings.TrimSpace(lead.Phone.String) != "" {
		cleanPhone := regexp.MustCompile(`\D`).ReplaceAllString(lead.Phone.String, "")
		if cleanPhone != "" {
			studentEmail = fmt.Sprintf("hv_%s@nsa.internal", cleanPhone)
		}
	}
	if studentEmail == "" {
		leadUUIDStr := data.UUIDString(lead.ID)
		leadUUIDStr = strings.ReplaceAll(leadUUIDStr, "-", "")
		if len(leadUUIDStr) > 8 {
			leadUUIDStr = leadUUIDStr[:8]
		}
		studentEmail = fmt.Sprintf("hv_%s@nsa.internal", leadUUIDStr)
	}

	initialPassword := strings.TrimSpace(input.Password)
	if initialPassword == "" {
		var err error
		initialPassword, err = generateRandomPassword(8)
		if err != nil {
			return ConvertResult{}, fmt.Errorf("generate initial password: %w", err)
		}
	}

	passwordHash, err := auth.HashPassword(initialPassword, s.bcryptCost)
	if err != nil {
		return ConvertResult{}, fmt.Errorf("hash initial password: %w", err)
	}

	user, err := q.CreateManagedUser(ctx, db.CreateManagedUserParams{
		Email:        studentEmail,
		PasswordHash: passwordHash,
		Status:       db.UserStatusActive,
	})
	if err != nil {
		return ConvertResult{}, mapWriteError(err)
	}

	if err := q.AssignManagedUserRole(ctx, db.AssignManagedUserRoleParams{
		UserID:     user.ID,
		Code:       auth.RoleStudent,
		AssignedBy: actorUUID,
	}); err != nil {
		return ConvertResult{}, fmt.Errorf("assign student role: %w", err)
	}

	// 4. Create student profile
	fullName := strings.TrimSpace(input.FullName)
	if fullName == "" {
		fullName = strings.TrimSpace(lead.FullName)
	}
	if len(fullName) > 160 {
		fullName = fullName[:160]
	}

	phone := lead.Phone
	if strings.TrimSpace(input.Phone) != "" {
		phone = data.Text(stringPtr(strings.TrimSpace(input.Phone)))
	}

	address := lead.Address
	if address.Valid && len(address.String) > 500 {
		address = data.Text(stringPtr(address.String[:500]))
	}

	profile, err := q.CreateStudentProfile(ctx, db.CreateStudentProfileParams{
		UserID:      user.ID,
		StudentCode: "", // Trigger auto-sequence generation
		FullName:    fullName,
		AvatarUrl:   data.Text(nil),
		Phone:       phone,
		DateOfBirth: lead.DateOfBirth,
		Gender:      normalizeStudentGender(lead.Gender),
		Address:     address,
		Status:      db.StudentStatusActive,
		EnrolledAt:  pgtype.Date{Time: time.Now().UTC(), Valid: true},
	})
	if err != nil {
		return ConvertResult{}, mapWriteError(err)
	}

	if _, err := q.CreateStudentStatusHistory(ctx, db.CreateStudentStatusHistoryParams{
		StudentID: profile.ID,
		ToStatus:  db.StudentStatusActive,
		Reason:    "1-Click Chuyển đổi từ Lead CRM",
		ChangedBy: actorUUID,
	}); err != nil {
		return ConvertResult{}, fmt.Errorf("record student status history: %w", err)
	}

	// 5. Enroll student in class (if class provided)
	if hasClass {
		enrollment, err := q.CreateClassEnrollment(ctx, db.CreateClassEnrollmentParams{
			ClassID:   classID,
			StudentID: profile.ID,
			CreatedBy: actorUUID,
		})
		if err != nil {
			return ConvertResult{}, mapWriteError(err)
		}

		if err := classhistory.Write(ctx, q, actorID, classID, "student_enrolled", "class_enrollment", enrollment.ID, "1-Click Chuyển đổi từ Lead CRM", map[string]any{
			"student_id":   data.UUIDString(profile.ID),
			"student_code": profile.StudentCode,
		}); err != nil {
			return ConvertResult{}, err
		}
	}

	// 6. Update Lead status and converted info
	leadFullName := lead.FullName
	if strings.TrimSpace(input.FullName) != "" {
		leadFullName = strings.TrimSpace(input.FullName)
	}
	leadEmail := lead.Email
	if strings.TrimSpace(input.Email) != "" {
		leadEmail = data.Text(stringPtr(strings.TrimSpace(input.Email)))
	}
	leadPhone := lead.Phone
	if strings.TrimSpace(input.Phone) != "" {
		leadPhone = data.Text(stringPtr(strings.TrimSpace(input.Phone)))
	}
	_, _ = q.UpdateLead(ctx, db.UpdateLeadParams{
		ID:                 leadID,
		FullName:           leadFullName,
		Phone:              leadPhone,
		Email:              leadEmail,
		DateOfBirth:        lead.DateOfBirth,
		Gender:             lead.Gender,
		Address:            lead.Address,
		Source:             lead.Source,
		SourceDetail:       lead.SourceDetail,
		UtmSource:          lead.UtmSource,
		UtmMedium:          lead.UtmMedium,
		UtmCampaign:        lead.UtmCampaign,
		UtmContent:         lead.UtmContent,
		UtmTerm:            lead.UtmTerm,
		InterestedCourseID: lead.InterestedCourseID,
		Notes:              lead.Notes,
	})

	now := time.Now().UTC()
	_, err = q.ConvertLead(ctx, db.ConvertLeadParams{
		ID:                 leadID,
		ConvertedStudentID: profile.ID,
		ConvertedAt:        pgtype.Timestamptz{Time: now, Valid: true},
		ConvertedBy:        actorUUID,
	})
	if err != nil {
		return ConvertResult{}, mapWriteError(err)
	}

	// 7. Record pipeline history
	_, err = q.CreatePipelineHistory(ctx, db.CreatePipelineHistoryParams{
		LeadID:    leadID,
		OldStatus: db.NullLeadPipelineStatus{LeadPipelineStatus: lead.PipelineStatus, Valid: true},
		NewStatus: db.LeadPipelineStatusDaDangKy,
		Reason:    data.Text(stringPtr("1-Click Chuyển đổi thành Học viên")),
		ChangedBy: actorUUID,
	})
	if err != nil {
		return ConvertResult{}, fmt.Errorf("record pipeline history: %w", err)
	}

	// 8. Create Order (if class provided)
	var orderCode string
	var orderIDStr string
	if hasClass {
		amountNum, err := data.Numeric(input.Amount)
		if err != nil {
			return ConvertResult{}, fmt.Errorf("invalid amount: %w", err)
		}
		discountNum, err := data.Numeric(input.DiscountAmount)
		if err != nil {
			return ConvertResult{}, fmt.Errorf("invalid discount amount: %w", err)
		}
		finalNum, err := data.Numeric(input.Amount - input.DiscountAmount)
		if err != nil {
			return ConvertResult{}, fmt.Errorf("invalid final amount: %w", err)
		}

		order, err := q.CreateOrder(ctx, db.CreateOrderParams{
			OrderCode:      "", // trigger sequence
			LeadID:         leadID,
			StudentID:      profile.ID,
			CourseID:       classRow.CourseID,
			ClassID:        classID,
			Amount:         amountNum,
			DiscountAmount: discountNum,
			FinalAmount:    finalNum,
			DiscountNote:   data.Text(stringPtr(input.DiscountNote)),
			Status:         db.OrderStatusPending,
			PaymentMethod:  data.Text(stringPtr(input.PaymentMethod)),
			PaidAt:         pgtype.Timestamptz{},
			Notes:          data.Text(stringPtr(input.Notes)),
			CreatedBy:      actorUUID,
		})
		if err != nil {
			return ConvertResult{}, mapWriteError(err)
		}
		orderCode = order.OrderCode
		orderIDStr = data.UUIDString(order.ID)
	}

	// 9. Audit log
	auditDetails := map[string]any{
		"student_id":   data.UUIDString(profile.ID),
		"student_code": profile.StudentCode,
	}
	if hasClass {
		auditDetails["order_id"] = orderIDStr
		auditDetails["order_code"] = orderCode
		auditDetails["class_id"] = data.UUIDString(classID)
	}
	if err := audit.Write(ctx, q, actorID, "lead.convert", "lead", leadID, nil, auditDetails); err != nil {
		return ConvertResult{}, fmt.Errorf("write convert audit log: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return ConvertResult{}, fmt.Errorf("commit convert transaction: %w", err)
	}

	return ConvertResult{
		StudentID:       data.UUIDString(profile.ID),
		StudentCode:     profile.StudentCode,
		OrderID:         orderIDStr,
		OrderCode:       orderCode,
		InitialPassword: initialPassword,
	}, nil
}

func generateRandomPassword(length int) (string, error) {
	if length < 8 {
		length = 8
	}
	const (
		upper  = "ABCDEFGHJKLMNPQRSTUVWXYZ"
		lower  = "abcdefghijkmnpqrstuvwxyz"
		digits = "23456789"
		all    = upper + lower + digits
	)

	b := make([]byte, length)
	charsets := []string{upper, lower, digits}
	for i, cs := range charsets {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(cs))))
		if err != nil {
			return "", fmt.Errorf("crypto rand charset %d: %w", i, err)
		}
		b[i] = cs[idx.Int64()]
	}

	for i := len(charsets); i < length; i++ {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(all))))
		if err != nil {
			return "", fmt.Errorf("crypto rand fill %d: %w", i, err)
		}
		b[i] = all[idx.Int64()]
	}

	for i := length - 1; i > 0; i-- {
		jBig, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			return "", fmt.Errorf("crypto rand shuffle %d: %w", i, err)
		}
		j := int(jBig.Int64())
		b[i], b[j] = b[j], b[i]
	}

	return string(b), nil
}

func normalizeStudentGender(raw pgtype.Text) pgtype.Text {
	if !raw.Valid {
		return data.Text(nil)
	}
	val := strings.ToLower(strings.TrimSpace(raw.String))
	switch val {
	case "nam", "male", "m":
		return data.Text(stringPtr("male"))
	case "nữ", "nu", "female", "f":
		return data.Text(stringPtr("female"))
	case "khác", "khac", "other":
		return data.Text(stringPtr("other"))
	case "unspecified":
		return data.Text(stringPtr("unspecified"))
	default:
		return data.Text(nil)
	}
}
