package leads

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"math/big"
	"regexp"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/audit"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/classhistory"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/dberror"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/pagination"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
	"github.com/xuri/excelize/v2"
)

var roundRobinCounter uint64

type Service struct {
	pool       *pgxpool.Pool
	queries    *db.Queries
	bcryptCost int
}

func NewService(pool *pgxpool.Pool, bcryptCost int) *Service {
	return &Service{
		pool:       pool,
		queries:    db.New(pool),
		bcryptCost: bcryptCost,
	}
}

func (s *Service) getNextRoundRobinStaff(ctx context.Context) (pgtype.UUID, error) {
	staffList, err := s.queries.ListActiveSaleStaffForRoundRobin(ctx)
	if err != nil || len(staffList) == 0 {
		fallbackList, fErr := s.queries.ListSaleStaff(ctx)
		if fErr != nil || len(fallbackList) == 0 {
			return pgtype.UUID{}, nil
		}
		idx := atomic.AddUint64(&roundRobinCounter, 1) % uint64(len(fallbackList))
		return fallbackList[idx].ID, nil
	}
	idx := atomic.AddUint64(&roundRobinCounter, 1) % uint64(len(staffList))
	return staffList[idx].ID, nil
}

func (s *Service) Create(ctx context.Context, actorID string, input WriteInput) (View, error) {
	actor, err := data.UUID(actorID)
	if err != nil {
		return View{}, fmt.Errorf("invalid actor: %w", err)
	}

	dateOfBirth, err := data.Date(input.DateOfBirth)
	if err != nil {
		return View{}, err
	}

	var courseID pgtype.UUID
	if input.InterestedCourseID != nil && *input.InterestedCourseID != "" {
		courseID, err = data.UUID(*input.InterestedCourseID)
		if err != nil {
			return View{}, fmt.Errorf("invalid interested course ID: %w", err)
		}
	}

	var assignee pgtype.UUID
	var assignedAt pgtype.Timestamptz
	var assignedBy pgtype.UUID
	isAutoAssigned := false
	if input.AssignedTo != nil && *input.AssignedTo != "" && *input.AssignedTo != "round_robin" {
		assignee, err = data.UUID(*input.AssignedTo)
		if err != nil {
			return View{}, fmt.Errorf("invalid assignee ID: %w", err)
		}
		assignedAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
		assignedBy = actor
	} else {
		rrStaff, rrErr := s.getNextRoundRobinStaff(ctx)
		if rrErr == nil && rrStaff.Valid {
			assignee = rrStaff
			assignedAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
			assignedBy = actor
			isAutoAssigned = true
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin create lead: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	lead, err := q.CreateLead(ctx, db.CreateLeadParams{
		FullName:           input.FullName,
		Phone:              data.Text(input.Phone),
		Email:              data.Text(input.Email),
		DateOfBirth:        dateOfBirth,
		Gender:             data.Text(input.Gender),
		Address:            data.Text(input.Address),
		Source:             input.Source,
		SourceDetail:       data.Text(input.SourceDetail),
		UtmSource:          data.Text(input.UTMSource),
		UtmMedium:          data.Text(input.UTMMedium),
		UtmCampaign:        data.Text(input.UTMCampaign),
		UtmContent:         data.Text(input.UTMContent),
		UtmTerm:            data.Text(input.UTMTerm),
		InterestedCourseID: courseID,
		Notes:              data.Text(input.Notes),
		PipelineStatus:     db.LeadPipelineStatusDataMoi,
		AssignedTo:         assignee,
		AssignedAt:         assignedAt,
		AssignedBy:         assignedBy,
		CreatedBy:          actor,
	})
	if err != nil {
		return View{}, mapWriteError(err)
	}

	// Record initial pipeline history
	initialReason := "Tiếp nhận Lead mới"
	if isAutoAssigned {
		initialReason = "Tiếp nhận Lead mới (Tự động chia Round-Robin)"
	}
	_, err = q.CreatePipelineHistory(ctx, db.CreatePipelineHistoryParams{
		LeadID:    lead.ID,
		OldStatus: db.NullLeadPipelineStatus{},
		NewStatus: db.LeadPipelineStatusDataMoi,
		Reason:    data.Text(stringPtr(initialReason)),
		ChangedBy: actor,
	})
	if err != nil {
		return View{}, fmt.Errorf("record initial pipeline history: %w", err)
	}

	getLead, err := q.GetLead(ctx, lead.ID)
	if err != nil {
		return View{}, fmt.Errorf("read created lead: %w", err)
	}

	view := viewFromGet(getLead)
	if err := audit.Write(ctx, q, actorID, "lead.create", "lead", lead.ID, nil, view); err != nil {
		return View{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit create lead: %w", err)
	}

	return view, nil
}

func (s *Service) Get(ctx context.Context, actorID string, isAdmin bool, leadIDValue string) (View, error) {
	leadID, err := data.UUID(leadIDValue)
	if err != nil {
		return View{}, ErrNotFound
	}

	row, err := s.queries.GetLead(ctx, leadID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get lead: %w", err)
	}

	if !isAdmin && row.AssignedTo.Valid && data.UUIDString(row.AssignedTo) != actorID {
		return View{}, ErrUnauthorizedAccess
	}

	return viewFromGet(row), nil
}

func (s *Service) List(ctx context.Context, actorID string, isAdmin bool, filter ListFilter) (ListResult, error) {
	search := strings.TrimSpace(filter.Search)

	var pipelineStatus db.NullLeadPipelineStatus
	if filter.PipelineStatus != "" {
		pipelineStatus = db.NullLeadPipelineStatus{
			LeadPipelineStatus: db.LeadPipelineStatus(filter.PipelineStatus),
			Valid:              true,
		}
	}

	var source db.NullLeadSource
	if filter.Source != "" {
		source = db.NullLeadSource{
			LeadSource: db.LeadSource(filter.Source),
			Valid:      true,
		}
	}

	var assignedTo pgtype.UUID
	if !isAdmin {
		// Non-admin SALE users only see leads assigned to themselves
		actorUUID, err := data.UUID(actorID)
		if err != nil {
			return pagination.Result[View]{}, fmt.Errorf("invalid actor ID: %w", err)
		}
		assignedTo = actorUUID
	} else if filter.AssignedTo != "" {
		parsed, err := data.UUID(filter.AssignedTo)
		if err != nil {
			return pagination.Result[View]{}, fmt.Errorf("invalid assigned_to filter: %w", err)
		}
		assignedTo = parsed
	}

	var createdFrom pgtype.Timestamptz
	if filter.CreatedFrom != "" {
		t, err := time.Parse(time.RFC3339, filter.CreatedFrom)
		if err == nil {
			createdFrom = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	var createdTo pgtype.Timestamptz
	if filter.CreatedTo != "" {
		t, err := time.Parse(time.RFC3339, filter.CreatedTo)
		if err == nil {
			createdTo = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	sortBy := filter.SortBy
	if sortBy != "full_name" && sortBy != "created_at" {
		sortBy = "created_at"
	}
	sortOrder := strings.ToLower(filter.SortOrder)
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}

	page := filter.Page
	if page < 1 {
		page = 1
	}
	perPage := filter.PerPage
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}
	offset := (page - 1) * perPage

	rows, err := s.queries.ListLeads(ctx, db.ListLeadsParams{
		Search:         search,
		PipelineStatus: pipelineStatus,
		Source:         source,
		AssignedTo:     assignedTo,
		CreatedFrom:    createdFrom,
		CreatedTo:      createdTo,
		SortBy:         sortBy,
		SortOrder:      sortOrder,
		PageLimit:      int32(perPage),
		PageOffset:     int32(offset),
	})
	if err != nil {
		return pagination.Result[View]{}, fmt.Errorf("list leads: %w", err)
	}

	total, err := s.queries.CountLeads(ctx, db.CountLeadsParams{
		Search:         search,
		PipelineStatus: pipelineStatus,
		Source:         source,
		AssignedTo:     assignedTo,
		CreatedFrom:    createdFrom,
		CreatedTo:      createdTo,
	})
	if err != nil {
		return pagination.Result[View]{}, fmt.Errorf("count leads: %w", err)
	}

	items := make([]View, 0, len(rows))
	for _, row := range rows {
		items = append(items, viewFromListRow(row))
	}

	return pagination.New(items, page, perPage, total), nil
}

func (s *Service) Update(ctx context.Context, actorID string, isAdmin bool, leadIDValue string, input WriteInput) (View, error) {
	leadID, err := data.UUID(leadIDValue)
	if err != nil {
		return View{}, ErrNotFound
	}

	existing, err := s.queries.GetLead(ctx, leadID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get lead for update: %w", err)
	}

	if !isAdmin && existing.AssignedTo.Valid && data.UUIDString(existing.AssignedTo) != actorID {
		return View{}, ErrUnauthorizedAccess
	}

	dateOfBirth, err := data.Date(input.DateOfBirth)
	if err != nil {
		return View{}, err
	}

	var courseID pgtype.UUID
	if input.InterestedCourseID != nil && *input.InterestedCourseID != "" {
		courseID, err = data.UUID(*input.InterestedCourseID)
		if err != nil {
			return View{}, fmt.Errorf("invalid course ID: %w", err)
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin update lead: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	_, err = q.UpdateLead(ctx, db.UpdateLeadParams{
		ID:                 leadID,
		FullName:           input.FullName,
		Phone:              data.Text(input.Phone),
		Email:              data.Text(input.Email),
		DateOfBirth:        dateOfBirth,
		Gender:             data.Text(input.Gender),
		Address:            data.Text(input.Address),
		Source:             input.Source,
		SourceDetail:       data.Text(input.SourceDetail),
		UtmSource:          data.Text(input.UTMSource),
		UtmMedium:          data.Text(input.UTMMedium),
		UtmCampaign:        data.Text(input.UTMCampaign),
		UtmContent:         data.Text(input.UTMContent),
		UtmTerm:            data.Text(input.UTMTerm),
		InterestedCourseID: courseID,
		Notes:              data.Text(input.Notes),
	})
	if err != nil {
		return View{}, mapWriteError(err)
	}

	updated, err := q.GetLead(ctx, leadID)
	if err != nil {
		return View{}, fmt.Errorf("read updated lead: %w", err)
	}

	view := viewFromGet(updated)
	if err := audit.Write(ctx, q, actorID, "lead.update", "lead", leadID, viewFromGet(existing), view); err != nil {
		return View{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit update lead: %w", err)
	}

	return view, nil
}

func (s *Service) UpdateStatus(ctx context.Context, actorID string, isAdmin bool, leadIDValue string, input StatusInput) (View, error) {
	leadID, err := data.UUID(leadIDValue)
	if err != nil {
		return View{}, ErrNotFound
	}

	existing, err := s.queries.GetLead(ctx, leadID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get lead for status update: %w", err)
	}

	if !isAdmin && existing.AssignedTo.Valid && data.UUIDString(existing.AssignedTo) != actorID {
		return View{}, ErrUnauthorizedAccess
	}

	targetStatus := db.LeadPipelineStatus(input.PipelineStatus)
	if !isValidPipelineStatus(targetStatus) {
		return View{}, ErrInvalidStatusTransition
	}

	actor, _ := data.UUID(actorID)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin update lead status: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	_, err = q.UpdateLeadPipelineStatus(ctx, db.UpdateLeadPipelineStatusParams{
		ID:             leadID,
		PipelineStatus: targetStatus,
	})
	if err != nil {
		return View{}, mapWriteError(err)
	}

	reason := strings.TrimSpace(input.Reason)
	if reason == "" {
		reason = fmt.Sprintf("Chuyển trạng thái sang %s", targetStatus)
	}

	_, err = q.CreatePipelineHistory(ctx, db.CreatePipelineHistoryParams{
		LeadID:    leadID,
		OldStatus: db.NullLeadPipelineStatus{LeadPipelineStatus: existing.PipelineStatus, Valid: true},
		NewStatus: targetStatus,
		Reason:    data.Text(stringPtr(reason)),
		ChangedBy: actor,
	})
	if err != nil {
		return View{}, fmt.Errorf("record pipeline history: %w", err)
	}

	updated, err := q.GetLead(ctx, leadID)
	if err != nil {
		return View{}, fmt.Errorf("read updated lead: %w", err)
	}

	view := viewFromGet(updated)
	if err := audit.Write(ctx, q, actorID, "lead.update_status", "lead", leadID, viewFromGet(existing), view); err != nil {
		return View{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit update status: %w", err)
	}

	return view, nil
}

func (s *Service) Assign(ctx context.Context, actorID, leadIDValue, assigneeIDValue string) (View, error) {
	leadID, err := data.UUID(leadIDValue)
	if err != nil {
		return View{}, ErrNotFound
	}
	assigneeUUID, err := data.UUID(assigneeIDValue)
	if err != nil {
		return View{}, ErrInvalidAssignee
	}
	actorUUID, _ := data.UUID(actorID)

	existing, err := s.queries.GetLead(ctx, leadID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get lead for assign: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin assign lead: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	_, err = q.AssignLead(ctx, db.AssignLeadParams{
		ID:         leadID,
		AssignedTo: assigneeUUID,
		AssignedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		AssignedBy: actorUUID,
	})
	if err != nil {
		return View{}, mapWriteError(err)
	}

	updated, err := q.GetLead(ctx, leadID)
	if err != nil {
		return View{}, fmt.Errorf("read assigned lead: %w", err)
	}

	view := viewFromGet(updated)
	if err := audit.Write(ctx, q, actorID, "lead.assign", "lead", leadID, viewFromGet(existing), view); err != nil {
		return View{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit assign lead: %w", err)
	}

	return view, nil
}

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

func (s *Service) ListSaleStaff(ctx context.Context) ([]SaleStaffView, error) {
	rows, err := s.queries.ListSaleStaff(ctx)
	if err != nil {
		return nil, fmt.Errorf("list sale staff: %w", err)
	}
	items := make([]SaleStaffView, 0, len(rows))
	for _, row := range rows {
		items = append(items, SaleStaffView{
			ID:    data.UUIDString(row.ID),
			Email: row.Email,
		})
	}
	return items, nil
}

func (s *Service) DashboardOverview(ctx context.Context) (DashboardOverviewView, error) {
	statusRows, err := s.queries.CountLeadsByStatus(ctx)
	if err != nil {
		return DashboardOverviewView{}, fmt.Errorf("count leads by status: %w", err)
	}
	byStatus := make(map[string]int64)
	for _, r := range statusRows {
		byStatus[string(r.PipelineStatus)] = r.Count
	}

	sourceRows, err := s.queries.CountLeadsBySource(ctx)
	if err != nil {
		return DashboardOverviewView{}, fmt.Errorf("count leads by source: %w", err)
	}
	bySource := make(map[string]int64)
	for _, r := range sourceRows {
		bySource[string(r.Source)] = r.Count
	}

	assigneeRows, err := s.queries.CountLeadsByAssignee(ctx)
	if err != nil {
		return DashboardOverviewView{}, fmt.Errorf("count leads by assignee: %w", err)
	}
	byAssignee := make([]AssigneeStat, 0, len(assigneeRows))
	for _, r := range assigneeRows {
		byAssignee = append(byAssignee, AssigneeStat{
			UserID:         data.UUIDString(r.UserID),
			Email:          r.Email,
			TotalLeads:     r.TotalLeads,
			ConvertedLeads: r.ConvertedLeads,
		})
	}

	return DashboardOverviewView{
		ByStatus:   byStatus,
		BySource:   bySource,
		ByAssignee: byAssignee,
	}, nil
}

func (s *Service) MyDashboardStats(ctx context.Context, actorID string) (SaleDashboardStats, error) {
	actorUUID, err := data.UUID(actorID)
	if err != nil {
		return SaleDashboardStats{}, fmt.Errorf("invalid actor ID: %w", err)
	}

	stats, err := s.queries.GetSaleDashboardStats(ctx, actorUUID)
	if err != nil {
		return SaleDashboardStats{}, fmt.Errorf("get sale dashboard stats: %w", err)
	}

	var conversionRate float64
	if stats.TotalThisMonth > 0 {
		conversionRate = (float64(stats.ConvertedThisMonth) / float64(stats.TotalThisMonth)) * 100.0
	}

	return SaleDashboardStats{
		AssignedLeads:      stats.AssignedLeads,
		NewLeadsToday:      stats.NewLeadsToday,
		OverdueTasks:       stats.OverdueTasks,
		TodayTasks:         stats.TodayTasks,
		ConvertedThisMonth: stats.ConvertedThisMonth,
		TotalThisMonth:     stats.TotalThisMonth,
		ConversionRate:     conversionRate,
		MonthRevenue:       data.NumericFloat(stats.MonthRevenue),
		TeamMonthRevenue:   data.NumericFloat(stats.TeamMonthRevenue),
	}, nil
}

func viewFromGet(row db.GetLeadRow) View {
	return View{
		ID:                   data.UUIDString(row.ID),
		FullName:             row.FullName,
		Phone:                data.TextPointer(row.Phone),
		Email:                data.TextPointer(row.Email),
		DateOfBirth:          data.DateString(row.DateOfBirth),
		Gender:               data.TextPointer(row.Gender),
		Address:              data.TextPointer(row.Address),
		Source:               string(row.Source),
		SourceDetail:         data.TextPointer(row.SourceDetail),
		UTMSource:            data.TextPointer(row.UtmSource),
		UTMMedium:            data.TextPointer(row.UtmMedium),
		UTMCampaign:          data.TextPointer(row.UtmCampaign),
		UTMContent:           data.TextPointer(row.UtmContent),
		UTMTerm:              data.TextPointer(row.UtmTerm),
		InterestedCourseID:   data.UUIDPointer(row.InterestedCourseID),
		InterestedCourseCode: data.TextPointer(row.CourseCode),
		InterestedCourseName: data.TextPointer(row.CourseName),
		Notes:                data.TextPointer(row.Notes),
		PipelineStatus:       string(row.PipelineStatus),
		AssignedTo:           data.UUIDPointer(row.AssignedTo),
		AssignedToEmail:      data.TextPointer(row.AssignedToEmail),
		AssignedAt:           timestamptzString(row.AssignedAt),
		AssignedBy:           data.UUIDPointer(row.AssignedBy),
		AssignedByEmail:      data.TextPointer(row.AssignedByEmail),
		ConvertedStudentID:   data.UUIDPointer(row.ConvertedStudentID),
		ConvertedStudentCode: data.TextPointer(row.ConvertedStudentCode),
		ConvertedStudentName: data.TextPointer(row.ConvertedStudentName),
		ConvertedAt:          timestamptzString(row.ConvertedAt),
		ConvertedBy:          data.UUIDPointer(row.ConvertedBy),
		CreatedBy:            data.UUIDString(row.CreatedBy),
		CreatedByEmail:       data.TextPointer(row.CreatedByEmail),
		CreatedAt:            row.CreatedAt.Time.UTC().Format(time.RFC3339),
		UpdatedAt:            row.UpdatedAt.Time.UTC().Format(time.RFC3339),
	}
}

func viewFromListRow(row db.ListLeadsRow) View {
	return View{
		ID:                   data.UUIDString(row.ID),
		FullName:             row.FullName,
		Phone:                data.TextPointer(row.Phone),
		Email:                data.TextPointer(row.Email),
		DateOfBirth:          data.DateString(row.DateOfBirth),
		Gender:               data.TextPointer(row.Gender),
		Address:              data.TextPointer(row.Address),
		Source:               string(row.Source),
		SourceDetail:         data.TextPointer(row.SourceDetail),
		UTMSource:            data.TextPointer(row.UtmSource),
		UTMMedium:            data.TextPointer(row.UtmMedium),
		UTMCampaign:          data.TextPointer(row.UtmCampaign),
		UTMContent:           data.TextPointer(row.UtmContent),
		UTMTerm:              data.TextPointer(row.UtmTerm),
		InterestedCourseID:   data.UUIDPointer(row.InterestedCourseID),
		InterestedCourseCode: data.TextPointer(row.CourseCode),
		InterestedCourseName: data.TextPointer(row.CourseName),
		Notes:                data.TextPointer(row.Notes),
		PipelineStatus:       string(row.PipelineStatus),
		AssignedTo:           data.UUIDPointer(row.AssignedTo),
		AssignedToEmail:      data.TextPointer(row.AssignedToEmail),
		AssignedAt:           timestamptzString(row.AssignedAt),
		AssignedBy:           data.UUIDPointer(row.AssignedBy),
		ConvertedStudentID:   data.UUIDPointer(row.ConvertedStudentID),
		ConvertedStudentCode: data.TextPointer(row.ConvertedStudentCode),
		ConvertedStudentName: data.TextPointer(row.ConvertedStudentName),
		ConvertedAt:          timestamptzString(row.ConvertedAt),
		ConvertedBy:          data.UUIDPointer(row.ConvertedBy),
		CreatedBy:            data.UUIDString(row.CreatedBy),
		CreatedAt:            row.CreatedAt.Time.UTC().Format(time.RFC3339),
		UpdatedAt:            row.UpdatedAt.Time.UTC().Format(time.RFC3339),
	}
}

func timestamptzString(t pgtype.Timestamptz) *string {
	if !t.Valid {
		return nil
	}
	formatted := t.Time.UTC().Format(time.RFC3339)
	return &formatted
}

func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func isValidPipelineStatus(s db.LeadPipelineStatus) bool {
	switch s {
	case db.LeadPipelineStatusDataMoi,
		db.LeadPipelineStatusKnmThueBao,
		db.LeadPipelineStatusGoiLaiSau,
		db.LeadPipelineStatusFollow,
		db.LeadPipelineStatusTuChoi,
		db.LeadPipelineStatusDaDangKy,
		db.LeadPipelineStatusDangHoc,
		db.LeadPipelineStatusKetThuc:
		return true
	default:
		return false
	}
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

	// Ensure at least 1 of each required character set
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

	// Shuffle
	for i := range b {
		j, err := rand.Int(rand.Reader, big.NewInt(int64(length)))
		if err != nil {
			return "", err
		}
		b[i], b[j.Int64()] = b[j.Int64()], b[i]
	}

	return string(b), nil
}

func mapWriteError(err error) error {
	if dberror.IsCode(err, dberror.UniqueViolation) {
		switch dberror.Constraint(err) {
		case "users_email_key":
			return ErrEmailAlreadyExists
		case "orders_order_code_key":
			return errors.New("order code already exists")
		}
	}
	return err
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

func GenerateTemplateExcel() ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	sheet := "MauNhapLead"
	index, err := f.NewSheet(sheet)
	if err != nil {
		return nil, fmt.Errorf("create sheet: %w", err)
	}
	f.SetActiveSheet(index)
	_ = f.DeleteSheet("Sheet1")

	headers := []interface{}{
		"Họ và tên *",
		"Số điện thoại",
		"Email",
		"Khóa học quan tâm",
		"Nguồn lead",
		"Ghi chú tư vấn",
		"Ngày sinh (DD/MM/YYYY)",
		"Giới tính (Nam/Nữ)",
		"Địa chỉ",
		"Nhân viên phụ trách",
	}
	if err := f.SetSheetRow(sheet, "A1", &headers); err != nil {
		return nil, fmt.Errorf("write headers: %w", err)
	}

	sample1 := []interface{}{
		"Trần Văn An", "0901234567", "tranvanan@example.com", "AUTO-EV-HYBRID", "facebook",
		"Quan tâm khóa kỹ thuật xe điện & Hybrid", "15/05/1998", "Nam", "Hà Nội", "sale@nsa.local",
	}
	sample2 := []interface{}{
		"Nguyễn Thị Mai", "0912345678", "mainguyen@example.com", "AUTO-ELEC-PRO", "tiktok",
		"Tư vấn lịch học thực hành buổi tối", "20/10/2001", "Nữ", "TP. Hồ Chí Minh", "sale2@nsa.local",
	}
	sample3 := []interface{}{
		"Lê Quốc Huy", "0987654321", "huy.le@example.com", "AUTO-ENG-EFI", "zalo",
		"Muốn bổ túc chẩn đoán động cơ GDI", "08/12/1995", "Nam", "Đà Nẵng", "",
	}
	_ = f.SetSheetRow(sheet, "A2", &sample1)
	_ = f.SetSheetRow(sheet, "A3", &sample2)
	_ = f.SetSheetRow(sheet, "A4", &sample3)

	headerStyle, err := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{
			Bold:  true,
			Color: "#FFFFFF",
			Size:  11,
		},
		Fill: excelize.Fill{
			Type:    "pattern",
			Color:   []string{"#0A2540"},
			Pattern: 1,
		},
		Alignment: &excelize.Alignment{
			Horizontal: "center",
			Vertical:   "center",
			WrapText:   true,
		},
	})
	if err == nil {
		_ = f.SetCellStyle(sheet, "A1", "J1", headerStyle)
	}
	_ = f.SetRowHeight(sheet, 1, 30)

	colWidths := map[string]float64{
		"A": 22,
		"B": 16,
		"C": 26,
		"D": 22,
		"E": 15,
		"F": 38,
		"G": 22,
		"H": 18,
		"I": 24,
		"J": 26,
	}
	for col, width := range colWidths {
		_ = f.SetColWidth(sheet, col, col, width)
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("write buffer: %w", err)
	}
	return buf.Bytes(), nil
}

func parseRowsFromData(dataBytes []byte) ([][]string, error) {
	if len(dataBytes) >= 4 && dataBytes[0] == 0x50 && dataBytes[1] == 0x4B && dataBytes[2] == 0x03 && dataBytes[3] == 0x04 {
		// XLSX format
		f, err := excelize.OpenReader(bytes.NewReader(dataBytes))
		if err != nil {
			return nil, fmt.Errorf("không thể đọc file Excel (.xlsx): %w", err)
		}
		defer f.Close()

		sheets := f.GetSheetList()
		if len(sheets) == 0 {
			return nil, errors.New("file Excel không có trang tính (sheet) nào")
		}
		rows, err := f.GetRows(sheets[0])
		if err != nil {
			return nil, fmt.Errorf("lỗi đọc sheet %s: %w", sheets[0], err)
		}
		return rows, nil
	}

	// CSV format fallback
	firstLine := string(dataBytes)
	if idx := strings.IndexAny(firstLine, "\r\n"); idx != -1 {
		firstLine = firstLine[:idx]
	}
	commaCount := strings.Count(firstLine, ",")
	semicolonCount := strings.Count(firstLine, ";")

	reader := csv.NewReader(bytes.NewReader(dataBytes))
	reader.TrimLeadingSpace = true
	reader.FieldsPerRecord = -1
	if semicolonCount > commaCount {
		reader.Comma = ';'
	}

	rows, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("lỗi đọc file CSV: %w", err)
	}
	return rows, nil
}

func (s *Service) ImportFileData(ctx context.Context, actorID string, dataBytes []byte) (ImportResult, error) {
	if len(dataBytes) == 0 {
		return ImportResult{}, fmt.Errorf("%w: file tải lên bị trống", ErrInvalidCSV)
	}
	if len(dataBytes) > 10<<20 {
		return ImportResult{}, fmt.Errorf("%w: dung lượng file vượt quá giới hạn 10MB", ErrInvalidCSV)
	}

	rows, err := parseRowsFromData(dataBytes)
	if err != nil {
		return ImportResult{}, fmt.Errorf("%w: %v", ErrInvalidCSV, err)
	}
	if len(rows) == 0 {
		return ImportResult{}, fmt.Errorf("%w: file không chứa dữ liệu", ErrInvalidCSV)
	}

	header := rows[0]
	columns := make(map[string]int, len(header))
	for index, name := range header {
		normalized := normalizeColumnHeader(name)
		if normalized != "" {
			columns[normalized] = index
		}
	}

	if _, ok := columns["full_name"]; !ok {
		return ImportResult{}, fmt.Errorf("%w: Cột Họ và tên (Họ và tên hoặc full_name) là bắt buộc", ErrInvalidCSV)
	}

	// Pre-load courses for quick mapping
	courseList, err := s.queries.ListCourses(ctx, db.ListCoursesParams{
		PageLimit: 500,
	})
	if err != nil {
		return ImportResult{}, fmt.Errorf("load courses: %w", err)
	}
	courseByCode := make(map[string]string)
	courseByName := make(map[string]string)
	courseByID := make(map[string]string)
	for _, c := range courseList {
		idStr := data.UUIDString(c.ID)
		courseByCode[strings.ToUpper(strings.TrimSpace(c.Code))] = idStr
		courseByName[strings.ToLower(strings.TrimSpace(c.Name))] = idStr
		courseByID[strings.ToLower(idStr)] = idStr
	}

	// Pre-load staff for quick mapping
	staffList, err := s.ListSaleStaff(ctx)
	if err != nil {
		return ImportResult{}, fmt.Errorf("load sale staff: %w", err)
	}
	staffByEmail := make(map[string]string)
	staffByID := make(map[string]string)
	for _, st := range staffList {
		staffByEmail[strings.ToLower(strings.TrimSpace(st.Email))] = st.ID
		staffByID[strings.ToLower(strings.TrimSpace(st.ID))] = st.ID
	}

	result := ImportResult{Errors: make([]ImportRowError, 0)}

	for idx, record := range rows[1:] {
		rowNumber := idx + 2
		if rowNumber > 501 {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNumber,
				Message: "Mỗi lần chỉ được nhập tối đa 500 dòng",
			})
			break
		}

		// Skip completely empty rows
		isEmpty := true
		for _, cell := range record {
			if strings.TrimSpace(cell) != "" {
				isEmpty = false
				break
			}
		}
		if isEmpty {
			continue
		}

		val := func(colName string) string {
			colIdx, ok := columns[colName]
			if !ok || colIdx >= len(record) {
				return ""
			}
			return strings.TrimSpace(record[colIdx])
		}

		fullName := val("full_name")
		if fullName == "" {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNumber,
				Message: "Họ và tên không được để trống",
			})
			continue
		}

		var phonePtr *string
		if p := val("phone"); p != "" {
			phonePtr = &p
		}

		var emailPtr *string
		if e := val("email"); e != "" {
			emailPtr = &e
		}

		var addressPtr *string
		if a := val("address"); a != "" {
			addressPtr = &a
		}

		var notesPtr *string
		if n := val("notes"); n != "" {
			notesPtr = &n
		}

		var sourceDetailPtr *string
		if sd := val("source_detail"); sd != "" {
			sourceDetailPtr = &sd
		}

		var dobPtr *string
		if rawDOB := val("date_of_birth"); rawDOB != "" {
			normDOB := normalizeDateString(rawDOB)
			if normDOB == "" {
				result.Failed++
				result.Errors = append(result.Errors, ImportRowError{
					Row:     rowNumber,
					Name:    fullName,
					Message: fmt.Sprintf("Ngày sinh %q không hợp lệ (hỗ trợ YYYY-MM-DD hoặc DD/MM/YYYY)", rawDOB),
				})
				continue
			}
			dobPtr = &normDOB
		}

		var genderPtr *string
		if g := val("gender"); g != "" {
			normGender := normalizeGenderString(g)
			if normGender != "" {
				genderPtr = &normGender
			}
		}

		source := normalizeLeadSource(val("source"))

		var courseIDPtr *string
		if cVal := val("interested_course"); cVal != "" {
			cTrimmed := strings.TrimSpace(cVal)
			if id, ok := courseByCode[strings.ToUpper(cTrimmed)]; ok {
				courseIDPtr = &id
			} else if id, ok := courseByName[strings.ToLower(cTrimmed)]; ok {
				courseIDPtr = &id
			} else if id, ok := courseByID[strings.ToLower(cTrimmed)]; ok {
				courseIDPtr = &id
			} else {
				// Partial match
				foundID := ""
				for cName, id := range courseByName {
					if strings.Contains(cName, strings.ToLower(cTrimmed)) || strings.Contains(strings.ToLower(cTrimmed), cName) {
						foundID = id
						break
					}
				}
				if foundID != "" {
					courseIDPtr = &foundID
				} else {
					result.Failed++
					result.Errors = append(result.Errors, ImportRowError{
						Row:     rowNumber,
						Name:    fullName,
						Message: fmt.Sprintf("Không tìm thấy khóa học phù hợp với mã/tên: %q", cVal),
					})
					continue
				}
			}
		}

		var assigneeIDPtr *string
		if aVal := val("assigned_to"); aVal != "" {
			aTrimmed := strings.TrimSpace(aVal)
			if id, ok := staffByEmail[strings.ToLower(aTrimmed)]; ok {
				assigneeIDPtr = &id
			} else if id, ok := staffByID[strings.ToLower(aTrimmed)]; ok {
				assigneeIDPtr = &id
			} else {
				result.Failed++
				result.Errors = append(result.Errors, ImportRowError{
					Row:     rowNumber,
					Name:    fullName,
					Message: fmt.Sprintf("Không tìm thấy nhân viên phụ trách với email: %q", aVal),
				})
				continue
			}
		}

		input := WriteInput{
			FullName:           fullName,
			Phone:              phonePtr,
			Email:              emailPtr,
			DateOfBirth:        dobPtr,
			Gender:             genderPtr,
			Address:            addressPtr,
			Source:             source,
			SourceDetail:       sourceDetailPtr,
			InterestedCourseID: courseIDPtr,
			Notes:              notesPtr,
			AssignedTo:         assigneeIDPtr,
		}

		_, err := s.Create(ctx, actorID, input)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNumber,
				Name:    fullName,
				Message: mapLeadErrorMessage(err),
			})
			continue
		}

		result.Imported++
	}

	return result, nil
}

func (s *Service) ImportCSV(ctx context.Context, actorID string, r io.Reader) (ImportResult, error) {
	dataBytes, err := io.ReadAll(io.LimitReader(r, 10<<20+1))
	if err != nil {
		return ImportResult{}, fmt.Errorf("read body: %w", err)
	}
	return s.ImportFileData(ctx, actorID, dataBytes)
}

func normalizeColumnHeader(header string) string {
	header = strings.TrimPrefix(header, "\ufeff")
	header = strings.TrimSpace(header)
	header = strings.ToLower(header)
	header = strings.ReplaceAll(header, "*", "")
	if idx := strings.Index(header, "("); idx != -1 {
		header = strings.TrimSpace(header[:idx])
	}
	header = strings.ReplaceAll(header, "-", "_")
	header = strings.ReplaceAll(header, " ", "_")
	header = strings.Trim(header, "_")

	switch header {
	case "ho_va_ten", "họ_và_tên", "họ_tên", "ho_ten", "full_name", "fullname", "name", "tên", "ten":
		return "full_name"
	case "so_dien_thoai", "số_điện_thoại", "sdt", "sđt", "phone", "dien_thoai", "điện_thoại":
		return "phone"
	case "email", "thu_dien_tu", "thư_điện_tử":
		return "email"
	case "khoa_hoc", "khóa_học", "khoa_hoc_quan_tam", "khóa_học_quan_tâm", "course", "interested_course", "course_code":
		return "interested_course"
	case "nguon", "nguồn", "source", "nguon_lead", "nguồn_lead":
		return "source"
	case "chi_tiet_nguon", "chi_tiết_nguồn", "source_detail":
		return "source_detail"
	case "ghi_chu", "ghi_chú", "ghi_chu_tu_van", "ghi_chú_tư_vấn", "notes", "note":
		return "notes"
	case "ngay_sinh", "ngày_sinh", "date_of_birth", "dob", "birth_date":
		return "date_of_birth"
	case "gioi_tinh", "giới_tính", "gender", "sex":
		return "gender"
	case "dia_chi", "địa_chỉ", "address":
		return "address"
	case "nhan_vien_phu_trach", "nhân_viên_phụ_trách", "nhan_vien", "nhân_viên", "assigned_to", "phu_trach", "phụ_trách", "sale":
		return "assigned_to"
	default:
		return header
	}
}

func normalizeDateString(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t.Format("2006-01-02")
	}
	if t, err := time.Parse("02/01/2006", s); err == nil {
		return t.Format("2006-01-02")
	}
	if t, err := time.Parse("2/1/2006", s); err == nil {
		return t.Format("2006-01-02")
	}
	if t, err := time.Parse("02-01-2006", s); err == nil {
		return t.Format("2006-01-02")
	}
	if t, err := time.Parse("2006/01/02", s); err == nil {
		return t.Format("2006-01-02")
	}
	return ""
}

func normalizeGenderString(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "nam", "male", "m":
		return "male"
	case "nu", "nữ", "female", "f":
		return "female"
	case "khac", "khác", "other":
		return "other"
	default:
		return ""
	}
}

func normalizeLeadSource(s string) db.LeadSource {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "facebook", "fb":
		return db.LeadSourceFacebook
	case "tiktok":
		return db.LeadSourceTiktok
	case "google", "gg":
		return db.LeadSourceGoogle
	case "zalo":
		return db.LeadSourceZalo
	case "website", "web":
		return db.LeadSourceWebsite
	case "referral", "gioi thieu", "giới thiệu":
		return db.LeadSourceReferral
	case "walk_in", "walkin", "truc tiep", "trực tiếp":
		return db.LeadSourceWalkIn
	case "event", "su kien", "sự kiện":
		return db.LeadSourceEvent
	default:
		return db.LeadSourceOther
	}
}

func mapLeadErrorMessage(err error) string {
	switch {
	case errors.Is(err, ErrEmailAlreadyExists):
		return "Email này đã được sử dụng trong hệ thống"
	case errors.Is(err, ErrInvalidAssignee):
		return "Nhân viên được gán không hợp lệ"
	default:
		return err.Error()
	}
}

func (s *Service) CheckDuplicate(ctx context.Context, phone, email, excludeIDStr string) (DuplicateCheckResponse, error) {
	phone = strings.TrimSpace(phone)
	email = strings.TrimSpace(email)
	if phone == "" && email == "" {
		return DuplicateCheckResponse{IsDuplicate: false}, nil
	}

	var excludeID pgtype.UUID
	if excludeIDStr != "" {
		parsed, err := data.UUID(excludeIDStr)
		if err == nil {
			excludeID = parsed
		}
	}

	var phoneArg pgtype.Text
	if phone != "" {
		phoneArg = pgtype.Text{String: phone, Valid: true}
	}
	var emailArg pgtype.Text
	if email != "" {
		emailArg = pgtype.Text{String: email, Valid: true}
	}

	dup, err := s.queries.FindDuplicateLead(ctx, db.FindDuplicateLeadParams{
		Phone:     phoneArg,
		Email:     emailArg,
		ExcludeID: excludeID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DuplicateCheckResponse{IsDuplicate: false}, nil
		}
		return DuplicateCheckResponse{}, fmt.Errorf("find duplicate lead: %w", err)
	}

	field := "phone"
	if phone != "" && dup.Phone.Valid && strings.EqualFold(strings.TrimSpace(dup.Phone.String), phone) {
		field = "phone"
	} else if email != "" && dup.Email.Valid && strings.EqualFold(strings.TrimSpace(dup.Email.String), email) {
		field = "email"
	}

	var assignedEmail *string
	if dup.AssignedToEmail.Valid && dup.AssignedToEmail.String != "" {
		assignedEmail = &dup.AssignedToEmail.String
	}

	var leadPhone *string
	if dup.Phone.Valid {
		leadPhone = &dup.Phone.String
	}
	var leadEmail *string
	if dup.Email.Valid {
		leadEmail = &dup.Email.String
	}

	return DuplicateCheckResponse{
		IsDuplicate:    true,
		DuplicateField: field,
		ExistingLead: &ExistingLeadSummary{
			ID:              data.UUIDString(dup.ID),
			FullName:        dup.FullName,
			Phone:           leadPhone,
			Email:           leadEmail,
			PipelineStatus:  string(dup.PipelineStatus),
			AssignedToEmail: assignedEmail,
			CreatedAt:       dup.CreatedAt.Time.UTC().Format("02/01/2006 15:04"),
		},
	}, nil
}

func (s *Service) ExportLeadsExcel(ctx context.Context, filter ListFilter) (*excelize.File, error) {
	var pipelineStatus db.NullLeadPipelineStatus
	if filter.PipelineStatus != "" {
		pipelineStatus = db.NullLeadPipelineStatus{
			LeadPipelineStatus: db.LeadPipelineStatus(filter.PipelineStatus),
			Valid:              true,
		}
	}

	var source db.NullLeadSource
	if filter.Source != "" {
		source = db.NullLeadSource{
			LeadSource: db.LeadSource(filter.Source),
			Valid:      true,
		}
	}

	var assignedTo pgtype.UUID
	if filter.AssignedTo != "" {
		parsed, err := data.UUID(filter.AssignedTo)
		if err == nil {
			assignedTo = parsed
		}
	}

	var createdFrom pgtype.Timestamptz
	if filter.CreatedFrom != "" {
		t, err := time.Parse(time.RFC3339, filter.CreatedFrom)
		if err == nil {
			createdFrom = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	var createdTo pgtype.Timestamptz
	if filter.CreatedTo != "" {
		t, err := time.Parse(time.RFC3339, filter.CreatedTo)
		if err == nil {
			createdTo = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	leadsList, err := s.queries.ListAllLeadsForExport(ctx, db.ListAllLeadsForExportParams{
		Search:         strings.TrimSpace(filter.Search),
		PipelineStatus: pipelineStatus,
		Source:         source,
		AssignedTo:     assignedTo,
		CreatedFrom:    createdFrom,
		CreatedTo:      createdTo,
	})
	if err != nil {
		return nil, fmt.Errorf("list leads for export: %w", err)
	}

	f := excelize.NewFile()
	sheetName := "Danh sách Lead"
	f.SetSheetName("Sheet1", sheetName)

	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Color: "#FFFFFF", Size: 11, Family: "Segoe UI"},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#0A2540"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
		Border: []excelize.Border{
			{Type: "top", Color: "#CCCCCC", Style: 1},
			{Type: "bottom", Color: "#CCCCCC", Style: 1},
			{Type: "left", Color: "#CCCCCC", Style: 1},
			{Type: "right", Color: "#CCCCCC", Style: 1},
		},
	})

	dataStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Size: 10, Family: "Segoe UI"},
		Alignment: &excelize.Alignment{Vertical: "center"},
		Border: []excelize.Border{
			{Type: "top", Color: "#E5E7EB", Style: 1},
			{Type: "bottom", Color: "#E5E7EB", Style: 1},
			{Type: "left", Color: "#E5E7EB", Style: 1},
			{Type: "right", Color: "#E5E7EB", Style: 1},
		},
	})

	centerStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Size: 10, Family: "Segoe UI"},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		Border: []excelize.Border{
			{Type: "top", Color: "#E5E7EB", Style: 1},
			{Type: "bottom", Color: "#E5E7EB", Style: 1},
			{Type: "left", Color: "#E5E7EB", Style: 1},
			{Type: "right", Color: "#E5E7EB", Style: 1},
		},
	})

	headers := []string{
		"STT", "Họ và tên", "Số điện thoại", "Email", "Giới tính",
		"Nguồn tiếp cận", "Khóa học quan tâm", "Trạng thái Pipeline",
		"Sale phụ trách", "Ghi chú tư vấn", "Ngày tạo",
	}

	for colIdx, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(colIdx+1, 1)
		_ = f.SetCellValue(sheetName, cell, h)
		_ = f.SetCellStyle(sheetName, cell, cell, headerStyle)
	}
	_ = f.SetRowHeight(sheetName, 1, 28)

	statusMap := map[string]string{
		"data_moi":     "Data mới",
		"knm_thue_bao": "KNM / Thuê bao",
		"goi_lai_sau":  "Gọi lại sau",
		"follow":       "Follow / Chăm sóc",
		"tu_choi":      "Từ chối",
		"da_dang_ky":   "Đã đăng ký",
		"dang_hoc":     "Đang học",
		"ket_thuc":     "Kết thúc",
	}

	sourceMap := map[string]string{
		"facebook": "Facebook",
		"tiktok":   "TikTok",
		"google":   "Google",
		"zalo":     "Zalo",
		"website":  "Website",
		"referral": "Giới thiệu",
		"walk_in":  "Đến trực tiếp",
		"event":    "Sự kiện",
		"other":    "Khác",
	}

	for rowIdx, l := range leadsList {
		row := rowIdx + 2
		stt := rowIdx + 1

		phoneStr := ""
		if l.Phone.Valid {
			phoneStr = l.Phone.String
		}
		emailStr := ""
		if l.Email.Valid {
			emailStr = l.Email.String
		}
		genderStr := ""
		if l.Gender.Valid {
			genderStr = l.Gender.String
		}
		srcStr := sourceMap[string(l.Source)]
		if srcStr == "" {
			srcStr = string(l.Source)
		}
		courseStr := ""
		if l.CourseName.Valid && l.CourseName.String != "" {
			courseStr = l.CourseName.String
		}
		statusStr := statusMap[string(l.PipelineStatus)]
		if statusStr == "" {
			statusStr = string(l.PipelineStatus)
		}
		saleStr := "Chưa phân bổ"
		if l.AssignedToEmail.Valid && l.AssignedToEmail.String != "" {
			saleStr = l.AssignedToEmail.String
		}
		notesStr := ""
		if l.Notes.Valid {
			notesStr = l.Notes.String
		}
		createdAtStr := l.CreatedAt.Time.UTC().Format("02/01/2006 15:04")

		values := []interface{}{
			stt, l.FullName, phoneStr, emailStr, genderStr,
			srcStr, courseStr, statusStr,
			saleStr, notesStr, createdAtStr,
		}

		for colIdx, v := range values {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, row)
			_ = f.SetCellValue(sheetName, cell, v)
			if colIdx == 0 || colIdx == 2 || colIdx == 4 || colIdx == 7 || colIdx == 10 {
				_ = f.SetCellStyle(sheetName, cell, cell, centerStyle)
			} else {
				_ = f.SetCellStyle(sheetName, cell, cell, dataStyle)
			}
		}
		_ = f.SetRowHeight(sheetName, row, 22)
	}

	colWidths := map[int]float64{
		1: 8, 2: 24, 3: 16, 4: 26, 5: 12,
		6: 18, 7: 24, 8: 20, 9: 26, 10: 32, 11: 20,
	}
	for col, width := range colWidths {
		colName, _ := excelize.ColumnNumberToName(col)
		_ = f.SetColWidth(sheetName, colName, colName, width)
	}

	return f, nil
}
