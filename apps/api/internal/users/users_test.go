package users

import (
	"testing"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
)

func TestService_AllowedRolesForClaims(t *testing.T) {
	s := &Service{}

	t.Run("admin claims has all 6 roles", func(t *testing.T) {
		claims := &auth.AccessClaims{Roles: []string{auth.RoleAdmin}}
		roles := s.allowedRolesForClaims(claims)
		if len(roles) != 6 {
			t.Errorf("expected 6 roles, got %d (%v)", len(roles), roles)
		}
	})

	t.Run("academic admin has teacher and student roles only", func(t *testing.T) {
		claims := &auth.AccessClaims{Roles: []string{auth.RoleAcademicAdmin}}
		roles := s.allowedRolesForClaims(claims)
		if len(roles) != 2 {
			t.Errorf("expected 2 roles, got %d (%v)", len(roles), roles)
		}
		for _, r := range roles {
			if r != auth.RoleTeacher && r != auth.RoleStudent {
				t.Errorf("unexpected role %s for academic admin", r)
			}
		}
	})

	t.Run("sale admin has sale role only", func(t *testing.T) {
		claims := &auth.AccessClaims{Roles: []string{auth.RoleSaleAdmin}}
		roles := s.allowedRolesForClaims(claims)
		if len(roles) != 1 || roles[0] != auth.RoleSale {
			t.Errorf("expected only [SALE], got %v", roles)
		}
	})

	t.Run("unauthorized roles have nil allowed roles", func(t *testing.T) {
		claims := &auth.AccessClaims{Roles: []string{auth.RoleStudent, auth.RoleTeacher}}
		roles := s.allowedRolesForClaims(claims)
		if len(roles) != 0 {
			t.Errorf("expected 0 roles, got %v", roles)
		}
	})
}

func TestService_CanManageRole(t *testing.T) {
	s := &Service{}

	adminClaims := &auth.AccessClaims{Roles: []string{auth.RoleAdmin}}
	academicClaims := &auth.AccessClaims{Roles: []string{auth.RoleAcademicAdmin}}
	saleClaims := &auth.AccessClaims{Roles: []string{auth.RoleSaleAdmin}}

	// Admin can manage everything
	if !s.canManageRole(adminClaims, auth.RoleSale) || !s.canManageRole(adminClaims, auth.RoleTeacher) || !s.canManageRole(adminClaims, auth.RoleAdmin) {
		t.Error("admin should be able to manage all roles")
	}

	// Academic admin can manage student and teacher, but not sale or admin
	if !s.canManageRole(academicClaims, auth.RoleStudent) || !s.canManageRole(academicClaims, auth.RoleTeacher) {
		t.Error("academic admin should be able to manage STUDENT and TEACHER")
	}
	if s.canManageRole(academicClaims, auth.RoleSale) || s.canManageRole(academicClaims, auth.RoleAdmin) || s.canManageRole(academicClaims, auth.RoleSaleAdmin) {
		t.Error("academic admin must NOT manage SALE or ADMIN")
	}

	// Sale admin can only manage sale
	if !s.canManageRole(saleClaims, auth.RoleSale) {
		t.Error("sale admin should manage SALE")
	}
	if s.canManageRole(saleClaims, auth.RoleTeacher) || s.canManageRole(saleClaims, auth.RoleStudent) || s.canManageRole(saleClaims, auth.RoleAdmin) {
		t.Error("sale admin must NOT manage TEACHER, STUDENT, or ADMIN")
	}
}

func TestService_CheckUserInScope(t *testing.T) {
	s := &Service{}

	academicClaims := &auth.AccessClaims{Roles: []string{auth.RoleAcademicAdmin}}
	saleClaims := &auth.AccessClaims{Roles: []string{auth.RoleSaleAdmin}}

	// Academic admin trying to modify teacher -> OK
	if !s.checkUserInScope(academicClaims, []string{auth.RoleTeacher}) {
		t.Error("academic admin should modify teacher")
	}

	// Academic admin trying to modify admin or sale -> Forbidden
	if s.checkUserInScope(academicClaims, []string{auth.RoleAdmin}) {
		t.Error("academic admin must NOT modify admin")
	}
	if s.checkUserInScope(academicClaims, []string{auth.RoleSale}) {
		t.Error("academic admin must NOT modify sale")
	}

	// Sale admin trying to modify sale -> OK
	if !s.checkUserInScope(saleClaims, []string{auth.RoleSale}) {
		t.Error("sale admin should modify sale")
	}

	// Sale admin trying to modify teacher -> Forbidden
	if s.checkUserInScope(saleClaims, []string{auth.RoleTeacher}) {
		t.Error("sale admin must NOT modify teacher")
	}
}

func TestService_LeadRoutingAuth(t *testing.T) {
	adminClaims := &auth.AccessClaims{Roles: []string{auth.RoleAdmin}}
	saleAdminClaims := &auth.AccessClaims{Roles: []string{auth.RoleSaleAdmin}}
	saleClaims := &auth.AccessClaims{Roles: []string{auth.RoleSale}}
	academicClaims := &auth.AccessClaims{Roles: []string{auth.RoleAcademicAdmin}}

	if !adminClaims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin) {
		t.Error("admin should be authorized for lead routing")
	}
	if !saleAdminClaims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin) {
		t.Error("sale admin should be authorized for lead routing")
	}
	if saleClaims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin) {
		t.Error("sale staff should not have admin lead routing permission")
	}
	if academicClaims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin) {
		t.Error("academic admin should not manage sale lead routing")
	}
}
