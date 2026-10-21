package leads

import (
	"testing"
	"unicode"

	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

func TestValidateLeadWriteRejectsEmptyName(t *testing.T) {
	_, msg := validateLeadWrite(leadWriteRequest{
		FullName: "   ",
	})
	if msg == "" {
		t.Fatal("empty full_name must be rejected")
	}
}

func TestValidateLeadWriteAcceptsValid(t *testing.T) {
	input, msg := validateLeadWrite(leadWriteRequest{
		FullName: "Nguyễn Văn A",
		Source:   string(db.LeadSourceFacebook),
	})
	if msg != "" {
		t.Fatalf("valid lead write rejected: %s", msg)
	}
	if input.FullName != "Nguyễn Văn A" {
		t.Fatalf("expected full_name 'Nguyễn Văn A', got %q", input.FullName)
	}
	if input.Source != db.LeadSourceFacebook {
		t.Fatalf("expected source 'facebook', got %q", input.Source)
	}
}

func TestValidateLeadWriteDefaultsSource(t *testing.T) {
	input, msg := validateLeadWrite(leadWriteRequest{
		FullName: "Trần Thị B",
		Source:   "",
	})
	if msg != "" {
		t.Fatalf("valid lead write rejected: %s", msg)
	}
	if input.Source != db.LeadSourceOther {
		t.Fatalf("expected default source 'other', got %q", input.Source)
	}
}

func TestGenerateRandomPassword(t *testing.T) {
	pass, err := generateRandomPassword(8)
	if err != nil {
		t.Fatalf("failed to generate random password: %v", err)
	}
	if len(pass) != 8 {
		t.Fatalf("expected length 8, got %d", len(pass))
	}

	for _, ch := range pass {
		if !unicode.IsLetter(ch) && !unicode.IsDigit(ch) {
			t.Fatalf("password %q contains non-alphanumeric character: %c", pass, ch)
		}
	}
}

func TestIsValidPipelineStatus(t *testing.T) {
	validStatuses := []db.LeadPipelineStatus{
		db.LeadPipelineStatusDataMoi,
		db.LeadPipelineStatusKnmThueBao,
		db.LeadPipelineStatusGoiLaiSau,
		db.LeadPipelineStatusFollow,
		db.LeadPipelineStatusTuChoi,
		db.LeadPipelineStatusDaDangKy,
		db.LeadPipelineStatusDangHoc,
		db.LeadPipelineStatusKetThuc,
	}

	for _, s := range validStatuses {
		if !isValidPipelineStatus(s) {
			t.Errorf("expected %s to be valid", s)
		}
	}

	if isValidPipelineStatus("invalid_status") {
		t.Error("expected invalid_status to be rejected")
	}
}

func TestNormalizeColumnHeader(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"ho_va_ten", "full_name"},
		{"Họ và tên", "full_name"},
		{"Họ tên", "full_name"},
		{"full_name", "full_name"},
		{"\ufeffho_va_ten", "full_name"},
		{"so_dien_thoai", "phone"},
		{"Số điện thoại", "phone"},
		{"sdt", "phone"},
		{"phone", "phone"},
		{"email", "email"},
		{"khoa_hoc", "interested_course"},
		{"Khóa học", "interested_course"},
		{"course", "interested_course"},
		{"nguon", "source"},
		{"Nguồn", "source"},
		{"ghi_chu", "notes"},
		{"Ghi chú", "notes"},
		{"ngay_sinh", "date_of_birth"},
		{"Ngày sinh", "date_of_birth"},
		{"gioi_tinh", "gender"},
		{"Giới tính", "gender"},
		{"dia_chi", "address"},
		{"Địa chỉ", "address"},
		{"nhan_vien_phu_trach", "assigned_to"},
		{"Nhân viên phụ trách", "assigned_to"},
	}

	for _, tt := range tests {
		got := normalizeColumnHeader(tt.input)
		if got != tt.expected {
			t.Errorf("normalizeColumnHeader(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestNormalizeDateString(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"1998-05-15", "1998-05-15"},
		{"15/05/1998", "1998-05-15"},
		{"1/5/1998", "1998-05-01"},
		{"15-05-1998", "1998-05-15"},
		{"1998/05/15", "1998-05-15"},
		{"invalid-date", ""},
		{"", ""},
	}

	for _, tt := range tests {
		got := normalizeDateString(tt.input)
		if got != tt.expected {
			t.Errorf("normalizeDateString(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestNormalizeGenderString(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Nam", "male"},
		{"nam", "male"},
		{"male", "male"},
		{"Nữ", "female"},
		{"nu", "female"},
		{"female", "female"},
		{"Khác", "other"},
		{"other", "other"},
		{"unknown", ""},
	}

	for _, tt := range tests {
		got := normalizeGenderString(tt.input)
		if got != tt.expected {
			t.Errorf("normalizeGenderString(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestNormalizeLeadSource(t *testing.T) {
	tests := []struct {
		input    string
		expected db.LeadSource
	}{
		{"facebook", db.LeadSourceFacebook},
		{"fb", db.LeadSourceFacebook},
		{"tiktok", db.LeadSourceTiktok},
		{"google", db.LeadSourceGoogle},
		{"zalo", db.LeadSourceZalo},
		{"website", db.LeadSourceWebsite},
		{"giới thiệu", db.LeadSourceReferral},
		{"trực tiếp", db.LeadSourceWalkIn},
		{"sự kiện", db.LeadSourceEvent},
		{"random_source", db.LeadSourceOther},
	}

	for _, tt := range tests {
		got := normalizeLeadSource(tt.input)
		if got != tt.expected {
			t.Errorf("normalizeLeadSource(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestGenerateTemplateExcelAndParse(t *testing.T) {
	excelBytes, err := GenerateTemplateExcel()
	if err != nil {
		t.Fatalf("GenerateTemplateExcel failed: %v", err)
	}
	if len(excelBytes) < 4 {
		t.Fatalf("excelBytes too short: %d", len(excelBytes))
	}
	// Verify PK zip header
	if excelBytes[0] != 0x50 || excelBytes[1] != 0x4B || excelBytes[2] != 0x03 || excelBytes[3] != 0x04 {
		t.Fatalf("expected PK zip header signature, got %X", excelBytes[:4])
	}

	rows, err := parseRowsFromData(excelBytes)
	if err != nil {
		t.Fatalf("parseRowsFromData failed on generated excel: %v", err)
	}
	if len(rows) != 4 {
		t.Fatalf("expected 4 rows (1 header + 3 samples), got %d rows", len(rows))
	}

	header := rows[0]
	if len(header) < 10 {
		t.Fatalf("expected at least 10 columns in header, got %d", len(header))
	}
	if normalizeColumnHeader(header[0]) != "full_name" {
		t.Errorf("expected column 0 to normalize to 'full_name', got %q", normalizeColumnHeader(header[0]))
	}

	// Verify sample 1 row
	sample1 := rows[1]
	if sample1[0] != "Trần Văn An" {
		t.Errorf("expected sample 1 name 'Trần Văn An', got %q", sample1[0])
	}
}
