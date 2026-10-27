package auth

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

// Role codes used across the API (mirror the roles table seed).
const (
	RoleAdmin         = "ADMIN"
	RoleAcademicAdmin = "ACADEMIC_ADMIN"
	RoleTeacher       = "TEACHER"
	RoleStudent       = "STUDENT"
	RoleSale          = "SALE"
	RoleSaleAdmin     = "SALE_ADMIN"
)

// IsSelf reports whether the authenticated user acts on their own account.
func IsSelf(claims *AccessClaims, userID string) bool {
	return claims != nil && claims.UserID == userID
}

// OwnsStudentProfile reports whether the student profile belongs to the
// authenticated user. Students may only access their own data.
func OwnsStudentProfile(ctx context.Context, q *db.Queries, claims *AccessClaims, studentProfileID pgtype.UUID) (bool, error) {
	if claims == nil {
		return false, nil
	}
	if claims.HasAnyRole(RoleAdmin, RoleAcademicAdmin) {
		return true, nil // administrators have approved management access
	}
	userID, err := parseUUID(claims.UserID)
	if err != nil {
		return false, fmt.Errorf("invalid claim user ID: %w", err)
	}
	owns, err := q.CheckStudentProfileOwnership(ctx, db.CheckStudentProfileOwnershipParams{ID: studentProfileID, UserID: userID})
	if err != nil {
		return false, fmt.Errorf("check student ownership: %w", err)
	}
	return owns, nil
}

// CanAccessStudentProfile reports whether the authenticated user is permitted to view the student's profile.
// Administrators and Sale Admins have full access.
// Sale staff may only view students converted from their own leads.
// Students may only access their own profile.
func CanAccessStudentProfile(ctx context.Context, q *db.Queries, claims *AccessClaims, studentProfileID pgtype.UUID) (bool, error) {
	if claims == nil {
		return false, nil
	}
	if claims.HasAnyRole(RoleAdmin, RoleAcademicAdmin, RoleSaleAdmin) {
		return true, nil
	}
	userID, err := parseUUID(claims.UserID)
	if err != nil {
		return false, fmt.Errorf("invalid claim user ID: %w", err)
	}
	if claims.HasAnyRole(RoleSale) {
		owns, err := q.CheckSaleAssignedToStudent(ctx, db.CheckSaleAssignedToStudentParams{
			ConvertedStudentID: studentProfileID,
			AssignedTo:         userID,
		})
		if err != nil {
			return false, fmt.Errorf("check sale student access: %w", err)
		}
		if owns {
			return true, nil
		}
	}
	if claims.HasAnyRole(RoleStudent) {
		return q.CheckStudentProfileOwnership(ctx, db.CheckStudentProfileOwnershipParams{
			ID:     studentProfileID,
			UserID: userID,
		})
	}
	return false, nil
}

// IsAssignedTeacher reports whether the authenticated user is a teacher
// assigned to the given class. Teachers may only act on assigned classes.
func IsAssignedTeacher(ctx context.Context, q *db.Queries, claims *AccessClaims, classID pgtype.UUID) (bool, error) {
	if claims == nil {
		return false, nil
	}
	if claims.HasAnyRole(RoleAdmin, RoleAcademicAdmin) {
		return true, nil
	}
	if !claims.HasAnyRole(RoleTeacher) {
		return false, nil
	}
	userID, err := parseUUID(claims.UserID)
	if err != nil {
		return false, fmt.Errorf("invalid claim user ID: %w", err)
	}
	assigned, err := q.CheckTeacherAssignedToClass(ctx, db.CheckTeacherAssignedToClassParams{ClassID: classID, UserID: userID})
	if err != nil {
		return false, fmt.Errorf("check teacher assignment: %w", err)
	}
	return assigned, nil
}

// CanAccessClass reports whether the authenticated user is permitted to view the class.
// Administrators and Sale Admins have full access.
// Sale staff may only view classes containing students converted from their own leads.
func CanAccessClass(ctx context.Context, q *db.Queries, claims *AccessClaims, classID pgtype.UUID) (bool, error) {
	if claims == nil {
		return false, nil
	}
	if claims.HasAnyRole(RoleAdmin, RoleAcademicAdmin, RoleSaleAdmin) {
		return true, nil
	}
	userID, err := parseUUID(claims.UserID)
	if err != nil {
		return false, fmt.Errorf("invalid claim user ID: %w", err)
	}
	if claims.HasAnyRole(RoleSale) {
		assigned, err := q.CheckSaleAssignedToClass(ctx, db.CheckSaleAssignedToClassParams{
			ClassID:    classID,
			AssignedTo: userID,
		})
		if err != nil {
			return false, fmt.Errorf("check sale class access: %w", err)
		}
		return assigned, nil
	}
	return false, nil
}
