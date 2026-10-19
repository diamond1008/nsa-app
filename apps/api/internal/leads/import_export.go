package leads

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/xuri/excelize/v2"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

func GenerateTemplateExcel() ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	sheet := "MauNhapLead"
	index, err := f.NewSheet(sheet)
	if err != nil {
		return nil, fmt.Errorf("create sheet: %w", err)
	}
	f.SetActiveSheet(index)
	_ = f.DeleteSheet("Sheet1")

	headers := []interface{}{
		"Họ và tên *",
		"Số điện thoại",
		"Email",
		"Khóa học quan tâm",
		"Nguồn lead",
		"Ghi chú tư vấn",
		"Ngày sinh (DD/MM/YYYY)",
		"Giới tính (Nam/Nữ)",
		"Địa chỉ",
		"Nhân viên phụ trách",
	}
	if err := f.SetSheetRow(sheet, "A1", &headers); err != nil {
		return nil, fmt.Errorf("write headers: %w", err)
	}

	sample1 := []interface{}{
		"Trần Văn An", "0901234567", "tranvanan@example.com", "AUTO-EV-HYBRID", "facebook",
		"Quan tâm khóa kỹ thuật xe điện & Hybrid", "15/05/1998", "Nam", "Hà Nội", "sale@nsa.local",
	}
	sample2 := []interface{}{
		"Nguyễn Thị Mai", "0912345678", "mainguyen@example.com", "AUTO-ELEC-PRO", "tiktok",
		"Tư vấn lịch học thực hành buổi tối", "20/10/2001", "Nữ", "TP. Hồ Chí Minh", "sale2@nsa.local",
	}
	sample3 := []interface{}{
		"Lê Quốc Huy", "0987654321", "huy.le@example.com", "AUTO-ENG-EFI", "zalo",
		"Muốn bổ túc chẩn đoán động cơ GDI", "08/12/1995", "Nam", "Đà Nẵng", "",
	}
	_ = f.SetSheetRow(sheet, "A2", &sample1)
	_ = f.SetSheetRow(sheet, "A3", &sample2)
	_ = f.SetSheetRow(sheet, "A4", &sample3)

	headerStyle, err := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{
			Bold:  true,
			Color: "#FFFFFF",
			Size:  11,
		},
		Fill: excelize.Fill{
			Type:    "pattern",
			Color:   []string{"#0A2540"},
			Pattern: 1,
		},
		Alignment: &excelize.Alignment{
			Horizontal: "center",
			Vertical:   "center",
			WrapText:   true,
		},
	})
	if err == nil {
		_ = f.SetCellStyle(sheet, "A1", "J1", headerStyle)
	}
	_ = f.SetRowHeight(sheet, 1, 30)

	colWidths := map[string]float64{
		"A": 22,
		"B": 16,
		"C": 26,
		"D": 22,
		"E": 15,
		"F": 38,
		"G": 22,
		"H": 18,
		"I": 24,
		"J": 26,
	}
	for col, width := range colWidths {
		_ = f.SetColWidth(sheet, col, col, width)
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("write buffer: %w", err)
	}
	return buf.Bytes(), nil
}

func parseRowsFromData(dataBytes []byte) ([][]string, error) {
	if len(dataBytes) >= 4 && dataBytes[0] == 0x50 && dataBytes[1] == 0x4B && dataBytes[2] == 0x03 && dataBytes[3] == 0x04 {
		// XLSX format
		f, err := excelize.OpenReader(bytes.NewReader(dataBytes))
		if err != nil {
			return nil, fmt.Errorf("không thể đọc file Excel (.xlsx): %w", err)
		}
		defer f.Close()

		sheets := f.GetSheetList()
		if len(sheets) == 0 {
			return nil, errors.New("file Excel không có trang tính (sheet) nào")
		}
		rows, err := f.GetRows(sheets[0])
		if err != nil {
			return nil, fmt.Errorf("lỗi đọc sheet %s: %w", sheets[0], err)
		}
		return rows, nil
	}

	// CSV format fallback
	firstLine := string(dataBytes)
	if idx := strings.IndexAny(firstLine, "\r\n"); idx != -1 {
		firstLine = firstLine[:idx]
	}
	commaCount := strings.Count(firstLine, ",")
	semicolonCount := strings.Count(firstLine, ";")

	reader := csv.NewReader(bytes.NewReader(dataBytes))
	reader.TrimLeadingSpace = true
	reader.FieldsPerRecord = -1
	if semicolonCount > commaCount {
		reader.Comma = ';'
	}

	rows, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("lỗi đọc file CSV: %w", err)
	}
	return rows, nil
}

func (s *Service) ImportFileData(ctx context.Context, actorID string, dataBytes []byte) (ImportResult, error) {
	if len(dataBytes) == 0 {
		return ImportResult{}, fmt.Errorf("%w: file tải lên bị trống", ErrInvalidCSV)
	}
	if len(dataBytes) > 10<<20 {
		return ImportResult{}, fmt.Errorf("%w: dung lượng file vượt quá giới hạn 10MB", ErrInvalidCSV)
	}

	rows, err := parseRowsFromData(dataBytes)
	if err != nil {
		return ImportResult{}, fmt.Errorf("%w: %v", ErrInvalidCSV, err)
	}
	if len(rows) == 0 {
		return ImportResult{}, fmt.Errorf("%w: file không chứa dữ liệu", ErrInvalidCSV)
	}

	header := rows[0]
	columns := make(map[string]int, len(header))
	for index, name := range header {
		normalized := normalizeColumnHeader(name)
		if normalized != "" {
			columns[normalized] = index
		}
	}

	if _, ok := columns["full_name"]; !ok {
		return ImportResult{}, fmt.Errorf("%w: Cột Họ và tên (Họ và tên hoặc full_name) là bắt buộc", ErrInvalidCSV)
	}

	// Pre-load courses for quick mapping
	courseList, err := s.queries.ListCourses(ctx, db.ListCoursesParams{
		PageLimit: 500,
	})
	if err != nil {
		return ImportResult{}, fmt.Errorf("load courses: %w", err)
	}
	courseByCode := make(map[string]string)
	courseByName := make(map[string]string)
	courseByID := make(map[string]string)
	for _, c := range courseList {
		idStr := data.UUIDString(c.ID)
		courseByCode[strings.ToUpper(strings.TrimSpace(c.Code))] = idStr
		courseByName[strings.ToLower(strings.TrimSpace(c.Name))] = idStr
		courseByID[strings.ToLower(idStr)] = idStr
	}

	// Pre-load staff for quick mapping
	staffList, err := s.ListSaleStaff(ctx)
	if err != nil {
		return ImportResult{}, fmt.Errorf("load sale staff: %w", err)
	}
	staffByEmail := make(map[string]string)
	staffByID := make(map[string]string)
	for _, st := range staffList {
		staffByEmail[strings.ToLower(strings.TrimSpace(st.Email))] = st.ID
		staffByID[strings.ToLower(strings.TrimSpace(st.ID))] = st.ID
	}

	result := ImportResult{Errors: make([]ImportRowError, 0)}

	for idx, record := range rows[1:] {
		rowNumber := idx + 2
		if rowNumber > 501 {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNumber,
				Message: "Mỗi lần chỉ được nhập tối đa 500 dòng",
			})
			break
		}

		// Skip completely empty rows
		isEmpty := true
		for _, cell := range record {
			if strings.TrimSpace(cell) != "" {
				isEmpty = false
				break
			}
		}
		if isEmpty {
			continue
		}

		val := func(colName string) string {
			colIdx, ok := columns[colName]
			if !ok || colIdx >= len(record) {
				return ""
			}
			return strings.TrimSpace(record[colIdx])
		}

		fullName := val("full_name")
		if fullName == "" {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNumber,
				Message: "Họ và tên không được để trống",
			})
			continue
		}

		var phonePtr *string
		if p := val("phone"); p != "" {
			phonePtr = &p
		}

		var emailPtr *string
		if e := val("email"); e != "" {
			emailPtr = &e
		}

		var addressPtr *string
		if a := val("address"); a != "" {
			addressPtr = &a
		}

		var notesPtr *string
		if n := val("notes"); n != "" {
			notesPtr = &n
		}

		var sourceDetailPtr *string
		if sd := val("source_detail"); sd != "" {
			sourceDetailPtr = &sd
		}

		var dobPtr *string
		if rawDOB := val("date_of_birth"); rawDOB != "" {
			normDOB := normalizeDateString(rawDOB)
			if normDOB == "" {
				result.Failed++
				result.Errors = append(result.Errors, ImportRowError{
					Row:     rowNumber,
					Name:    fullName,
					Message: fmt.Sprintf("Ngày sinh %q không hợp lệ (hỗ trợ YYYY-MM-DD hoặc DD/MM/YYYY)", rawDOB),
				})
				continue
			}
			dobPtr = &normDOB
		}

		var genderPtr *string
		if g := val("gender"); g != "" {
			normGender := normalizeGenderString(g)
			if normGender != "" {
				genderPtr = &normGender
			}
		}

		source := normalizeLeadSource(val("source"))

		var courseIDPtr *string
		if cVal := val("interested_course"); cVal != "" {
			cTrimmed := strings.TrimSpace(cVal)
			if id, ok := courseByCode[strings.ToUpper(cTrimmed)]; ok {
				courseIDPtr = &id
			} else if id, ok := courseByName[strings.ToLower(cTrimmed)]; ok {
				courseIDPtr = &id
			} else if id, ok := courseByID[strings.ToLower(cTrimmed)]; ok {
				courseIDPtr = &id
			} else {
				// Partial match
				foundID := ""
				for cName, id := range courseByName {
					if strings.Contains(cName, strings.ToLower(cTrimmed)) || strings.Contains(strings.ToLower(cTrimmed), cName) {
						foundID = id
						break
					}
				}
				if foundID != "" {
					courseIDPtr = &foundID
				} else {
					result.Failed++
					result.Errors = append(result.Errors, ImportRowError{
						Row:     rowNumber,
						Name:    fullName,
						Message: fmt.Sprintf("Không tìm thấy khóa học phù hợp với mã/tên: %q", cVal),
					})
					continue
				}
			}
		}

		var assigneeIDPtr *string
		if aVal := val("assigned_to"); aVal != "" {
			aTrimmed := strings.TrimSpace(aVal)
			if id, ok := staffByEmail[strings.ToLower(aTrimmed)]; ok {
				assigneeIDPtr = &id
			} else if id, ok := staffByID[strings.ToLower(aTrimmed)]; ok {
				assigneeIDPtr = &id
			} else {
				result.Failed++
				result.Errors = append(result.Errors, ImportRowError{
					Row:     rowNumber,
					Name:    fullName,
					Message: fmt.Sprintf("Không tìm thấy nhân viên phụ trách với email: %q", aVal),
				})
				continue
			}
		}

		input := WriteInput{
			FullName:           fullName,
			Phone:              phonePtr,
			Email:              emailPtr,
			DateOfBirth:        dobPtr,
			Gender:             genderPtr,
			Address:            addressPtr,
			Source:             source,
			SourceDetail:       sourceDetailPtr,
			InterestedCourseID: courseIDPtr,
			Notes:              notesPtr,
			AssignedTo:         assigneeIDPtr,
		}

		_, err := s.Create(ctx, actorID, input)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNumber,
				Name:    fullName,
				Message: mapLeadErrorMessage(err),
			})
			continue
		}

		result.Imported++
	}

	return result, nil
}

func (s *Service) ImportCSV(ctx context.Context, actorID string, r io.Reader) (ImportResult, error) {
	dataBytes, err := io.ReadAll(io.LimitReader(r, 10<<20+1))
	if err != nil {
		return ImportResult{}, fmt.Errorf("read body: %w", err)
	}
	return s.ImportFileData(ctx, actorID, dataBytes)
}

func normalizeColumnHeader(header string) string {
	header = strings.TrimPrefix(header, "\ufeff")
	header = strings.TrimSpace(header)
	header = strings.ToLower(header)
	header = strings.ReplaceAll(header, "*", "")
	if idx := strings.Index(header, "("); idx != -1 {
		header = strings.TrimSpace(header[:idx])
	}
	header = strings.ReplaceAll(header, "-", "_")
	header = strings.ReplaceAll(header, " ", "_")
	header = strings.Trim(header, "_")

	switch header {
	case "ho_va_ten", "họ_và_tên", "họ_tên", "ho_ten", "full_name", "fullname", "name", "tên", "ten":
		return "full_name"
	case "so_dien_thoai", "số_điện_thoại", "sdt", "sđt", "phone", "dien_thoai", "điện_thoại":
		return "phone"
	case "email", "thu_dien_tu", "thư_điện_tử":
		return "email"
	case "khoa_hoc", "khóa_học", "khoa_hoc_quan_tam", "khóa_học_quan_tâm", "course", "interested_course", "course_code":
		return "interested_course"
	case "nguon", "nguồn", "source", "nguon_lead", "nguồn_lead":
		return "source"
	case "chi_tiet_nguon", "chi_tiết_nguồn", "source_detail":
		return "source_detail"
	case "ghi_chu", "ghi_chú", "ghi_chu_tu_van", "ghi_chú_tư_vấn", "notes", "note":
		return "notes"
	case "ngay_sinh", "ngày_sinh", "date_of_birth", "dob", "birth_date":
		return "date_of_birth"
	case "gioi_tinh", "giới_tính", "gender", "sex":
		return "gender"
	case "dia_chi", "địa_chỉ", "address":
		return "address"
	case "nhan_vien_phu_trach", "nhân_viên_phụ_trách", "nhan_vien", "nhân_viên", "assigned_to", "phu_trach", "phụ_trách", "sale":
		return "assigned_to"
	default:
		return header
	}
}

func normalizeDateString(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t.Format("2006-01-02")
	}
	if t, err := time.Parse("02/01/2006", s); err == nil {
		return t.Format("2006-01-02")
	}
	if t, err := time.Parse("2/1/2006", s); err == nil {
		return t.Format("2006-01-02")
	}
	if t, err := time.Parse("02-01-2006", s); err == nil {
		return t.Format("2006-01-02")
	}
	if t, err := time.Parse("2006/01/02", s); err == nil {
		return t.Format("2006-01-02")
	}
	return ""
}

func normalizeGenderString(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "nam", "male", "m":
		return "male"
	case "nu", "nữ", "female", "f":
		return "female"
	case "khac", "khác", "other":
		return "other"
	default:
		return ""
	}
}

func normalizeLeadSource(s string) db.LeadSource {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "facebook", "fb":
		return db.LeadSourceFacebook
	case "tiktok":
		return db.LeadSourceTiktok
	case "google", "gg":
		return db.LeadSourceGoogle
	case "zalo":
		return db.LeadSourceZalo
	case "website", "web":
		return db.LeadSourceWebsite
	case "referral", "gioi thieu", "giới thiệu":
		return db.LeadSourceReferral
	case "walk_in", "walkin", "truc tiep", "trực tiếp":
		return db.LeadSourceWalkIn
	case "event", "su kien", "sự kiện":
		return db.LeadSourceEvent
	default:
		return db.LeadSourceOther
	}
}

func mapLeadErrorMessage(err error) string {
	switch {
	case errors.Is(err, ErrEmailAlreadyExists):
		return "Email này đã được sử dụng trong hệ thống"
	case errors.Is(err, ErrInvalidAssignee):
		return "Nhân viên được gán không hợp lệ"
	default:
		return err.Error()
	}
}

func (s *Service) ExportLeadsExcel(ctx context.Context, filter ListFilter) (*excelize.File, error) {
	var pipelineStatus db.NullLeadPipelineStatus
	if filter.PipelineStatus != "" {
		pipelineStatus = db.NullLeadPipelineStatus{
			LeadPipelineStatus: db.LeadPipelineStatus(filter.PipelineStatus),
			Valid:              true,
		}
	}

	var source db.NullLeadSource
	if filter.Source != "" {
		source = db.NullLeadSource{
			LeadSource: db.LeadSource(filter.Source),
			Valid:      true,
		}
	}

	var assignedTo pgtype.UUID
	if filter.AssignedTo != "" {
		parsed, err := data.UUID(filter.AssignedTo)
		if err == nil {
			assignedTo = parsed
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

	leadsList, err := s.queries.ListAllLeadsForExport(ctx, db.ListAllLeadsForExportParams{
		Search:         strings.TrimSpace(filter.Search),
		PipelineStatus: pipelineStatus,
		Source:         source,
		AssignedTo:     assignedTo,
		CreatedFrom:    createdFrom,
		CreatedTo:      createdTo,
	})
	if err != nil {
		return nil, fmt.Errorf("list leads for export: %w", err)
	}

	f := excelize.NewFile()
	sheetName := "Danh sách Lead"
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

	headers := []string{
		"STT", "Họ và tên", "Số điện thoại", "Email", "Giới tính",
		"Nguồn tiếp cận", "Khóa học quan tâm", "Trạng thái Pipeline",
		"Sale phụ trách", "Ghi chú tư vấn", "Ngày tạo",
	}

	for colIdx, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(colIdx+1, 1)
		_ = f.SetCellValue(sheetName, cell, h)
		_ = f.SetCellStyle(sheetName, cell, cell, headerStyle)
	}
	_ = f.SetRowHeight(sheetName, 1, 28)

	statusMap := map[string]string{
		"data_moi":     "Data mới",
		"knm_thue_bao": "KNM / Thuê bao",
		"goi_lai_sau":  "Gọi lại sau",
		"follow":       "Follow / Chăm sóc",
		"tu_choi":      "Từ chối",
		"da_dang_ky":   "Đã đăng ký",
		"dang_hoc":     "Đang học",
		"ket_thuc":     "Kết thúc",
	}

	sourceMap := map[string]string{
		"facebook": "Facebook",
		"tiktok":   "TikTok",
		"google":   "Google",
		"zalo":     "Zalo",
		"website":  "Website",
		"referral": "Giới thiệu",
		"walk_in":  "Đến trực tiếp",
		"event":    "Sự kiện",
		"other":    "Khác",
	}

	for rowIdx, l := range leadsList {
		row := rowIdx + 2
		stt := rowIdx + 1

		phoneStr := ""
		if l.Phone.Valid {
			phoneStr = l.Phone.String
		}
		emailStr := ""
		if l.Email.Valid {
			emailStr = l.Email.String
		}
		genderStr := ""
		if l.Gender.Valid {
			genderStr = l.Gender.String
		}
		srcStr := sourceMap[string(l.Source)]
		if srcStr == "" {
			srcStr = string(l.Source)
		}
		courseStr := ""
		if l.CourseName.Valid && l.CourseName.String != "" {
			courseStr = l.CourseName.String
		}
		statusStr := statusMap[string(l.PipelineStatus)]
		if statusStr == "" {
			statusStr = string(l.PipelineStatus)
		}
		saleStr := "Chưa phân bổ"
		if l.AssignedToEmail.Valid && l.AssignedToEmail.String != "" {
			saleStr = l.AssignedToEmail.String
		}
		notesStr := ""
		if l.Notes.Valid {
			notesStr = l.Notes.String
		}
		createdAtStr := l.CreatedAt.Time.UTC().Format("02/01/2006 15:04")

		values := []interface{}{
			stt, l.FullName, phoneStr, emailStr, genderStr,
			srcStr, courseStr, statusStr,
			saleStr, notesStr, createdAtStr,
		}

		for colIdx, v := range values {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, row)
			_ = f.SetCellValue(sheetName, cell, v)
			if colIdx == 0 || colIdx == 2 || colIdx == 4 || colIdx == 7 || colIdx == 10 {
				_ = f.SetCellStyle(sheetName, cell, cell, centerStyle)
			} else {
				_ = f.SetCellStyle(sheetName, cell, cell, dataStyle)
			}
		}
		_ = f.SetRowHeight(sheetName, row, 22)
	}

	colWidths := map[int]float64{
		1: 8, 2: 24, 3: 16, 4: 26, 5: 12,
		6: 18, 7: 24, 8: 20, 9: 26, 10: 32, 11: 20,
	}
	for col, width := range colWidths {
		colName, _ := excelize.ColumnNumberToName(col)
		_ = f.SetColWidth(sheetName, colName, colName, width)
	}

	return f, nil
}
