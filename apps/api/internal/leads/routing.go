package leads

import (
	"context"
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
