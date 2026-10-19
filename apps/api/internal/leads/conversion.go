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
	classID, err := data.UUID(input.ClassID)
	if err != nil {
		return ConvertResult{}, ErrClassNotFound
	}
	actorUUID, _ := data.UUID(actorID)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ConvertResult{}, fmt.Errorf("begin convert transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	lead, err := q.GetLead(ctx, leadID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ConvertResult{}, ErrNotFound
	}
	if err != nil {
		return ConvertResult{}, fmt.Errorf("get lead for convert: %w", err)
	}
	if lead.ConvertedStudentID.Valid {
		return ConvertResult{}, ErrAlreadyConverted
	}
	if !isAdmin && lead.AssignedTo.Valid && data.UUIDString(lead.AssignedTo) != actorID {
		return ConvertResult{}, ErrUnauthorizedAccess
	}

	// 2. Validate class
	classRow, err := q.GetAdminClass(ctx, classID)
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

	// 3. Resolve user email & generate random password
	var studentEmail string
	if lead.Email.Valid && strings.TrimSpace(lead.Email.String) != "" {
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

	initialPassword, err := generateRandomPassword(10)
	if err != nil {
		return ConvertResult{}, fmt.Errorf("generate initial password: %w", err)
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
	fullName := strings.TrimSpace(lead.FullName)
	if len(fullName) > 160 {
		fullName = fullName[:160]
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
		Phone:       lead.Phone,
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

	// 5. Enroll student in class
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

	// 6. Update Lead status and converted info
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

	// 8. Create Order
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

	// 9. Audit log
	if err := audit.Write(ctx, q, actorID, "lead.convert", "lead", leadID, nil, map[string]any{
		"student_id":   data.UUIDString(profile.ID),
		"student_code": profile.StudentCode,
		"order_id":     data.UUIDString(order.ID),
		"order_code":   order.OrderCode,
		"class_id":     data.UUIDString(classID),
	}); err != nil {
		return ConvertResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return ConvertResult{}, fmt.Errorf("commit convert transaction: %w", err)
	}

	return ConvertResult{
		StudentID:       data.UUIDString(profile.ID),
		StudentCode:     profile.StudentCode,
		OrderID:         data.UUIDString(order.ID),
		OrderCode:       order.OrderCode,
		InitialPassword: initialPassword,
	}, nil
}

func generateRandomPassword(length int) (string, error) {
	if length < 8 {
		length = 10
	}
	const (
		upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ"
		lower   = "abcdefghijkmnpqrstuvwxyz"
		digits  = "23456789"
		special = "!@#$%^&*"
		all     = upper + lower + digits + special
	)

	b := make([]byte, length)
	sets := []string{upper, lower, digits, special}
	for i, set := range sets {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(set))))
		if err != nil {
			return "", err
		}
		b[i] = set[idx.Int64()]
	}

	for i := len(sets); i < length; i++ {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(all))))
		if err != nil {
			return "", err
		}
		b[i] = all[idx.Int64()]
	}

	for i := range b {
		j, err := rand.Int(rand.Reader, big.NewInt(int64(length)))
		if err != nil {
			return "", err
		}
		b[i], b[j.Int64()] = b[j.Int64()], b[i]
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
