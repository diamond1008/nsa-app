package users

import (
	"time"
)

// UserView is the public API representation of a system user.
type UserView struct {
	ID                 string     `json:"id"`
	Email              string     `json:"email"`
	Status             string     `json:"status"`
	MustChangePassword bool       `json:"must_change_password"`
	LastLoginAt        *time.Time `json:"last_login_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	FullName           string     `json:"full_name"`
	Phone              string     `json:"phone"`
	Roles              []string   `json:"roles"`
	StudentCode        string     `json:"student_code,omitempty"`
	TeacherCode        string     `json:"teacher_code,omitempty"`
	CreatedByEmail     string     `json:"created_by_email,omitempty"`
	IsAcceptingLeads    bool       `json:"is_accepting_leads"`
	LeadAssignmentOrder int        `json:"lead_assignment_order"`
}

// AuditLogView represents an immutable change record on a user account.
type AuditLogView struct {
	ID          int64     `json:"id"`
	ActorUserID *string   `json:"actor_user_id,omitempty"`
	ActorEmail  string    `json:"actor_email"`
	ActorName   string    `json:"actor_name"`
	Action      string    `json:"action"`
	OldValues   any       `json:"old_values,omitempty"`
	NewValues   any       `json:"new_values,omitempty"`
	Reason      *string   `json:"reason,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// ListFilter specifies list and search criteria.
type ListFilter struct {
	Role    string
	Status  string
	Search  string
	Page    int
	PerPage int
}

// CreateUserInput carries payload to register a managed user account.
type CreateUserInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
	FullName string `json:"full_name"`
	Phone    string `json:"phone"`
	Status   string `json:"status"`
}

// UpdateStatusInput carries state transition details.
type UpdateStatusInput struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

// UpdateProfileInput carries profile details.
type UpdateProfileInput struct {
	FullName string `json:"full_name"`
	Phone    string `json:"phone"`
}

// ResetPasswordInput carries temporary password details.
type ResetPasswordInput struct {
	NewPassword string `json:"new_password"`
	Reason      string `json:"reason"`
}

// UpdateLeadRoutingInput carries lead distribution configuration.
type UpdateLeadRoutingInput struct {
	IsAcceptingLeads    *bool `json:"is_accepting_leads"`
	LeadAssignmentOrder *int  `json:"lead_assignment_order"`
}

// ReorderLeadRoutingInput carries ordered user IDs for priority sequence.
type ReorderLeadRoutingInput struct {
	OrderedUserIDs []string `json:"ordered_user_ids"`
}

