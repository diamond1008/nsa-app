package aiworkflows

import (
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
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

func TestBuildToolsIncludesListLeadTasks(t *testing.T) {
	orchestrator := &AgentOrchestrator{}

	saleClaims := &auth.AccessClaims{
		UserID: "11111111-1111-1111-1111-111111111111",
		Email:  "sale3@nsa.local",
		Roles:  []string{auth.RoleSale},
	}
	toolsSale := orchestrator.buildTools(saleClaims)
	toolMap := make(map[string]bool)
	for _, tool := range toolsSale {
		toolMap[tool.Function.Name] = true
	}

	requiredTools := []string{
		"list_lead_tasks",
		"complete_lead_task",
		"add_lead_interaction",
		"get_lead_details",
		"create_lead",
		"list_registration_orders",
		"list_courses",
		"list_classes",
		"create_registration_order",
		"search_leads",
		"create_lead_followup_task",
		"update_lead_pipeline_status",
		"scan_stale_leads",
		"get_leads_overview_stats",
	}

	for _, reqTool := range requiredTools {
		if !toolMap[reqTool] {
			t.Fatalf("expected tools for sale to include %s", reqTool)
		}
	}

	promptSale := orchestrator.buildSystemPrompt(saleClaims)
	if !strings.Contains(promptSale, "list_lead_tasks") {
		t.Fatalf("expected sale system prompt to instruct list_lead_tasks tool")
	}
}
