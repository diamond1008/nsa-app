package aiworkflows

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

var (
	ErrProposalNotFound   = errors.New("proposal not found")
	ErrProposalNotPending = errors.New("proposal is not pending")
	ErrLeadNotFound       = errors.New("lead not found")
	ErrForbidden          = errors.New("forbidden")
)

type ListParams struct {
	Domain         *string
	Status         *string
	Priority       *string
	AssignedUserID *string
	TargetLeadID   *string
	Page           int
	PerPage        int
}

type Service struct {
	pool    *pgxpool.Pool
	queries *db.Queries
	engine  *Engine
	agent   *AgentOrchestrator
}

func NewService(pool *pgxpool.Pool) *Service {
	q := db.New(pool)
	eng := NewEngine()
	return &Service{
		pool:    pool,
		queries: q,
		engine:  eng,
		agent:   NewAgentOrchestrator(pool, q, eng, slog.Default()),
	}
}

func (s *Service) Chat(ctx context.Context, claims *auth.AccessClaims, req AgentChatRequest) (AgentChatResponse, error) {
	if claims == nil {
		return AgentChatResponse{}, ErrForbidden
	}
	return s.agent.Chat(ctx, claims, req)
}

func (s *Service) isOnlySaleStaff(claims *auth.AccessClaims) bool {
	if claims == nil {
		return false
	}
	hasManagerRole := claims.HasAnyRole(auth.RoleAdmin, auth.RoleAcademicAdmin, auth.RoleSaleAdmin)
	return !hasManagerRole && claims.HasAnyRole(auth.RoleSale)
}

func (s *Service) List(ctx context.Context, claims *auth.AccessClaims, params ListParams) ([]ProposalView, int64, error) {
	var domainArg db.NullAiWorkflowDomain
	if params.Domain != nil && *params.Domain != "" {
		domainArg = db.NullAiWorkflowDomain{AiWorkflowDomain: db.AiWorkflowDomain(*params.Domain), Valid: true}
	}

	var statusArg db.NullAiProposalStatus
	if params.Status != nil && *params.Status != "" {
		statusArg = db.NullAiProposalStatus{AiProposalStatus: db.AiProposalStatus(*params.Status), Valid: true}
	}

	var priorityArg db.NullAiProposalPriority
	if params.Priority != nil && *params.Priority != "" {
		priorityArg = db.NullAiProposalPriority{AiProposalPriority: db.AiProposalPriority(*params.Priority), Valid: true}
	}

	var assignedUserUUID pgtype.UUID
	if s.isOnlySaleStaff(claims) {
		uid, err := data.UUID(claims.UserID)
		if err != nil {
			return nil, 0, ErrForbidden
		}
		assignedUserUUID = uid
	} else if params.AssignedUserID != nil && *params.AssignedUserID != "" {
		uid, err := data.UUID(*params.AssignedUserID)
		if err == nil {
			assignedUserUUID = uid
		}
	}

	var targetLeadUUID pgtype.UUID
	if params.TargetLeadID != nil && *params.TargetLeadID != "" {
		lid, err := data.UUID(*params.TargetLeadID)
		if err == nil {
			targetLeadUUID = lid
		}
	}

	limit := int32(20)
	if params.PerPage > 0 {
		limit = int32(params.PerPage)
	}
	offset := int32(0)
	if params.Page > 1 {
		offset = (int32(params.Page) - 1) * limit
	}

	rows, err := s.queries.ListAIWorkflowProposals(ctx, db.ListAIWorkflowProposalsParams{
		Domain:         domainArg,
		Status:         statusArg,
		Priority:       priorityArg,
		AssignedUserID: assignedUserUUID,
		TargetLeadID:   targetLeadUUID,
		PageLimit:      limit,
		PageOffset:     offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list proposals: %w", err)
	}

	total, err := s.queries.CountAIWorkflowProposals(ctx, db.CountAIWorkflowProposalsParams{
		Domain:         domainArg,
		Status:         statusArg,
		Priority:       priorityArg,
		AssignedUserID: assignedUserUUID,
		TargetLeadID:   targetLeadUUID,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("count proposals: %w", err)
	}

	views := make([]ProposalView, len(rows))
	for i, r := range rows {
		views[i] = mapRowToView(r)
	}

	return views, total, nil
}

func (s *Service) Get(ctx context.Context, claims *auth.AccessClaims, proposalID string) (ProposalView, error) {
	pid, err := data.UUID(proposalID)
	if err != nil {
		return ProposalView{}, ErrProposalNotFound
	}

	row, err := s.queries.GetAIWorkflowProposal(ctx, pid)
	if errors.Is(err, pgx.ErrNoRows) {
		return ProposalView{}, ErrProposalNotFound
	} else if err != nil {
		return ProposalView{}, fmt.Errorf("get proposal: %w", err)
	}

	if s.isOnlySaleStaff(claims) {
		if !row.AssignedUserID.Valid || data.UUIDString(row.AssignedUserID) != claims.UserID {
			return ProposalView{}, ErrForbidden
		}
	}

	return mapGetRowToView(row), nil
}

func (s *Service) Summary(ctx context.Context, claims *auth.AccessClaims) (SummaryStatsView, error) {
	var assignedUserUUID pgtype.UUID
	if s.isOnlySaleStaff(claims) {
		uid, err := data.UUID(claims.UserID)
		if err != nil {
			return SummaryStatsView{}, ErrForbidden
		}
		assignedUserUUID = uid
	}

	stats, err := s.queries.GetAIWorkflowSummaryStats(ctx, assignedUserUUID)
	if err != nil {
		return SummaryStatsView{}, fmt.Errorf("summary stats: %w", err)
	}

	return SummaryStatsView{
		PendingTotal:    stats.PendingTotal,
		CriticalPending: stats.CriticalPending,
		SalesPending:    stats.SalesPending,
		RevenuePending:  stats.RevenuePending,
		TrainingPending: stats.TrainingPending,
		ExecutedToday:   stats.ExecutedToday,
	}, nil
}

func (s *Service) Scan(ctx context.Context, claims *auth.AccessClaims) (ScanResultView, error) {
	if claims == nil {
		return ScanResultView{}, ErrForbidden
	}

	created, updated, err := s.engine.ScanAndGenerateProposals(ctx, s.queries, claims)
	if err != nil {
		return ScanResultView{}, fmt.Errorf("scan workflows: %w", err)
	}

	stats, _ := s.Summary(ctx, claims)

	summary := fmt.Sprintf("Quét hoàn tất: phát hiện %d đề xuất mới và cập nhật %d đề xuất hiện có.", created, updated)

	return ScanResultView{
		ScannedAt:        time.Now().UTC(),
		ProposalsCreated: created,
		ProposalsUpdated: updated,
		TotalPending:     stats.PendingTotal,
		Summary:          summary,
	}, nil
}

func (s *Service) Approve(ctx context.Context, claims *auth.AccessClaims, proposalID string, input ApproveProposalInput) (ProposalView, error) {
	pid, err := data.UUID(proposalID)
	if err != nil {
		return ProposalView{}, ErrProposalNotFound
	}
	actorUUID, err := data.UUID(claims.UserID)
	if err != nil {
		return ProposalView{}, ErrForbidden
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ProposalView{}, fmt.Errorf("begin approve proposal tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	proposal, err := q.GetAIWorkflowProposal(ctx, pid)
	if errors.Is(err, pgx.ErrNoRows) {
		return ProposalView{}, ErrProposalNotFound
	} else if err != nil {
		return ProposalView{}, fmt.Errorf("retrieve proposal for approval: %w", err)
	}

	if proposal.Status != db.AiProposalStatusPending {
		return ProposalView{}, ErrProposalNotPending
	}

	if s.isOnlySaleStaff(claims) {
		if !proposal.AssignedUserID.Valid || data.UUIDString(proposal.AssignedUserID) != claims.UserID {
			return ProposalView{}, ErrForbidden
		}
	}

	scriptToUse := proposal.SuggestedScript
	if input.SuggestedScript != nil && strings.TrimSpace(*input.SuggestedScript) != "" {
		scriptToUse = strings.TrimSpace(*input.SuggestedScript)
	}

	executionDetails := map[string]any{
		"action_type": string(proposal.ActionType),
		"approved_by": claims.UserID,
		"executed_at": time.Now().UTC().Format(time.RFC3339),
	}

	// Execute action inside transaction
	switch proposal.ActionType {
	case db.AiActionTypeAssignLead:
		if proposal.TargetLeadID.Valid {
			targetAssignee := proposal.AssignedUserID
			if input.AssignedTo != nil && *input.AssignedTo != "" {
				if parsed, err := data.UUID(*input.AssignedTo); err == nil {
					targetAssignee = parsed
				}
			}

			// Update lead assignment
			_, err = tx.Exec(ctx, `
				UPDATE leads 
				SET assigned_to = $2, assigned_at = NOW(), assigned_by = $3, updated_at = NOW() 
				WHERE id = $1 AND deleted_at IS NULL
			`, proposal.TargetLeadID, targetAssignee, actorUUID)
			if err != nil {
				return ProposalView{}, fmt.Errorf("execute assign lead: %w", err)
			}

			// Create lead task for first call
			dueAt := time.Now().Add(2 * time.Hour)
			if input.DueAt != nil && !input.DueAt.IsZero() {
				dueAt = *input.DueAt
			}
			taskRecord, err := q.CreateLeadTask(ctx, db.CreateLeadTaskParams{
				LeadID:      proposal.TargetLeadID,
				AssignedTo:  targetAssignee,
				Title:       fmt.Sprintf("Liên hệ tư vấn khách mới: %s", proposal.TargetLeadName.String),
				Description: data.Text(&scriptToUse),
				DueAt:       pgtype.Timestamptz{Time: dueAt.UTC(), Valid: true},
				CreatedBy:   actorUUID,
			})
			if err == nil {
				executionDetails["created_task_id"] = data.UUIDString(taskRecord.ID)
			}

			// Create in-app notification for the assignee
			leadURL := fmt.Sprintf("/sale/leads/%s", data.UUIDString(proposal.TargetLeadID))
			_, _ = q.CreateNotification(ctx, db.CreateNotificationParams{
				UserID:    targetAssignee,
				Title:     "Bạn được phân bổ khách hàng mới",
				Message:   fmt.Sprintf("Khách hàng %s vừa được AI phân bổ cho bạn. Vui lòng liên hệ sớm!", proposal.TargetLeadName.String),
				Type:      "lead_assigned",
				ActionUrl: data.Text(&leadURL),
			})
		}

	case db.AiActionTypeCreateFollowupTask, db.AiActionTypeFollowupPendingOrder:
		targetAssignee := proposal.AssignedUserID
		if !targetAssignee.Valid {
			targetAssignee = actorUUID
		}
		if input.AssignedTo != nil && *input.AssignedTo != "" {
			if parsed, err := data.UUID(*input.AssignedTo); err == nil {
				targetAssignee = parsed
			}
		}

		dueAt := time.Now().Add(4 * time.Hour)
		if input.DueAt != nil && !input.DueAt.IsZero() {
			dueAt = *input.DueAt
		}

		taskTitle := proposal.Title
		if proposal.ActionType == db.AiActionTypeFollowupPendingOrder && proposal.TargetOrderCode.Valid {
			customerLabel := proposal.TargetLeadName.String
			if customerLabel == "" {
				customerLabel = proposal.TargetStudentName.String
			}
			if customerLabel != "" {
				taskTitle = fmt.Sprintf("Nhắc học phí đơn %s (%s)", proposal.TargetOrderCode.String, customerLabel)
			} else {
				taskTitle = fmt.Sprintf("Nhắc học phí đơn %s", proposal.TargetOrderCode.String)
			}
		}

		if proposal.TargetLeadID.Valid {
			taskRecord, err := q.CreateLeadTask(ctx, db.CreateLeadTaskParams{
				LeadID:      proposal.TargetLeadID,
				AssignedTo:  targetAssignee,
				Title:       taskTitle,
				Description: data.Text(&scriptToUse),
				DueAt:       pgtype.Timestamptz{Time: dueAt.UTC(), Valid: true},
				CreatedBy:   actorUUID,
			})
			if err != nil {
				return ProposalView{}, fmt.Errorf("execute create followup task: %w", err)
			}
			executionDetails["created_task_id"] = data.UUIDString(taskRecord.ID)
		}

		if proposal.ActionType == db.AiActionTypeFollowupPendingOrder {
			orderURL := "/sale/phieu-dang-ky"
			notifRecord, err := q.CreateNotification(ctx, db.CreateNotificationParams{
				UserID:    targetAssignee,
				Title:     taskTitle,
				Message:   scriptToUse,
				Type:      "order_followup",
				ActionUrl: data.Text(&orderURL),
			})
			if err == nil {
				executionDetails["created_notification_id"] = data.UUIDString(notifRecord.ID)
			}
		}
	}

	execBytes, _ := json.Marshal(executionDetails)
	var noteText pgtype.Text
	if input.DecisionNote != nil {
		noteText = data.Text(input.DecisionNote)
	}

	updatedProposal, err := q.MarkAIProposalExecuted(ctx, db.MarkAIProposalExecutedParams{
		ID:              pid,
		SuggestedScript: scriptToUse,
		DecidedBy:       actorUUID,
		DecisionNote:    noteText,
		ExecutionResult: execBytes,
	})
	if err != nil {
		return ProposalView{}, fmt.Errorf("mark proposal executed: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return ProposalView{}, fmt.Errorf("commit approve tx: %w", err)
	}

	return s.Get(ctx, claims, data.UUIDString(updatedProposal.ID))
}

func (s *Service) Reject(ctx context.Context, claims *auth.AccessClaims, proposalID string, input RejectProposalInput) (ProposalView, error) {
	pid, err := data.UUID(proposalID)
	if err != nil {
		return ProposalView{}, ErrProposalNotFound
	}
	actorUUID, err := data.UUID(claims.UserID)
	if err != nil {
		return ProposalView{}, ErrForbidden
	}

	proposal, err := s.queries.GetAIWorkflowProposal(ctx, pid)
	if errors.Is(err, pgx.ErrNoRows) {
		return ProposalView{}, ErrProposalNotFound
	} else if err != nil {
		return ProposalView{}, fmt.Errorf("retrieve proposal for rejection: %w", err)
	}

	if proposal.Status != db.AiProposalStatusPending {
		return ProposalView{}, ErrProposalNotPending
	}

	if s.isOnlySaleStaff(claims) {
		if !proposal.AssignedUserID.Valid || data.UUIDString(proposal.AssignedUserID) != claims.UserID {
			return ProposalView{}, ErrForbidden
		}
	}

	var noteText pgtype.Text
	if input.DecisionNote != nil {
		noteText = data.Text(input.DecisionNote)
	}

	updated, err := s.queries.MarkAIProposalRejected(ctx, db.MarkAIProposalRejectedParams{
		ID:           pid,
		DecidedBy:    actorUUID,
		DecisionNote: noteText,
	})
	if err != nil {
		return ProposalView{}, fmt.Errorf("mark proposal rejected: %w", err)
	}

	return s.Get(ctx, claims, data.UUIDString(updated.ID))
}

func (s *Service) LeadCopilot(ctx context.Context, claims *auth.AccessClaims, leadID string) (LeadCopilotInsightView, error) {
	lid, err := data.UUID(leadID)
	if err != nil {
		return LeadCopilotInsightView{}, ErrLeadNotFound
	}

	lead, err := s.queries.GetLead(ctx, lid)
	if errors.Is(err, pgx.ErrNoRows) {
		return LeadCopilotInsightView{}, ErrLeadNotFound
	} else if err != nil {
		return LeadCopilotInsightView{}, err
	}

	if s.isOnlySaleStaff(claims) {
		if !lead.AssignedTo.Valid || data.UUIDString(lead.AssignedTo) != claims.UserID {
			return LeadCopilotInsightView{}, ErrForbidden
		}
	}

	return s.engine.BuildLeadCopilotInsight(ctx, s.queries, lid)
}

func mapRowToView(r db.ListAIWorkflowProposalsRow) ProposalView {
	var decAt *time.Time
	if r.DecidedAt.Valid {
		decAt = &r.DecidedAt.Time
	}
	var orderFinalAmount *string
	if r.TargetOrderFinalAmount.Valid {
		formatted := formatAmount(r.TargetOrderFinalAmount)
		orderFinalAmount = &formatted
	}

	return ProposalView{
		ID:                       data.UUIDString(r.ID),
		DedupKey:                 r.DedupKey,
		WorkflowCode:             r.WorkflowCode,
		Domain:                   string(r.Domain),
		Priority:                 string(r.Priority),
		Status:                   string(r.Status),
		TargetLeadID:             data.UUIDPointer(r.TargetLeadID),
		TargetLeadName:           data.TextPointer(r.TargetLeadName),
		TargetLeadPhone:          data.TextPointer(r.TargetLeadPhone),
		TargetLeadPipelineStatus: stringPointer(r.TargetLeadPipelineStatus),
		TargetOrderID:            data.UUIDPointer(r.TargetOrderID),
		TargetOrderCode:          data.TextPointer(r.TargetOrderCode),
		TargetOrderFinalAmount:   orderFinalAmount,
		TargetOrderStatus:        stringPointer(r.TargetOrderStatus),
		TargetStudentID:          data.UUIDPointer(r.TargetStudentID),
		TargetStudentCode:        data.TextPointer(r.TargetStudentCode),
		TargetStudentName:        data.TextPointer(r.TargetStudentName),
		TargetClassID:            data.UUIDPointer(r.TargetClassID),
		TargetClassCode:          data.TextPointer(r.TargetClassCode),
		TargetClassName:          data.TextPointer(r.TargetClassName),
		AssignedUserID:           data.UUIDPointer(r.AssignedUserID),
		AssignedUserName:         data.TextPointer(r.AssignedUserName),
		AssignedUserEmail:        data.TextPointer(r.AssignedUserEmail),
		Title:                    r.Title,
		BottleneckSummary:        r.BottleneckSummary,
		AiRationale:              r.AiRationale,
		SuggestedScript:          r.SuggestedScript,
		ActionType:               string(r.ActionType),
		ActionPayload:            r.ActionPayload,
		ContextSnapshot:          r.ContextSnapshot,
		DecidedBy:                data.UUIDPointer(r.DecidedBy),
		DecidedByName:            data.TextPointer(r.DecidedByName),
		DecidedByEmail:           data.TextPointer(r.DecidedByEmail),
		DecidedAt:                decAt,
		DecisionNote:             data.TextPointer(r.DecisionNote),
		ExecutionResult:          r.ExecutionResult,
		CreatedAt:                r.CreatedAt.Time,
		UpdatedAt:                r.UpdatedAt.Time,
	}
}

func mapGetRowToView(r db.GetAIWorkflowProposalRow) ProposalView {
	var decAt *time.Time
	if r.DecidedAt.Valid {
		decAt = &r.DecidedAt.Time
	}
	var orderFinalAmount *string
	if r.TargetOrderFinalAmount.Valid {
		formatted := formatAmount(r.TargetOrderFinalAmount)
		orderFinalAmount = &formatted
	}

	return ProposalView{
		ID:                       data.UUIDString(r.ID),
		DedupKey:                 r.DedupKey,
		WorkflowCode:             r.WorkflowCode,
		Domain:                   string(r.Domain),
		Priority:                 string(r.Priority),
		Status:                   string(r.Status),
		TargetLeadID:             data.UUIDPointer(r.TargetLeadID),
		TargetLeadName:           data.TextPointer(r.TargetLeadName),
		TargetLeadPhone:          data.TextPointer(r.TargetLeadPhone),
		TargetLeadPipelineStatus: stringPointer(r.TargetLeadPipelineStatus),
		TargetOrderID:            data.UUIDPointer(r.TargetOrderID),
		TargetOrderCode:          data.TextPointer(r.TargetOrderCode),
		TargetOrderFinalAmount:   orderFinalAmount,
		TargetOrderStatus:        stringPointer(r.TargetOrderStatus),
		TargetStudentID:          data.UUIDPointer(r.TargetStudentID),
		TargetStudentCode:        data.TextPointer(r.TargetStudentCode),
		TargetStudentName:        data.TextPointer(r.TargetStudentName),
		TargetClassID:            data.UUIDPointer(r.TargetClassID),
		TargetClassCode:          data.TextPointer(r.TargetClassCode),
		TargetClassName:          data.TextPointer(r.TargetClassName),
		AssignedUserID:           data.UUIDPointer(r.AssignedUserID),
		AssignedUserName:         data.TextPointer(r.AssignedUserName),
		AssignedUserEmail:        data.TextPointer(r.AssignedUserEmail),
		Title:                    r.Title,
		BottleneckSummary:        r.BottleneckSummary,
		AiRationale:              r.AiRationale,
		SuggestedScript:          r.SuggestedScript,
		ActionType:               string(r.ActionType),
		ActionPayload:            r.ActionPayload,
		ContextSnapshot:          r.ContextSnapshot,
		DecidedBy:                data.UUIDPointer(r.DecidedBy),
		DecidedByName:            data.TextPointer(r.DecidedByName),
		DecidedByEmail:           data.TextPointer(r.DecidedByEmail),
		DecidedAt:                decAt,
		DecisionNote:             data.TextPointer(r.DecisionNote),
		ExecutionResult:          r.ExecutionResult,
		CreatedAt:                r.CreatedAt.Time,
		UpdatedAt:                r.UpdatedAt.Time,
	}
}

func stringPointer(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
