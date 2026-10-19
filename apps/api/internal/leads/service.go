package leads

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/audit"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/dberror"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/pagination"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

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

// Delete marks a lead as soft-deleted to ensure zero permanent data loss
func (s *Service) Delete(ctx context.Context, actorID string, isAdmin bool, leadIDValue string) error {
	leadID, err := data.UUID(leadIDValue)
	if err != nil {
		return ErrNotFound
	}

	lead, err := s.queries.GetLead(ctx, leadID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("get lead for delete: %w", err)
	}

	if !isAdmin && lead.AssignedTo.Valid && data.UUIDString(lead.AssignedTo) != actorID {
		return ErrUnauthorizedAccess
	}

	if err := s.queries.SoftDeleteLead(ctx, leadID); err != nil {
		return fmt.Errorf("soft delete lead: %w", err)
	}

	_ = audit.Write(ctx, s.queries, actorID, "lead.delete", "lead", leadID, viewFromGet(lead), nil)
	return nil
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
		ConvertedStudentID:     data.UUIDPointer(row.ConvertedStudentID),
		ConvertedStudentCode:   data.TextPointer(row.ConvertedStudentCode),
		ConvertedStudentName:   data.TextPointer(row.ConvertedStudentName),
		ConvertedStudentStatus: stringPtr(row.ConvertedStudentStatus),
		ConvertedAt:            timestamptzString(row.ConvertedAt),
		ConvertedBy:            data.UUIDPointer(row.ConvertedBy),
		CreatedBy:              data.UUIDString(row.CreatedBy),
		CreatedByEmail:         data.TextPointer(row.CreatedByEmail),
		CreatedAt:              row.CreatedAt.Time.UTC().Format(time.RFC3339),
		UpdatedAt:              row.UpdatedAt.Time.UTC().Format(time.RFC3339),
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
		ConvertedStudentID:     data.UUIDPointer(row.ConvertedStudentID),
		ConvertedStudentCode:   data.TextPointer(row.ConvertedStudentCode),
		ConvertedStudentName:   data.TextPointer(row.ConvertedStudentName),
		ConvertedStudentStatus: stringPtr(row.ConvertedStudentStatus),
		ConvertedAt:            timestamptzString(row.ConvertedAt),
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
