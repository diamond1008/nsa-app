package orders

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/audit"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/pagination"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
	"github.com/xuri/excelize/v2"
)

type Service struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{
		pool:    pool,
		queries: db.New(pool),
	}
}

func (s *Service) Create(ctx context.Context, actorID string, input CreateInput) (View, error) {
	actorUUID, err := data.UUID(actorID)
	if err != nil {
		return View{}, fmt.Errorf("invalid actor ID: %w", err)
	}

	var leadID pgtype.UUID
	if input.LeadID != nil && *input.LeadID != "" {
		leadID, err = data.UUID(*input.LeadID)
		if err != nil {
			return View{}, fmt.Errorf("invalid lead ID: %w", err)
		}
	}

	var studentID pgtype.UUID
	if input.StudentID != nil && *input.StudentID != "" {
		studentID, err = data.UUID(*input.StudentID)
		if err != nil {
			return View{}, fmt.Errorf("invalid student ID: %w", err)
		}
	} else if leadID.Valid {
		var convStudentID pgtype.UUID
		_ = s.pool.QueryRow(ctx, "SELECT converted_student_id FROM leads WHERE id = $1", leadID).Scan(&convStudentID)
		if convStudentID.Valid {
			studentID = convStudentID
		}
	}

	// Must be a converted student with student_id to create registration order
	if !studentID.Valid {
		return View{}, ErrLeadNotConverted
	}

	// Validate that the lead does not already have an active registration order
	if leadID.Valid {
		var existingCount int
		err := s.pool.QueryRow(ctx, `
			SELECT COUNT(1) FROM orders 
			WHERE (lead_id = $1 OR (student_id IS NOT NULL AND $2::uuid IS NOT NULL AND student_id = $2::uuid))
			  AND status NOT IN ('cancelled', 'refunded')
		`, leadID, studentID).Scan(&existingCount)
		if err == nil && existingCount > 0 {
			return View{}, ErrLeadAlreadyHasOrder
		}
	}

	var courseID pgtype.UUID
	if input.CourseID != nil && *input.CourseID != "" {
		courseID, err = data.UUID(*input.CourseID)
		if err != nil {
			return View{}, fmt.Errorf("invalid course ID: %w", err)
		}
	}

	var classID pgtype.UUID
	if input.ClassID != nil && *input.ClassID != "" {
		classID, err = data.UUID(*input.ClassID)
		if err != nil {
			return View{}, fmt.Errorf("invalid class ID: %w", err)
		}
		// Validate that the target class has not yet reached its start date
		classRow, err := s.queries.GetAdminClass(ctx, classID)
		if err != nil {
			return View{}, fmt.Errorf("read target class: %w", err)
		}
		if classRow.StartDate.Valid {
			today := time.Now().UTC().Truncate(24 * time.Hour)
			classStart := classRow.StartDate.Time.UTC().Truncate(24 * time.Hour)
			if !classStart.After(today) {
				return View{}, ErrClassAlreadyStarted
			}
		}
	}

	amountNum, err := data.Numeric(input.Amount)
	if err != nil {
		return View{}, fmt.Errorf("invalid amount: %w", err)
	}
	discountNum, err := data.Numeric(input.DiscountAmount)
	if err != nil {
		return View{}, fmt.Errorf("invalid discount amount: %w", err)
	}
	finalNum, err := data.Numeric(input.Amount - input.DiscountAmount)
	if err != nil {
		return View{}, fmt.Errorf("invalid final amount: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin create order: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	order, err := q.CreateOrder(ctx, db.CreateOrderParams{
		OrderCode:      "", // auto-generated sequence
		LeadID:         leadID,
		StudentID:      studentID,
		CourseID:       courseID,
		ClassID:        classID,
		Amount:         amountNum,
		DiscountAmount: discountNum,
		FinalAmount:    finalNum,
		DiscountNote:   data.Text(input.DiscountNote),
		Status:         db.OrderStatusPending,
		PaymentMethod:  data.Text(input.PaymentMethod),
		PaidAt:         pgtype.Timestamptz{},
		Notes:          data.Text(input.Notes),
		CreatedBy:      actorUUID,
	})
	if err != nil {
		return View{}, err
	}

	// If order is linked to a class and student, enroll the student in the class
	if classID.Valid && studentID.Valid {
		var existingEnrollmentID pgtype.UUID
		err = tx.QueryRow(ctx, "SELECT id FROM class_enrollments WHERE class_id = $1 AND student_id = $2", classID, studentID).Scan(&existingEnrollmentID)
		if err != nil && errors.Is(err, pgx.ErrNoRows) {
			_, err = q.CreateClassEnrollment(ctx, db.CreateClassEnrollmentParams{
				ClassID:   classID,
				StudentID: studentID,
				CreatedBy: actorUUID,
			})
			if err != nil {
				return View{}, fmt.Errorf("enroll student in class: %w", err)
			}
		}
	}

	getOrder, err := q.GetOrder(ctx, order.ID)
	if err != nil {
		return View{}, fmt.Errorf("read created order: %w", err)
	}

	view := viewFromGetRow(getOrder)
	if err := audit.Write(ctx, q, actorID, "order.create", "order", order.ID, nil, view); err != nil {
		return View{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit create order: %w", err)
	}

	return view, nil
}

func (s *Service) Get(ctx context.Context, orderIDValue string) (View, error) {
	orderID, err := data.UUID(orderIDValue)
	if err != nil {
		return View{}, ErrOrderNotFound
	}

	row, err := s.queries.GetOrder(ctx, orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrOrderNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get order: %w", err)
	}

	return viewFromGetRow(row), nil
}

func (s *Service) List(ctx context.Context, filter ListFilter) (ListResult, error) {
	search := strings.TrimSpace(filter.Search)

	var status db.NullOrderStatus
	if filter.Status != "" {
		status = db.NullOrderStatus{
			OrderStatus: db.OrderStatus(filter.Status),
			Valid:       true,
		}
	}

	var studentID pgtype.UUID
	if filter.StudentID != "" {
		parsed, err := data.UUID(filter.StudentID)
		if err == nil {
			studentID = parsed
		}
	}

	var leadID pgtype.UUID
	if filter.LeadID != "" {
		parsed, err := data.UUID(filter.LeadID)
		if err == nil {
			leadID = parsed
		}
	}

	var createdBy pgtype.UUID
	if filter.CreatedBy != "" {
		parsed, err := data.UUID(filter.CreatedBy)
		if err == nil {
			createdBy = parsed
		}
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

	page := filter.Page
	if page < 1 {
		page = 1
	}
	perPage := filter.PerPage
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}
	offset := (page - 1) * perPage

	rows, err := s.queries.ListOrders(ctx, db.ListOrdersParams{
		Search:      search,
		Status:      status,
		StudentID:   studentID,
		LeadID:      leadID,
		CreatedBy:   createdBy,
		CreatedFrom: createdFrom,
		CreatedTo:   createdTo,
		PageOffset:  int32(offset),
		PageLimit:   int32(perPage),
	})
	if err != nil {
		return pagination.Result[View]{}, fmt.Errorf("list orders: %w", err)
	}

	total, err := s.queries.CountOrders(ctx, db.CountOrdersParams{
		Search:      search,
		Status:      status,
		StudentID:   studentID,
		LeadID:      leadID,
		CreatedBy:   createdBy,
		CreatedFrom: createdFrom,
		CreatedTo:   createdTo,
	})
	if err != nil {
		return pagination.Result[View]{}, fmt.Errorf("count orders: %w", err)
	}

	items := make([]View, 0, len(rows))
	for _, row := range rows {
		items = append(items, viewFromListRow(row))
	}

	return pagination.New(items, page, perPage, total), nil
}

func (s *Service) UpdateStatus(ctx context.Context, actorID string, orderIDValue string, input UpdateStatusInput) (View, error) {
	orderID, err := data.UUID(orderIDValue)
	if err != nil {
		return View{}, ErrOrderNotFound
	}

	targetStatus := db.OrderStatus(input.Status)
	if !isValidOrderStatus(targetStatus) {
		return View{}, ErrInvalidStatus
	}

	existing, err := s.queries.GetOrder(ctx, orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrOrderNotFound
	}
	if err != nil {
		return View{}, fmt.Errorf("get order for status update: %w", err)
	}

	actorUUID, err := data.UUID(actorID)
	if err != nil {
		return View{}, fmt.Errorf("invalid actor ID: %w", err)
	}

	claims, _ := auth.ClaimsFrom(ctx)
	isManager := claims != nil && claims.HasAnyRole(auth.RoleAdmin, "SALE_ADMIN", "ACADEMIC_ADMIN")
	if !isManager && existing.CreatedBy != actorUUID {
		return View{}, ErrForbiddenOrderAccess
	}

	var paidAt pgtype.Timestamptz
	if targetStatus == db.OrderStatusPaid {
		paidAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	} else if existing.PaidAt.Valid {
		paidAt = existing.PaidAt
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return View{}, fmt.Errorf("begin update order status: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := s.queries.WithTx(tx)

	_, err = q.UpdateOrderStatus(ctx, db.UpdateOrderStatusParams{
		ID:            orderID,
		Status:        targetStatus,
		PaidAt:        paidAt,
		PaymentMethod: data.Text(input.PaymentMethod),
		Notes:         data.Text(input.Notes),
	})
	if err != nil {
		return View{}, err
	}

	updated, err := q.GetOrder(ctx, orderID)
	if err != nil {
		return View{}, fmt.Errorf("read updated order: %w", err)
	}

	view := viewFromGetRow(updated)
	if err := audit.Write(ctx, q, actorID, "order.update_status", "order", orderID, viewFromGetRow(existing), view); err != nil {
		return View{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return View{}, fmt.Errorf("commit update order status: %w", err)
	}

	return view, nil
}

func (s *Service) RevenueReport(ctx context.Context) (RevenueReportView, error) {
	summaryRow, err := s.queries.GetRevenueSummary(ctx)
	if err != nil {
		return RevenueReportView{}, fmt.Errorf("get revenue summary: %w", err)
	}

	monthlyRows, err := s.queries.GetRevenueByMonth(ctx)
	if err != nil {
		return RevenueReportView{}, fmt.Errorf("get revenue by month: %w", err)
	}

	sourceRows, err := s.queries.GetRevenueBySource(ctx)
	if err != nil {
		return RevenueReportView{}, fmt.Errorf("get revenue by source: %w", err)
	}

	byMonth := make([]MonthlyRevenue, 0, len(monthlyRows))
	for _, m := range monthlyRows {
		byMonth = append(byMonth, MonthlyRevenue{
			Month:        m.Month,
			TotalOrders:  m.TotalOrders,
			PaidOrders:   m.PaidOrders,
			TotalRevenue: data.NumericFloat(m.TotalRevenue),
		})
	}

	bySource := make([]SourceRevenue, 0, len(sourceRows))
	for _, sr := range sourceRows {
		bySource = append(bySource, SourceRevenue{
			Source:      string(sr.Source),
			TotalOrders: sr.TotalOrders,
			Revenue:     data.NumericFloat(sr.Revenue),
		})
	}

	return RevenueReportView{
		Summary: RevenueSummary{
			MonthRevenue:    data.NumericFloat(summaryRow.MonthRevenue),
			TotalRevenue:    data.NumericFloat(summaryRow.TotalRevenue),
			MonthOrders:     summaryRow.MonthOrders,
			MonthPaidOrders: summaryRow.MonthPaidOrders,
		},
		ByMonth:  byMonth,
		BySource: bySource,
	}, nil
}

func viewFromGetRow(r db.GetOrderRow) View {
	var paidAt *string
	if r.PaidAt.Valid {
		s := r.PaidAt.Time.UTC().Format(time.RFC3339)
		paidAt = &s
	}

	return View{
		ID:             data.UUIDString(r.ID),
		OrderCode:      r.OrderCode,
		LeadID:         data.UUIDPointer(r.LeadID),
		LeadName:       data.TextPointer(r.LeadName),
		StudentID:      data.UUIDPointer(r.StudentID),
		StudentCode:    data.TextPointer(r.StudentCode),
		StudentName:    data.TextPointer(r.StudentName),
		CourseID:       data.UUIDPointer(r.CourseID),
		CourseCode:     data.TextPointer(r.CourseCode),
		CourseName:     data.TextPointer(r.CourseName),
		ClassID:        data.UUIDPointer(r.ClassID),
		ClassCode:      data.TextPointer(r.ClassCode),
		ClassName:      data.TextPointer(r.ClassName),
		Amount:         data.NumericFloat(r.Amount),
		DiscountAmount: data.NumericFloat(r.DiscountAmount),
		FinalAmount:    data.NumericFloat(r.FinalAmount),
		DiscountNote:   data.TextPointer(r.DiscountNote),
		Status:         string(r.Status),
		PaymentMethod:  data.TextPointer(r.PaymentMethod),
		PaidAt:         paidAt,
		Notes:          data.TextPointer(r.Notes),
		CreatedBy:      data.UUIDString(r.CreatedBy),
		CreatedByEmail: data.TextPointer(r.CreatedByEmail),
		CreatedAt:      r.CreatedAt.Time.UTC().Format(time.RFC3339),
		UpdatedAt:      r.UpdatedAt.Time.UTC().Format(time.RFC3339),
	}
}

func viewFromListRow(r db.ListOrdersRow) View {
	var paidAt *string
	if r.PaidAt.Valid {
		s := r.PaidAt.Time.UTC().Format(time.RFC3339)
		paidAt = &s
	}

	return View{
		ID:             data.UUIDString(r.ID),
		OrderCode:      r.OrderCode,
		LeadID:         data.UUIDPointer(r.LeadID),
		LeadName:       data.TextPointer(r.LeadName),
		StudentID:      data.UUIDPointer(r.StudentID),
		StudentCode:    data.TextPointer(r.StudentCode),
		StudentName:    data.TextPointer(r.StudentName),
		CourseID:       data.UUIDPointer(r.CourseID),
		CourseCode:     data.TextPointer(r.CourseCode),
		CourseName:     data.TextPointer(r.CourseName),
		ClassID:        data.UUIDPointer(r.ClassID),
		ClassCode:      data.TextPointer(r.ClassCode),
		ClassName:      data.TextPointer(r.ClassName),
		Amount:         data.NumericFloat(r.Amount),
		DiscountAmount: data.NumericFloat(r.DiscountAmount),
		FinalAmount:    data.NumericFloat(r.FinalAmount),
		DiscountNote:   data.TextPointer(r.DiscountNote),
		Status:         string(r.Status),
		PaymentMethod:  data.TextPointer(r.PaymentMethod),
		PaidAt:         paidAt,
		Notes:          data.TextPointer(r.Notes),
		CreatedBy:      data.UUIDString(r.CreatedBy),
		CreatedByEmail: data.TextPointer(r.CreatedByEmail),
		CreatedAt:      r.CreatedAt.Time.UTC().Format(time.RFC3339),
		UpdatedAt:      r.UpdatedAt.Time.UTC().Format(time.RFC3339),
	}
}

func isValidOrderStatus(s db.OrderStatus) bool {
	switch s {
	case db.OrderStatusPending,
		db.OrderStatusPaid,
		db.OrderStatusCancelled,
		db.OrderStatusRefunded:
		return true
	default:
		return false
	}
}

func (s *Service) ExportOrdersExcel(ctx context.Context, filter ListFilter) (*excelize.File, error) {
	var status db.NullOrderStatus
	if filter.Status != "" {
		status = db.NullOrderStatus{
			OrderStatus: db.OrderStatus(filter.Status),
			Valid:       true,
		}
	}

	var studentID pgtype.UUID
	if filter.StudentID != "" {
		parsed, err := data.UUID(filter.StudentID)
		if err == nil {
			studentID = parsed
		}
	}

	var leadID pgtype.UUID
	if filter.LeadID != "" {
		parsed, err := data.UUID(filter.LeadID)
		if err == nil {
			leadID = parsed
		}
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

	ordersList, err := s.queries.ListAllOrdersForExport(ctx, db.ListAllOrdersForExportParams{
		Search:      strings.TrimSpace(filter.Search),
		Status:      status,
		StudentID:   studentID,
		LeadID:      leadID,
		CreatedFrom: createdFrom,
		CreatedTo:   createdTo,
	})
	if err != nil {
		return nil, fmt.Errorf("list orders for export: %w", err)
	}

	f := excelize.NewFile()
	sheetName := "Danh sách Đơn hàng"
	f.SetSheetName("Sheet1", sheetName)

	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "#FFFFFF", Size: 11, Family: "Segoe UI"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#0A2540"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
		Border: []excelize.Border{
			{Type: "top", Color: "#CCCCCC", Style: 1},
			{Type: "bottom", Color: "#CCCCCC", Style: 1},
			{Type: "left", Color: "#CCCCCC", Style: 1},
			{Type: "right", Color: "#CCCCCC", Style: 1},
		},
	})

	dataStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Size: 10, Family: "Segoe UI"},
		Alignment: &excelize.Alignment{Vertical: "center"},
		Border: []excelize.Border{
			{Type: "top", Color: "#E5E7EB", Style: 1},
			{Type: "bottom", Color: "#E5E7EB", Style: 1},
			{Type: "left", Color: "#E5E7EB", Style: 1},
			{Type: "right", Color: "#E5E7EB", Style: 1},
		},
	})

	centerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Size: 10, Family: "Segoe UI"},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		Border: []excelize.Border{
			{Type: "top", Color: "#E5E7EB", Style: 1},
			{Type: "bottom", Color: "#E5E7EB", Style: 1},
			{Type: "left", Color: "#E5E7EB", Style: 1},
			{Type: "right", Color: "#E5E7EB", Style: 1},
		},
	})

	currencyFormat := "#,##0 ₫"
	currencyStyle, _ := f.NewStyle(&excelize.Style{
		Font:         &excelize.Font{Size: 10, Family: "Segoe UI"},
		Alignment:    &excelize.Alignment{Horizontal: "right", Vertical: "center"},
		CustomNumFmt: &currencyFormat,
		Border: []excelize.Border{
			{Type: "top", Color: "#E5E7EB", Style: 1},
			{Type: "bottom", Color: "#E5E7EB", Style: 1},
			{Type: "left", Color: "#E5E7EB", Style: 1},
			{Type: "right", Color: "#E5E7EB", Style: 1},
		},
	})

	headers := []string{
		"STT", "Mã đơn hàng", "Khách hàng / Học viên", "Mã học viên", "Khóa học",
		"Lớp học", "Học phí gốc", "Giảm giá", "Thành tiền", "Trạng thái",
		"Phương thức TT", "Ngày thanh toán", "Người tạo", "Ngày tạo",
	}

	for colIdx, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(colIdx+1, 1)
		_ = f.SetCellValue(sheetName, cell, h)
		_ = f.SetCellStyle(sheetName, cell, cell, headerStyle)
	}
	_ = f.SetRowHeight(sheetName, 1, 28)

	statusMap := map[string]string{
		"pending":   "Chờ thanh toán",
		"paid":      "Đã thanh toán",
		"cancelled": "Đã hủy",
		"refunded":  "Hoàn tiền",
	}

	methodMap := map[string]string{
		"transfer": "Chuyển khoản",
		"cash":     "Tiền mặt",
		"card":     "Thẻ ngân hàng",
		"other":    "Khác",
	}

	for rowIdx, o := range ordersList {
		row := rowIdx + 2
		stt := rowIdx + 1

		customerName := ""
		if o.StudentName.Valid && o.StudentName.String != "" {
			customerName = o.StudentName.String
		} else if o.LeadName.Valid && o.LeadName.String != "" {
			customerName = o.LeadName.String
		}

		studentCode := ""
		if o.StudentCode.Valid {
			studentCode = o.StudentCode.String
		}

		courseName := ""
		if o.CourseName.Valid {
			courseName = o.CourseName.String
		}

		className := ""
		if o.ClassName.Valid {
			className = o.ClassName.String
		}

		amount := data.NumericFloat(o.Amount)
		discount := data.NumericFloat(o.DiscountAmount)
		finalAmount := data.NumericFloat(o.FinalAmount)

		statusStr := statusMap[string(o.Status)]
		if statusStr == "" {
			statusStr = string(o.Status)
		}

		methodStr := ""
		if o.PaymentMethod.Valid {
			methodStr = methodMap[o.PaymentMethod.String]
			if methodStr == "" {
				methodStr = o.PaymentMethod.String
			}
		}

		paidAtStr := ""
		if o.PaidAt.Valid {
			paidAtStr = o.PaidAt.Time.UTC().Format("02/01/2006 15:04")
		}

		createdByStr := ""
		if o.CreatedByEmail.Valid {
			createdByStr = o.CreatedByEmail.String
		}

		createdAtStr := o.CreatedAt.Time.UTC().Format("02/01/2006 15:04")

		values := []interface{}{
			stt, o.OrderCode, customerName, studentCode, courseName,
			className, amount, discount, finalAmount, statusStr,
			methodStr, paidAtStr, createdByStr, createdAtStr,
		}

		for colIdx, v := range values {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, row)
			_ = f.SetCellValue(sheetName, cell, v)
			if colIdx == 0 || colIdx == 1 || colIdx == 3 || colIdx == 9 || colIdx == 10 || colIdx == 11 || colIdx == 13 {
				_ = f.SetCellStyle(sheetName, cell, cell, centerStyle)
			} else if colIdx == 6 || colIdx == 7 || colIdx == 8 {
				_ = f.SetCellStyle(sheetName, cell, cell, currencyStyle)
			} else {
				_ = f.SetCellStyle(sheetName, cell, cell, dataStyle)
			}
		}
		_ = f.SetRowHeight(sheetName, row, 22)
	}

	colWidths := map[int]float64{
		1: 8, 2: 18, 3: 24, 4: 16, 5: 22,
		6: 20, 7: 16, 8: 16, 9: 18, 10: 18,
		11: 18, 12: 20, 13: 24, 14: 20,
	}
	for col, width := range colWidths {
		colName, _ := excelize.ColumnNumberToName(col)
		_ = f.SetColWidth(sheetName, colName, colName, width)
	}

	return f, nil
}

func (s *Service) Delete(ctx context.Context, actorID string, orderIDValue string) error {
	orderID, err := data.UUID(orderIDValue)
	if err != nil {
		return errors.New("invalid order ID")
	}
	order, err := s.queries.GetOrder(ctx, orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("order not found")
	}
	if err != nil {
		return fmt.Errorf("get order for delete: %w", err)
	}

	if err := s.queries.SoftDeleteOrder(ctx, orderID); err != nil {
		return fmt.Errorf("soft delete order: %w", err)
	}

	_ = audit.Write(ctx, s.queries, actorID, "order.delete", "order", orderID, viewFromGetRow(order), nil)
	return nil
}
