package orders

import (
	"errors"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/pagination"
)

var (
	ErrOrderNotFound = errors.New("order not found")
	ErrInvalidStatus = errors.New("invalid order status")
)

type View struct {
	ID             string  `json:"id"`
	OrderCode      string  `json:"order_code"`
	LeadID         *string `json:"lead_id"`
	LeadName       *string `json:"lead_name,omitempty"`
	StudentID      *string `json:"student_id"`
	StudentCode    *string `json:"student_code,omitempty"`
	StudentName    *string `json:"student_name,omitempty"`
	CourseID       *string `json:"course_id"`
	CourseCode     *string `json:"course_code,omitempty"`
	CourseName     *string `json:"course_name,omitempty"`
	ClassID        *string `json:"class_id"`
	ClassCode      *string `json:"class_code,omitempty"`
	ClassName      *string `json:"class_name,omitempty"`
	Amount         float64 `json:"amount"`
	DiscountAmount float64 `json:"discount_amount"`
	FinalAmount    float64 `json:"final_amount"`
	DiscountNote   *string `json:"discount_note"`
	Status         string  `json:"status"`
	PaymentMethod  *string `json:"payment_method"`
	PaidAt         *string `json:"paid_at"`
	Notes          *string `json:"notes"`
	CreatedBy      string  `json:"created_by"`
	CreatedByEmail *string `json:"created_by_email,omitempty"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

type CreateInput struct {
	LeadID         *string
	StudentID      *string
	CourseID       *string
	ClassID        *string
	Amount         float64
	DiscountAmount float64
	DiscountNote   *string
	PaymentMethod  *string
	Notes          *string
}

type ListFilter struct {
	Status      string
	StudentID   string
	LeadID      string
	Search      string
	CreatedFrom string
	CreatedTo   string
	Page        int
	PerPage     int
}

type ListResult = pagination.Result[View]

type UpdateStatusInput struct {
	Status        string  `json:"status"`
	PaymentMethod *string `json:"payment_method,omitempty"`
	Notes         *string `json:"notes,omitempty"`
}

type MonthlyRevenue struct {
	Month        string  `json:"month"`
	TotalOrders  int64   `json:"total_orders"`
	PaidOrders   int64   `json:"paid_orders"`
	TotalRevenue float64 `json:"total_revenue"`
}

type SourceRevenue struct {
	Source      string  `json:"source"`
	TotalOrders int64   `json:"total_orders"`
	Revenue     float64 `json:"revenue"`
}

type RevenueSummary struct {
	MonthRevenue    float64 `json:"month_revenue"`
	TotalRevenue    float64 `json:"total_revenue"`
	MonthOrders     int64   `json:"month_orders"`
	MonthPaidOrders int64   `json:"month_paid_orders"`
}

type RevenueReportView struct {
	Summary  RevenueSummary   `json:"summary"`
	ByMonth  []MonthlyRevenue `json:"by_month"`
	BySource []SourceRevenue  `json:"by_source"`
}
