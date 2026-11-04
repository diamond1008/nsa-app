package aiworkflows

import (
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestFormatPipelineStatus(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"data_moi", "Data mới"},
		{"knm_thue_bao", "KNM / Thuê bao"},
		{"goi_lai_sau", "Gọi lại sau"},
		{"follow", "Đang tư vấn"},
		{"tu_choi", "Từ chối"},
		{"da_dang_ky", "Đã đăng ký"},
		{"dang_hoc", "Đang học"},
		{"other_status", "other_status"},
	}

	for _, tc := range tests {
		actual := formatPipelineStatus(tc.input)
		if actual != tc.expected {
			t.Errorf("formatPipelineStatus(%q) = %q; want %q", tc.input, actual, tc.expected)
		}
	}
}

func TestGenerateFollowupScript(t *testing.T) {
	name := "Nguyễn Văn A"
	course := "Lập trình Go cơ bản"

	s1 := generateFollowupScript(name, "knm_thue_bao", course)
	if !strings.Contains(s1, "Nguyễn Văn A") || !strings.Contains(s1, "Zalo") {
		t.Errorf("expected knm_thue_bao script to contain name and Zalo, got %q", s1)
	}

	s2 := generateFollowupScript(name, "follow", course)
	if !strings.Contains(s2, "3 suất") || !strings.Contains(s2, course) {
		t.Errorf("expected follow script to mention limited slots, got %q", s2)
	}
}

func TestFormatAmount(t *testing.T) {
	var num pgtype.Numeric
	_ = num.Scan("4500000")
	formatted := formatAmount(num)
	if formatted != "4.500.000" {
		t.Errorf("expected 4.500.000, got %s", formatted)
	}

	var zero pgtype.Numeric
	_ = zero.Scan("0")
	if formatAmount(zero) != "0" {
		t.Errorf("expected 0, got %s", formatAmount(zero))
	}
}
