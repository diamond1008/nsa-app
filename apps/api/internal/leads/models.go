package leads

import (
	"errors"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/pagination"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

var (
	ErrNotFound                = errors.New("lead not found")
	ErrAlreadyConverted        = errors.New("lead is already converted")
	ErrClassFull               = errors.New("class capacity exceeded")
	ErrClassNotFound           = errors.New("class not found or not active")
	ErrInvalidStatusTransition = errors.New("invalid pipeline status")
	ErrUnauthorizedAccess      = errors.New("unauthorized access to lead")
	ErrInvalidAssignee         = errors.New("invalid assignee user")
	ErrEmailAlreadyExists      = errors.New("email already exists")
	ErrInvalidCSV              = errors.New("invalid CSV content")
	ErrLeadLocked              = errors.New("hồ sơ học viên đã được khóa thông tin định danh, chỉ được phép cập nhật ghi chú")
)

// View represents the full JSON view of a Lead.
type View struct {
	ID                     string  `json:"id"`
	FullName               string  `json:"full_name"`
	Phone                  *string `json:"phone"`
	Email                  *string `json:"email"`
	DateOfBirth            *string `json:"date_of_birth"`
	Gender                 *string `json:"gender"`
	Address                *string `json:"address"`
	Source                 string  `json:"source"`
	SourceDetail           *string `json:"source_detail"`
	UTMSource              *string `json:"utm_source"`
	UTMMedium              *string `json:"utm_medium"`
	UTMCampaign            *string `json:"utm_campaign"`
	UTMContent             *string `json:"utm_content"`
	UTMTerm                *string `json:"utm_term"`
	InterestedCourseID     *string `json:"interested_course_id"`
	InterestedCourseCode   *string `json:"interested_course_code"`
	InterestedCourseName   *string `json:"interested_course_name"`
	Notes                  *string `json:"notes"`
	PipelineStatus         string  `json:"pipeline_status"`
	AssignedTo             *string `json:"assigned_to"`
	AssignedToEmail        *string `json:"assigned_to_email"`
	AssignedAt             *string `json:"assigned_at"`
	AssignedBy             *string `json:"assigned_by"`
	AssignedByEmail        *string `json:"assigned_by_email"`
	ConvertedStudentID     *string `json:"converted_student_id"`
	ConvertedStudentCode   *string `json:"converted_student_code"`
	ConvertedStudentName   *string `json:"converted_student_name"`
	ConvertedStudentStatus *string `json:"converted_student_status,omitempty"`
	ConvertedAt            *string `json:"converted_at"`
	ConvertedBy            *string `json:"converted_by"`
	CreatedBy              string  `json:"created_by"`
	CreatedByEmail         *string `json:"created_by_email"`
	CreatedAt              string  `json:"created_at"`
	UpdatedAt              string  `json:"updated_at"`
}

// WriteInput holds data for creating or updating a Lead.
type WriteInput struct {
	FullName           string
	Phone              *string
	Email              *string
	DateOfBirth        *string
	Gender             *string
	Address            *string
	Source             db.LeadSource
	SourceDetail       *string
	UTMSource          *string
	UTMMedium          *string
	UTMCampaign        *string
	UTMContent         *string
	UTMTerm            *string
	InterestedCourseID *string
	Notes              *string
	AssignedTo         *string
}

// ListFilter provides query parameters for listing leads.
type ListFilter struct {
	Search           string
	PipelineStatus   string
	Source           string
	AssignedTo       string
	CreatedFrom      string
	CreatedTo        string
	SortBy           string
	SortOrder        string
	Page             int
	PerPage          int
	UnregisteredOnly bool
	ConvertedOnly    bool
}

// ListResult is the paginated response for leads.
type ListResult = pagination.Result[View]

// AssignInput is payload for assigning a lead to a sale person.
type AssignInput struct {
	AssignedTo string `json:"assigned_to"`
}

// StatusInput is payload for transitioning lead status.
type StatusInput struct {
	PipelineStatus string `json:"pipeline_status"`
	Reason         string `json:"reason"`
}

// ConvertInput defines parameters for 1-Click Convert.
type ConvertInput struct {
	ClassID        string
	Amount         float64
	DiscountAmount float64
	DiscountNote   string
	PaymentMethod  string
	Notes          string
	Password       string
	Email          string
	FullName       string
	Phone          string
}

// ConvertResult contains the generated entities after conversion.
type ConvertResult struct {
	StudentID       string `json:"student_id"`
	StudentCode     string `json:"student_code"`
	OrderID         string `json:"order_id"`
	OrderCode       string `json:"order_code"`
	InitialPassword string `json:"initial_password"`
}

// SaleStaffView represents a staff user for assignment selection.
type SaleStaffView struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

// ActionAlerts captures items requiring immediate manager/team action.
type ActionAlerts struct {
	UnassignedLeads int64 `json:"unassigned_leads"`
	OverdueTasks    int64 `json:"overdue_tasks"`
	PendingOrders   int64 `json:"pending_orders"`
}

// DailyLeadTrendPoint captures daily new leads and converted leads.
type DailyLeadTrendPoint struct {
	Day            string `json:"day"`
	TotalLeads     int64  `json:"total_leads"`
	ConvertedLeads int64  `json:"converted_leads"`
}

// DashboardOverviewView aggregates CRM data for managers.
type DashboardOverviewView struct {
	ByStatus       map[string]int64      `json:"by_status"`
	BySource       map[string]int64      `json:"by_source"`
	ByAssignee     []AssigneeStat        `json:"by_assignee"`
	Alerts         ActionAlerts          `json:"alerts"`
	DailyLeadTrend []DailyLeadTrendPoint `json:"daily_lead_trend"`
}

// AssigneeStat captures lead stats for an individual salesperson.
type AssigneeStat struct {
	UserID         string  `json:"user_id"`
	Email          string  `json:"email"`
	TotalLeads     int64   `json:"total_leads"`
	ConvertedLeads int64   `json:"converted_leads"`
	MonthRevenue   float64 `json:"month_revenue"`
}

// SaleDashboardStats captures personal stats for a salesperson.
type SaleDashboardStats struct {
	AssignedLeads      int64   `json:"assigned_leads"`
	NewLeadsToday      int64   `json:"new_leads_today"`
	OverdueTasks       int64   `json:"overdue_tasks"`
	TodayTasks         int64   `json:"today_tasks"`
	ConvertedThisMonth int64   `json:"converted_this_month"`
	TotalThisMonth     int64   `json:"total_this_month"`
	ConversionRate     float64 `json:"conversion_rate"`
	MonthRevenue       float64 `json:"month_revenue"`
	TeamMonthRevenue   float64 `json:"team_month_revenue"`
}

// ImportRowError records an error for a specific row during CSV import.
type ImportRowError struct {
	Row     int    `json:"row"`
	Name    string `json:"name,omitempty"`
	Message string `json:"message"`
}

// ImportResult summarizes the batch import outcome.
type ImportResult struct {
	Imported int              `json:"imported"`
	Failed   int              `json:"failed"`
	Errors   []ImportRowError `json:"errors"`
}

// DuplicateCheckResponse returns information when checking if a lead phone/email is duplicate.
type DuplicateCheckResponse struct {
	IsDuplicate    bool                 `json:"is_duplicate"`
	DuplicateField string               `json:"duplicate_field,omitempty"`
	ExistingLead   *ExistingLeadSummary `json:"existing_lead,omitempty"`
}

// ExistingLeadSummary provides a short preview of the duplicate lead.
type ExistingLeadSummary struct {
	ID              string  `json:"id"`
	FullName        string  `json:"full_name"`
	Phone           *string `json:"phone,omitempty"`
	Email           *string `json:"email,omitempty"`
	PipelineStatus  string  `json:"pipeline_status"`
	AssignedToEmail *string `json:"assigned_to_email,omitempty"`
	CreatedAt       string  `json:"created_at"`
}
