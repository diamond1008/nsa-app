package leads

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/audit"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

var roundRobinCounter uint64

func (s *Service) GetLeadRoutingSettings(ctx context.Context) (RoutingSettingsView, error) {
	setting, err := s.queries.GetSystemSetting(ctx, "sale_auto_assign_enabled")
	if errors.Is(err, pgx.ErrNoRows) {
		return RoutingSettingsView{AutoAssignEnabled: true}, nil
	}
	if err != nil {
		return RoutingSettingsView{AutoAssignEnabled: true}, nil
	}
	var enabled bool
	if err := json.Unmarshal(setting.Value, &enabled); err != nil {
		return RoutingSettingsView{AutoAssignEnabled: true}, nil
	}
	return RoutingSettingsView{AutoAssignEnabled: enabled}, nil
}

func (s *Service) UpdateLeadRoutingSettings(ctx context.Context, actorID string, input RoutingSettingsInput) (RoutingSettingsView, error) {
	actorUUID, _ := data.UUID(actorID)
	valBytes, _ := json.Marshal(input.AutoAssignEnabled)
	res, err := s.queries.UpsertSystemSetting(ctx, db.UpsertSystemSettingParams{
		Key:       "sale_auto_assign_enabled",
		Value:     valBytes,
		UpdatedBy: actorUUID,
	})
	if err != nil {
		return RoutingSettingsView{}, fmt.Errorf("upsert lead routing settings: %w", err)
	}
	var enabled bool
	_ = json.Unmarshal(res.Value, &enabled)
	return RoutingSettingsView{AutoAssignEnabled: enabled}, nil
}

func (s *Service) getNextRoundRobinStaff(ctx context.Context) (pgtype.UUID, error) {
	settings, _ := s.GetLeadRoutingSettings(ctx)
	if !settings.AutoAssignEnabled {
		return pgtype.UUID{}, nil
	}

	staffList, err := s.queries.ListActiveSaleStaffForRoundRobin(ctx)
	if err != nil || len(staffList) == 0 {
		return pgtype.UUID{}, nil
	}
	idx := (atomic.AddUint64(&roundRobinCounter, 1) - 1) % uint64(len(staffList))
	return staffList[idx].ID, nil
}

func (s *Service) BulkAssign(ctx context.Context, actorID string, input BulkAssignInput) (BulkAssignResult, error) {
	if len(input.LeadIDs) == 0 {
		return BulkAssignResult{}, errors.New("danh sách lead không được để trống")
	}
	assigneeUUID, err := data.UUID(input.AssigneeID)
	if err != nil {
		return BulkAssignResult{}, ErrInvalidAssignee
	}
	actorUUID, _ := data.UUID(actorID)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return BulkAssignResult{}, fmt.Errorf("begin bulk assign: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}

	var updatedCount int
	var failedCount int

	for _, idStr := range input.LeadIDs {
		leadID, err := data.UUID(idStr)
		if err != nil {
			failedCount++
			continue
		}
		existing, err := q.GetLead(ctx, leadID)
		if err != nil {
			failedCount++
			continue
		}

		_, err = q.AssignLead(ctx, db.AssignLeadParams{
			ID:         leadID,
			AssignedTo: assigneeUUID,
			AssignedAt: now,
			AssignedBy: actorUUID,
		})
		if err != nil {
			failedCount++
			continue
		}

		updated, err := q.GetLead(ctx, leadID)
		if err == nil {
			_ = audit.Write(ctx, q, actorID, "lead.bulk_assign", "lead", leadID, viewFromGet(existing), viewFromGet(updated))
		}
		updatedCount++
	}

	if err := tx.Commit(ctx); err != nil {
		return BulkAssignResult{}, fmt.Errorf("commit bulk assign: %w", err)
	}

	return BulkAssignResult{
		Updated: updatedCount,
		Failed:  failedCount,
	}, nil
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
