package aiworkflows

import (
	"encoding/json"
	"time"
)

type ProposalView struct {
	ID                       string          `json:"id"`
	DedupKey                 string          `json:"dedup_key"`
	WorkflowCode             string          `json:"workflow_code"`
	Domain                   string          `json:"domain"`
	Priority                 string          `json:"priority"`
	Status                   string          `json:"status"`
	TargetLeadID             *string         `json:"target_lead_id,omitempty"`
	TargetLeadName           *string         `json:"target_lead_name,omitempty"`
	TargetLeadPhone          *string         `json:"target_lead_phone,omitempty"`
	TargetLeadPipelineStatus *string         `json:"target_lead_pipeline_status,omitempty"`
	TargetOrderID            *string         `json:"target_order_id,omitempty"`
	TargetOrderCode          *string         `json:"target_order_code,omitempty"`
	TargetOrderFinalAmount   *string         `json:"target_order_final_amount,omitempty"`
	TargetOrderStatus        *string         `json:"target_order_status,omitempty"`
	TargetStudentID          *string         `json:"target_student_id,omitempty"`
	TargetStudentCode        *string         `json:"target_student_code,omitempty"`
	TargetStudentName        *string         `json:"target_student_name,omitempty"`
	TargetClassID            *string         `json:"target_class_id,omitempty"`
	TargetClassCode          *string         `json:"target_class_code,omitempty"`
	TargetClassName          *string         `json:"target_class_name,omitempty"`
	AssignedUserID           *string         `json:"assigned_user_id,omitempty"`
	AssignedUserName         *string         `json:"assigned_user_name,omitempty"`
	AssignedUserEmail        *string         `json:"assigned_user_email,omitempty"`
	Title                    string          `json:"title"`
	BottleneckSummary        string          `json:"bottleneck_summary"`
	AiRationale              string          `json:"ai_rationale"`
	SuggestedScript          string          `json:"suggested_script"`
	ActionType               string          `json:"action_type"`
	ActionPayload            json.RawMessage `json:"action_payload"`
	ContextSnapshot          json.RawMessage `json:"context_snapshot"`
	DecidedBy                *string         `json:"decided_by,omitempty"`
	DecidedByName            *string         `json:"decided_by_name,omitempty"`
	DecidedByEmail           *string         `json:"decided_by_email,omitempty"`
	DecidedAt                *time.Time      `json:"decided_at,omitempty"`
	DecisionNote             *string         `json:"decision_note,omitempty"`
	ExecutionResult          json.RawMessage `json:"execution_result,omitempty"`
	CreatedAt                time.Time       `json:"created_at"`
	UpdatedAt                time.Time       `json:"updated_at"`
}

type SummaryStatsView struct {
	PendingTotal    int64 `json:"pending_total"`
	CriticalPending int64 `json:"critical_pending"`
	SalesPending    int64 `json:"sales_pending"`
	RevenuePending  int64 `json:"revenue_pending"`
	TrainingPending int64 `json:"training_pending"`
	ExecutedToday   int64 `json:"executed_today"`
}

type ScanResultView struct {
	ScannedAt        time.Time `json:"scanned_at"`
	ProposalsCreated int       `json:"proposals_created"`
	ProposalsUpdated int       `json:"proposals_updated"`
	TotalPending     int64     `json:"total_pending"`
	Summary          string    `json:"summary"`
}

type ApproveProposalInput struct {
	SuggestedScript *string    `json:"suggested_script,omitempty"`
	DecisionNote    *string    `json:"decision_note,omitempty"`
	AssignedTo      *string    `json:"assigned_to,omitempty"`
	DueAt           *time.Time `json:"due_at,omitempty"`
}

type RejectProposalInput struct {
	DecisionNote *string `json:"decision_note,omitempty"`
}

type LeadCopilotInsightView struct {
	LeadID            string   `json:"lead_id"`
	FullName          string   `json:"full_name"`
	LeadScore         int      `json:"lead_score"`
	Temperature       string   `json:"temperature"` // "hot", "warm", "cold"
	Summary           string   `json:"summary"`
	Bottleneck        string   `json:"bottleneck"`
	NextBestAction    string   `json:"next_best_action"`
	SuggestedScript   string   `json:"suggested_script"`
	RecommendedCourse *string  `json:"recommended_course,omitempty"`
	Confidence        float64  `json:"confidence"`
	Tags              []string `json:"tags"`
}

type AgentChatMessage struct {
	Role      string `json:"role"` // "user", "assistant", "system"
	Content   string `json:"content"`
	Reasoning string `json:"reasoning,omitempty"`
}

type AgentChatRequest struct {
	Message string             `json:"message"`
	History []AgentChatMessage `json:"history,omitempty"`
}

type AgentChatResponse struct {
	Reply              string         `json:"reply"`
	Reasoning          string         `json:"reasoning,omitempty"`
	ModelUsed          string         `json:"model_used"`
	ToolsUsed          []string       `json:"tools_used,omitempty"`
	ProposalsGenerated []ProposalView `json:"proposals_generated,omitempty"`
}
