package auth

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestCanAccessClass_RolePrivileges(t *testing.T) {
	ctx := context.Background()
	classID := pgtype.UUID{Bytes: [16]byte{1}, Valid: true}

	t.Run("nil claims returns false", func(t *testing.T) {
		allowed, err := CanAccessClass(ctx, nil, nil, classID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if allowed {
			t.Error("expected false for nil claims")
		}
	})

	t.Run("admin has full access without db query", func(t *testing.T) {
		claims := &AccessClaims{UserID: "11111111-1111-1111-1111-111111111111", Roles: []string{RoleAdmin}}
		allowed, err := CanAccessClass(ctx, nil, claims, classID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !allowed {
			t.Error("expected true for admin")
		}
	})

	t.Run("academic admin has full access without db query", func(t *testing.T) {
		claims := &AccessClaims{UserID: "11111111-1111-1111-1111-111111111111", Roles: []string{RoleAcademicAdmin}}
		allowed, err := CanAccessClass(ctx, nil, claims, classID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !allowed {
			t.Error("expected true for academic admin")
		}
	})

	t.Run("sale admin has full access without db query", func(t *testing.T) {
		claims := &AccessClaims{UserID: "44444444-4444-4444-4444-444444444440", Roles: []string{RoleSaleAdmin}}
		allowed, err := CanAccessClass(ctx, nil, claims, classID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !allowed {
			t.Error("expected true for sale admin")
		}
	})

	t.Run("student or teacher without sale role is denied", func(t *testing.T) {
		claims := &AccessClaims{UserID: "22222222-2222-2222-2222-222222222222", Roles: []string{RoleTeacher}}
		allowed, err := CanAccessClass(ctx, nil, claims, classID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if allowed {
			t.Error("expected false for teacher role in admin class access")
		}
	})
}
