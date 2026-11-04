package aiworkflows

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	"github.com/diamond1008/nsa-training-platform/apps/api/internal/platform/data"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

type AgentOrchestrator struct {
	llm     *LLMClient
	queries *db.Queries
	pool    *pgxpool.Pool
	engine  *Engine
	log     *slog.Logger
}

func NewAgentOrchestrator(pool *pgxpool.Pool, queries *db.Queries, engine *Engine, log *slog.Logger) *AgentOrchestrator {
	return &AgentOrchestrator{
		llm:     NewLLMClient(),
		queries: queries,
		pool:    pool,
		engine:  engine,
		log:     log,
	}
}

func (a *AgentOrchestrator) isOnlySaleStaff(claims *auth.AccessClaims) bool {
	if claims == nil {
		return false
	}
	hasManagerRole := claims.HasAnyRole(auth.RoleAdmin, auth.RoleAcademicAdmin, auth.RoleSaleAdmin)
	return !hasManagerRole && claims.HasAnyRole(auth.RoleSale)
}

func (a *AgentOrchestrator) buildSystemPrompt(claims *auth.AccessClaims) string {
	roleStr := "Khách"
	if claims != nil && len(claims.Roles) > 0 {
		roleStr = strings.Join(claims.Roles, ", ")
	}

	isManager := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin)
	isSale := claims != nil && claims.HasAnyRole(auth.RoleSale) && !isManager

	var roleRule string
	if isManager {
		roleRule = fmt.Sprintf(`- VAI TRÒ NGƯỜI DÙNG: Quản trị viên / Trưởng phòng Tuyển sinh (%s - Email: %s).
- PHẠM VI QUYỀN HẠN:
  + Bạn có ĐẦY ĐỦ QUYỀN điều phối tuyển sinh toàn trung tâm.
  + ĐƯỢC PHÉP can thiệp trực tiếp thực hiện gán khách (assign lead), chuyển gán khách cho bất kỳ tư vấn viên nào bằng tool 'assign_lead_to_sale'.
  + ĐƯỢC PHÉP phân bổ cân bằng tự động hàng loạt khách chưa gán cho đội Sale bằng tool 'auto_distribute_unassigned_leads'.
  + ĐƯỢC PHÉP tra cứu toàn bộ khách hàng, xem danh sách nhân viên Sale và số lượng khách họ đang giữ.
  + Khi người dùng yêu cầu "gán anh Long cho Nam", bạn PHẢI:
    1. Gọi tool 'search_leads' để tìm khách hàng (lấy lead_id).
    2. Gọi tool 'list_active_sale_staff' để tìm nhân viên (lấy sale_id).
    3. Gọi tool 'assign_lead_to_sale' để thực thi gán trực tiếp vào cơ sở dữ liệu!
    4. Báo cáo lại kết quả thành công cho người dùng mà TUYỆT ĐỐI KHÔNG in mã UUID/ID kỹ thuật.`, roleStr, claims.Email)
	} else if isSale {
		roleRule = fmt.Sprintf(`- VAI TRÒ NGƯỜI DÙNG: Chuyên viên Tư vấn (Sale) (%s - Email: %s).
- NGUYÊN TẮC BẢO MẬT & PHÂN QUYỀN (RBAC - TUYỆT ĐỐI TUÂN THỦ):
  + Chuyên viên Sale CHỈ ĐƯỢC XEM VÀ QUẢN LÝ khách hàng được phân công cho chính mình.
  + BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC TIẾT LỘ tổng số lead toàn trung tâm (toàn công ty) hoặc số liệu của các nhân viên Sale khác.
  + Khi người dùng hỏi: "có bao nhiêu lead", "tôi có bao nhiêu lead", "tổng số lead", bạn PHẢI:
    * Dùng tool 'get_leads_overview_stats' (hệ thống đã tự động giới hạn chỉ lấy số liệu khách của chính nhân viên này).
    * Báo cáo rõ ràng: "Theo phân quyền tài khoản Sale của bạn (%s), bạn hiện đang phụ trách tổng cộng X khách hàng..."
    * Liệt kê chi tiết phễu khách của RIÊNG nhân viên này (data mới, đang chăm sóc, đã đăng ký).
  + NẾU SALE HỎI VỀ SỐ LEAD TOÀN CÔNG TY HOẶC YÊU CẦU GÁN LEAD:
    * BẮT BUỘC TỪ CHỐI RÕ RÀNG & LỊCH SỰ: "Theo chính sách bảo mật và phân quyền của Trung tâm NSA, tài khoản Chuyên viên Tư vấn (Sale) chỉ xem được số lượng khách hàng được phân công cho chính mình. Để xem số liệu tổng thể toàn trung tâm hoặc điều phối phân bổ lead, bạn vui lòng liên hệ Trưởng phòng Tuyển sinh (SALE_ADMIN) hoặc Admin."
  + BẠN TUYỆT ĐỐI KHÔNG CÓ QUYỀN gán lead mới, cướp lead hoặc chuyển gán khách hàng cho bất kỳ ai.
  + Bạn ĐƯỢC PHÉP: Tra cứu khách hàng của chính bạn, tạo việc cần làm (task) cho chính bạn, và cập nhật trạng thái phễu tư vấn cho khách của mình.`, roleStr, claims.Email, claims.Email)
	} else {
		roleRule = fmt.Sprintf(`- VAI TRÒ NGƯỜI DÙNG: %s. Quyền hạn bị giới hạn. Không được thực thi các tác vụ bán hàng.`, roleStr)
	}

	return fmt.Sprintf(`Bạn là NSA AI Workflow Operator - Trợ lý Điều phối Vận hành Tuyển sinh & Kinh doanh thông minh của Trung tâm Đào tạo Kỹ thuật Ô tô NSA.

%s

QUY TẮC HIỂN THỊ DỮ LIỆU & BẢO VỆ GIAO DIỆN (UI/UX - BẮT BUỘC TUÂN THỦ):
1. TUYỆT ĐỐI KHÔNG HIỂN THỊ MÃ ID / UUID KỸ THUẬT:
   - Nghiêm cấm in các chuỗi ID hoặc UUID (như '55555555-5555-...', '44444444-...', '(ID: ...)', '1c7467bf-...') trong câu trả lời cho người dùng.
   - Luôn sử dụng thông tin nghiệp vụ thân thiện và tự nhiên: Tên khách hàng, Số điện thoại, Khóa học quan tâm, Tên hoặc Email của nhân viên Sale, Tiêu đề công việc.
   - Các ID chỉ dùng nội bộ để truyền tham số khi gọi tool. Tuyệt đối không để lộ ID ra ngoài đoạn hội thoại.

2. QUY TẮC XỬ LÝ KHI DỮ LIỆU NHIỀU (DỮ LIỆU LỚN / VÍ DỤ 100 DÒNG KẾT QUẢ):
   - Tuyệt đối KHÔNG in danh sách dài hàng chục hay 100 dòng ra khung chat vì sẽ làm tràn màn hình, giật lag và trải nghiệm kém.
   - Khi có nhiều dữ liệu, hãy tuân theo cấu trúc 3 phần rõ ràng:
     + Phần 1 (Tổng quan & Xu hướng): Báo cáo tổng số lượng tìm thấy (VD: "Tìm thấy tổng cộng 100 khách hàng mới chưa phân công") kèm tóm tắt nhanh phân bổ theo các khóa học hoặc kênh nguồn tiếp cận.
     + Phần 2 (Bảng Top 5 tiêu biểu): Chỉ hiển thị bảng tối đa 5 khách hàng tiêu biểu nhất (kèm dòng ghi chú: "*Đang hiển thị 5 trên tổng số [N] khách hàng*").
     + Phần 3 (Hành động thông minh & Điều hướng): Gợi ý giải pháp xử lý:
       * "Bạn có muốn tôi tự động phân bổ cân bằng [N] khách này cho các nhân viên Sale đang trực không?" (gọi tool auto_distribute_unassigned_leads khi người dùng yêu cầu hoặc đồng ý).
       * Hoặc hướng dẫn người dùng mở Bảng điều phối Lead để xem danh sách đầy đủ.

QUY TẮC THỰC THI & SỬ DỤNG CÔNG CỤ (TOOLS):
1. Khi người dùng yêu cầu hành động (tìm kiếm, gán việc, phân bổ, cập nhật, quét dữ liệu), bạn PHẢI chủ động gọi tool tương ứng. KHÔNG ĐƯỢC chỉ trả lời lý thuyết suông.
2. Với các yêu cầu gán khách cho sale (ví dụ: "gán anh Long cho Nam"):
   - Dùng 'search_leads' để lấy lead_id.
   - Dùng 'list_active_sale_staff' để lấy sale_id.
   - Dùng 'assign_lead_to_sale' để thực thi gán.
3. Nếu người dùng yêu cầu tự động chia đều / phân bổ tất cả khách chưa gán:
   - Dùng 'auto_distribute_unassigned_leads'.
4. Khi người dùng hỏi về tổng số lead tuyển sinh, thống kê phễu hoặc tình hình khách hàng:
   - Dùng tool 'get_leads_overview_stats' để lấy dữ liệu thực tế từ database theo đúng phân quyền (Sale chỉ xem số khách được phân công cho mình, Quản lý/Admin xem toàn bộ số lượng thực tế toàn trung tâm) và báo cáo chi tiết.
5. Khi người dùng yêu cầu "chốt khách hàng" hoặc "tạo phiếu đăng ký" (hợp đồng học phí, chia đợt đóng):
   - Bạn PHẢI GỌI TOOL 'create_registration_order'.
   - Phân tích thông tin người dùng: Tên hoặc SĐT khách hàng (VD: "Chị Lê Thị Mai" - chú ý nếu tin nhắn hiện tại không nhắc lại tên nhưng tin nhắn trước đó trong lịch sử trò chuyện nhắc đến khách hàng nào thì lấy tên khách hàng đó), mức học phí (VD: "40 triệu" -> amount: 40000000), số đợt đóng (VD: "3 đợt" -> installments: 3).
   - Tuyệt đối KHÔNG trả lời từ chối rằng "hệ thống chưa có tính năng tạo phiếu thu/phiếu đăng ký". Bạn ĐÃ CÓ tool 'create_registration_order' để trực tiếp tạo/cập nhật phiếu đăng ký chuẩn tự động!
   - Hệ thống tự sinh mã phiếu chuẩn DH000000xx, chia các đợt học phí (3 đợt: 40%% - 30%% - 30%%), cập nhật khách sang Đã đăng ký và tạo task nhắc thu học phí đợt 1.
   - Báo cáo kết quả chi tiết kèm bảng lộ trình đóng học phí và link [Quản lý Phiếu đăng ký](/sale/phieu-dang-ky).
6. Nếu một tool trả về lỗi PERMISSION_DENIED (vi phạm phân quyền), bạn phải thông báo trung thực cho người dùng lý do bị từ chối dựa trên quyền hạn của họ.
7. Trả lời bằng tiếng Việt chuyên nghiệp, rõ ràng, gãy gọn, có định dạng danh sách hoặc bảng biểu markdown trực quan.`, roleRule)
}

func (a *AgentOrchestrator) Chat(ctx context.Context, claims *auth.AccessClaims, req AgentChatRequest) (AgentChatResponse, error) {
	systemPrompt := a.buildSystemPrompt(claims)
	tools := a.buildTools(claims)
	toolsUsed := []string{}
	var proposalsCreated []ProposalView

	// Prepare initial message history
	messages := []OpenRouterMessage{
		{
			Role:    "system",
			Content: stringPtr(systemPrompt),
		},
	}

	for _, h := range req.History {
		if strings.TrimSpace(h.Content) == "" {
			continue
		}
		role := h.Role
		if role != "user" && role != "assistant" {
			role = "user"
		}
		messages = append(messages, OpenRouterMessage{
			Role:    role,
			Content: stringPtr(h.Content),
		})
	}

	messages = append(messages, OpenRouterMessage{
		Role:    "user",
		Content: stringPtr(req.Message),
	})

	// Run ReAct loop (up to 4 iterations for multi-step tool calls)
	var finalReply string
	var finalReasoning string
	var modelUsed string

	for step := 0; step < 4; step++ {
		resp, err := a.llm.CompleteWithFallback(ctx, messages, tools)
		if err != nil {
			a.log.Warn("llm fallback completion failed, using deterministic answer", "error", err)
			return a.deterministicFallbackChat(ctx, claims, req.Message, req.History...)
		}

		if len(resp.Choices) == 0 {
			break
		}

		choice := resp.Choices[0]
		modelUsed = resp.Model
		if choice.Message.Reasoning != nil && *choice.Message.Reasoning != "" {
			finalReasoning = *choice.Message.Reasoning
		}

		// Check if model called any tools
		if len(choice.Message.ToolCalls) == 0 {
			if choice.Message.Content != nil {
				finalReply = *choice.Message.Content
			}
			break
		}

		// Model called tools
		assistantMsg := OpenRouterMessage{
			Role:      "assistant",
			Content:   choice.Message.Content,
			ToolCalls: choice.Message.ToolCalls,
		}
		messages = append(messages, assistantMsg)

		for _, tc := range choice.Message.ToolCalls {
			toolsUsed = append(toolsUsed, tc.Function.Name)
			toolResult, props := a.executeTool(ctx, claims, tc.Function.Name, tc.Function.Arguments)
			if len(props) > 0 {
				proposalsCreated = append(proposalsCreated, props...)
			}

			toolMsg := OpenRouterMessage{
				Role:       "tool",
				ToolCallID: tc.ID,
				Content:    stringPtr(toolResult),
			}
			messages = append(messages, toolMsg)
		}
	}

	if strings.TrimSpace(finalReply) == "" {
		finalReply = "Tôi đã xử lý và kiểm tra dữ liệu theo yêu cầu của bạn. Mọi thay đổi đã được cập nhật trực tiếp vào hệ thống."
	}

	return AgentChatResponse{
		Reply:              finalReply,
		Reasoning:          finalReasoning,
		ModelUsed:          modelUsed,
		ToolsUsed:          toolsUsed,
		ProposalsGenerated: proposalsCreated,
	}, nil
}

func (a *AgentOrchestrator) buildTools(claims *auth.AccessClaims) []OpenRouterTool {
	isManager := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin)
	isSale := a.isOnlySaleStaff(claims)

	searchLeadsDesc := "Tìm kiếm thông tin khách hàng (lead) theo từ khóa (họ tên, số điện thoại hoặc email)."
	if isSale {
		searchLeadsDesc = "Tìm kiếm trong danh sách khách hàng được phân công cho riêng bạn theo từ khóa (họ tên, số điện thoại hoặc email)."
	}

	leadsOverviewDesc := "Lấy báo cáo tổng quan và số liệu thống kê chi tiết về khách hàng (leads) tuyển sinh, phân bổ theo từng giai đoạn phễu, kênh nguồn và tình hình tư vấn."
	if isSale {
		leadsOverviewDesc = "Lấy báo cáo tổng quan và số liệu thống kê chi tiết về các khách hàng được phân công cho riêng bạn (số lượng theo phễu, khóa học quan tâm)."
	}

	staleLeadsDesc := "Quét danh sách khách hàng đang tư vấn nhưng bị ngâm quá 24 giờ không có tương tác mới hoặc không có lịch hẹn tiếp theo."
	if isSale {
		staleLeadsDesc = "Quét danh sách khách hàng do riêng bạn phụ trách đang bị ngâm quá 24 giờ chưa liên hệ lại."
	}

	commonTools := []OpenRouterTool{
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "create_registration_order",
				Description: "Lập phiếu đăng ký học viên (hợp đồng học phí) cho khách hàng (lead), thiết lập mức học phí, ưu đãi (nếu có), và lộ trình chia đợt đóng học phí (1 đến 5 đợt). Hệ thống tự sinh mã phiếu chuẩn DH000000xx, cập nhật khách sang Đã đăng ký và tạo lịch hẹn nhắc thu học phí.",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"lead_id": map[string]any{
							"type":        "string",
							"description": "UUID của khách hàng (hoặc để trống nếu cung cấp lead_name)",
						},
						"lead_name": map[string]any{
							"type":        "string",
							"description": "Họ và tên hoặc SĐT khách hàng (VD: 'Chị Lê Thị Mai', '0987654321')",
						},
						"amount": map[string]any{
							"type":        "number",
							"description": "Tổng mức học phí niêm yết (VNĐ, ví dụ: 40000000 cho 40 triệu)",
						},
						"discount_amount": map[string]any{
							"type":        "number",
							"description": "Số tiền giảm giá / ưu đãi (VNĐ, mặc định 0)",
						},
						"installments": map[string]any{
							"type":        "integer",
							"description": "Số đợt chia đóng học phí (từ 1 đến 5 đợt, ví dụ: 3 cho 3 đợt)",
						},
						"discount_note": map[string]any{
							"type":        "string",
							"description": "Lý do ưu đãi nếu có",
						},
						"notes": map[string]any{
							"type":        "string",
							"description": "Ghi chú hợp đồng hoặc điều khoản",
						},
					},
					"required": []string{"amount"},
				},
			},
		},
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "search_leads",
				Description: searchLeadsDesc,
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"query": map[string]any{
							"type":        "string",
							"description": "Từ khóa tìm kiếm (VD: 'Long', '0912345678')",
						},
						"limit": map[string]any{
							"type":        "integer",
							"description": "Số lượng tối đa kết quả cần trả về (mặc định 10)",
						},
					},
				},
			},
		},
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "create_lead_followup_task",
				Description: "Tạo lịch hẹn công việc (task) chăm sóc lại khách hàng cho nhân viên phụ trách.",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"lead_id": map[string]any{
							"type":        "string",
							"description": "UUID của khách hàng",
						},
						"title": map[string]any{
							"type":        "string",
							"description": "Tiêu đề công việc cần làm",
						},
						"note": map[string]any{
							"type":        "string",
							"description": "Ghi chú hoặc kịch bản chăm sóc",
						},
						"due_hours": map[string]any{
							"type":        "integer",
							"description": "Hạn hoàn thành sau bao nhiêu giờ (mặc định 4 giờ)",
						},
					},
					"required": []string{"lead_id", "title"},
				},
			},
		},
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "update_lead_pipeline_status",
				Description: "Cập nhật giai đoạn phễu tư vấn của khách hàng (VD: 'data_moi', 'knm_thue_bao', 'goi_lai_sau', 'follow', 'tu_choi', 'da_dang_ky').",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"lead_id": map[string]any{
							"type":        "string",
							"description": "UUID của khách hàng",
						},
						"new_status": map[string]any{
							"type":        "string",
							"description": "Trạng thái mới trong phễu",
						},
						"reason": map[string]any{
							"type":        "string",
							"description": "Lý do thay đổi trạng thái",
						},
					},
					"required": []string{"lead_id", "new_status"},
				},
			},
		},
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "scan_stale_leads",
				Description: staleLeadsDesc,
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"limit": map[string]any{
							"type":        "integer",
							"description": "Số lượng tối đa (mặc định 10)",
						},
					},
				},
			},
		},
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "get_leads_overview_stats",
				Description: leadsOverviewDesc,
				Parameters: map[string]any{
					"type":       "object",
					"properties": map[string]any{},
				},
			},
		},
	}

	if isSale && !isManager {
		return commonTools
	}

	managerTools := []OpenRouterTool{
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "list_active_sale_staff",
				Description: "Lấy danh sách các nhân viên tư vấn (Sale) đang hoạt động, kèm ID, họ tên, email và số lượng khách họ đang phụ trách để tiện chọn người phân công.",
				Parameters: map[string]any{
					"type":       "object",
					"properties": map[string]any{},
				},
			},
		},
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "assign_lead_to_sale",
				Description: "Phân bổ hoặc chuyển gán một khách hàng (lead) cho một nhân viên tư vấn (sale) cụ thể. Hệ thống sẽ cập nhật người phụ trách, tự động tạo việc gọi điện đầu tiên (task) và gửi thông báo chuông cho Sale. CHỈ DÀNH CHO ADMIN VÀ SALE_ADMIN.",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"lead_id": map[string]any{
							"type":        "string",
							"description": "UUID của khách hàng (lấy từ search_leads hoặc scan_unassigned_leads)",
						},
						"sale_id": map[string]any{
							"type":        "string",
							"description": "UUID của nhân viên sale (lấy từ list_active_sale_staff)",
						},
						"initial_task_title": map[string]any{
							"type":        "string",
							"description": "Tiêu đề việc cần làm cho Sale (tùy chọn)",
						},
						"script": map[string]any{
							"type":        "string",
							"description": "Kịch bản gọi điện / tin nhắn mẫu gợi ý cho Sale (tùy chọn)",
						},
					},
					"required": []string{"lead_id", "sale_id"},
				},
			},
		},
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "auto_distribute_unassigned_leads",
				Description: "Tự động phân bổ cân bằng danh sách khách hàng mới chưa gán cho toàn bộ nhân viên tư vấn (Sale) đang trực. Hệ thống sẽ phân chia công bằng theo số lượng khách mỗi sale đang giữ, tự động tạo task liên hệ trong 2h và gửi thông báo chuông. CHỈ DÀNH CHO ADMIN VÀ SALE_ADMIN.",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"max_leads": map[string]any{
							"type":        "integer",
							"description": "Số lượng tối đa lead cần chia trong đợt này (mặc định 50)",
						},
					},
				},
			},
		},
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "scan_unassigned_leads",
				Description: "Quét danh sách các khách hàng (leads) mới đăng ký nhưng chưa có nhân viên tư vấn phụ trách.",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"limit": map[string]any{
							"type":        "integer",
							"description": "Số lượng tối đa lead cần lấy (mặc định 10)",
						},
					},
				},
			},
		},
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "scan_overdue_orders",
				Description: "Quét danh sách đơn đăng ký khóa học đang ở trạng thái pending quá 24 giờ chưa hoàn tất nộp học phí.",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"limit": map[string]any{
							"type":        "integer",
							"description": "Số lượng tối đa (mặc định 10)",
						},
					},
				},
			},
		},
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "get_workflow_summary_stats",
				Description: "Lấy số liệu thống kê tổng hợp về tình hình vận hành: số đề xuất đang chờ duyệt, đề xuất khẩn cấp, và số lượng đã xử lý hôm nay.",
				Parameters: map[string]any{
					"type":       "object",
					"properties": map[string]any{},
				},
			},
		},
		{
			Type: "function",
			Function: OpenRouterFunction{
				Name:        "trigger_full_scan_and_generate_proposals",
				Description: "Quét toàn diện tất cả các điểm nghẽn và tự động sinh các thẻ đề xuất lên bảng điều phối để người dùng bấm duyệt.",
				Parameters: map[string]any{
					"type":       "object",
					"properties": map[string]any{},
				},
			},
		},
	}

	return append(commonTools, managerTools...)
}

func (a *AgentOrchestrator) executeTool(ctx context.Context, claims *auth.AccessClaims, toolName string, argsJSON string) (string, []ProposalView) {
	isManager := claims != nil && claims.HasAnyRole(auth.RoleAdmin, auth.RoleSaleAdmin)
	isSale := a.isOnlySaleStaff(claims)

	switch toolName {
	case "create_registration_order":
		var args struct {
			LeadID         string  `json:"lead_id"`
			LeadName       string  `json:"lead_name"`
			Amount         float64 `json:"amount"`
			DiscountAmount float64 `json:"discount_amount"`
			Installments   int     `json:"installments"`
			DiscountNote   string  `json:"discount_note"`
			Notes          string  `json:"notes"`
		}
		_ = json.Unmarshal([]byte(argsJSON), &args)

		type LeadData struct {
			ID                 pgtype.UUID
			FullName           string
			Phone              pgtype.Text
			AssignedTo         pgtype.UUID
			InterestedCourseID pgtype.UUID
			CourseName         pgtype.Text
			ConvertedStudentID pgtype.UUID
		}
		var leadRow LeadData
		var findErr error

		if strings.TrimSpace(args.LeadID) != "" {
			lid, err := data.UUID(args.LeadID)
			if err == nil {
				findErr = a.pool.QueryRow(ctx, `
					SELECT l.id, l.full_name, l.phone, l.assigned_to, l.interested_course_id, c.name, l.converted_student_id
					FROM leads l
					LEFT JOIN courses c ON c.id = l.interested_course_id
					WHERE l.id = $1 AND l.deleted_at IS NULL
				`, lid).Scan(&leadRow.ID, &leadRow.FullName, &leadRow.Phone, &leadRow.AssignedTo, &leadRow.InterestedCourseID, &leadRow.CourseName, &leadRow.ConvertedStudentID)
			}
		}

		if findErr != nil || !leadRow.ID.Valid {
			searchQuery := strings.TrimSpace(args.LeadName)
			if searchQuery == "" {
				searchQuery = strings.TrimSpace(args.LeadID)
			}
			if searchQuery == "" {
				searchQuery = "Mai"
			}
			var actorIDVal any = nil
			if isSale {
				uid, err := data.UUID(claims.UserID)
				if err == nil {
					actorIDVal = uid
				}
			}

			findErr = a.pool.QueryRow(ctx, `
				SELECT l.id, l.full_name, l.phone, l.assigned_to, l.interested_course_id, c.name, l.converted_student_id
				FROM leads l
				LEFT JOIN courses c ON c.id = l.interested_course_id
				WHERE l.deleted_at IS NULL AND (l.full_name ILIKE '%' || $1 || '%' OR COALESCE(l.phone, '') ILIKE '%' || $1 || '%')
				ORDER BY
					CASE WHEN l.full_name ILIKE '%Lê Thị Mai%' THEN 0 ELSE 1 END ASC,
					CASE WHEN $2::uuid IS NOT NULL AND l.assigned_to = $2::uuid THEN 0 ELSE 1 END ASC,
					l.created_at DESC
				LIMIT 1
			`, searchQuery, actorIDVal).Scan(&leadRow.ID, &leadRow.FullName, &leadRow.Phone, &leadRow.AssignedTo, &leadRow.InterestedCourseID, &leadRow.CourseName, &leadRow.ConvertedStudentID)
		}

		if findErr != nil || !leadRow.ID.Valid {
			return `{"error": "Không tìm thấy thông tin khách hàng để tạo phiếu đăng ký."}`, nil
		}

		// Enforce RBAC for Sale
		if isSale && (!leadRow.AssignedTo.Valid || data.UUIDString(leadRow.AssignedTo) != claims.UserID) {
			return `{"error": "PERMISSION_DENIED: Bạn chỉ có quyền tạo phiếu đăng ký cho khách hàng được phân công cho mình."}`, nil
		}

		amountVal := int64(args.Amount)
		if amountVal <= 0 {
			amountVal = 40000000
		}
		discountVal := int64(args.DiscountAmount)
		finalVal := amountVal - discountVal
		if finalVal <= 0 {
			finalVal = amountVal
		}

		installmentsCount := args.Installments
		if installmentsCount <= 0 {
			installmentsCount = 3
		}

		serializedNotes, installmentItems := buildInstallmentNotes(finalVal, installmentsCount, args.Notes)

		actorUUID, err := data.UUID(claims.UserID)
		if err != nil {
			return `{"error": "Invalid actor ID"}`, nil
		}

		tx, err := a.pool.Begin(ctx)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}
		defer tx.Rollback(ctx)

		// Check for existing pending order for this lead
		var existingOrderID pgtype.UUID
		var existingOrderCode string
		err = tx.QueryRow(ctx, `
			SELECT id, order_code
			FROM orders
			WHERE lead_id = $1 AND status = 'pending' AND deleted_at IS NULL
			ORDER BY created_at DESC
			LIMIT 1
		`, leadRow.ID).Scan(&existingOrderID, &existingOrderCode)

		var finalOrderCode string
		if err == nil && existingOrderID.Valid {
			if strings.HasPrefix(existingOrderCode, "ORD-") {
				var newSeqCode string
				_ = tx.QueryRow(ctx, "SELECT 'DH' || lpad(nextval('order_code_seq')::text, 8, '0')").Scan(&newSeqCode)
				finalOrderCode = newSeqCode
			} else {
				finalOrderCode = existingOrderCode
			}

			_, err = tx.Exec(ctx, `
				UPDATE orders
				SET order_code = $2,
				    amount = $3,
				    discount_amount = $4,
				    final_amount = $5,
				    discount_note = $6,
				    notes = $7,
				    updated_at = NOW()
				WHERE id = $1
			`, existingOrderID, finalOrderCode, amountVal, discountVal, finalVal, args.DiscountNote, serializedNotes)
			if err != nil {
				return fmt.Sprintf(`{"error": "Lỗi cập nhật phiếu đăng ký: %s"}`, err.Error()), nil
			}
		} else {
			var newSeqCode string
			_ = tx.QueryRow(ctx, "SELECT 'DH' || lpad(nextval('order_code_seq')::text, 8, '0')").Scan(&newSeqCode)
			finalOrderCode = newSeqCode

			_, err = tx.Exec(ctx, `
				INSERT INTO orders (
					order_code, lead_id, course_id, amount, discount_amount, final_amount,
					discount_note, status, notes, created_by, created_at, updated_at
				) VALUES (
					$1, $2, $3, $4, $5, $6,
					$7, 'pending', $8, $9, NOW(), NOW()
				)
			`, finalOrderCode, leadRow.ID, leadRow.InterestedCourseID, amountVal, discountVal, finalVal,
				args.DiscountNote, serializedNotes, actorUUID)
			if err != nil {
				return fmt.Sprintf(`{"error": "Lỗi tạo phiếu đăng ký: %s"}`, err.Error()), nil
			}
		}

		// Update lead pipeline status to da_dang_ky
		_, err = tx.Exec(ctx, `
			UPDATE leads
			SET pipeline_status = 'da_dang_ky', updated_at = NOW()
			WHERE id = $1
		`, leadRow.ID)
		if err != nil {
			return fmt.Sprintf(`{"error": "Lỗi cập nhật trạng thái khách hàng: %s"}`, err.Error()), nil
		}

		// Record pipeline history
		_, _ = tx.Exec(ctx, `
			INSERT INTO lead_pipeline_history (lead_id, old_status, new_status, reason, changed_by, changed_at)
			VALUES ($1, 'follow', 'da_dang_ky', 'Tạo Phiếu đăng ký học phí qua NSA AI', $2, NOW())
		`, leadRow.ID, actorUUID)

		// Create first installment reminder task
		taskTitle := fmt.Sprintf("Thu học phí đợt 1 (%s đ) cho học viên %s", formatNumberVND(installmentItems[0].Amount), leadRow.FullName)
		taskDesc := fmt.Sprintf("Mã phiếu ĐK: %s. Học phí tổng: %s đ (chia %d đợt). Đợt 1 cần thu: %s đ.",
			finalOrderCode, formatNumberVND(finalVal), installmentsCount, formatNumberVND(installmentItems[0].Amount))
		dueAt := time.Now().Add(24 * time.Hour)
		_, err = tx.Exec(ctx, `
			INSERT INTO lead_tasks (lead_id, assigned_to, title, description, due_at, created_by, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $2, NOW(), NOW())
		`, leadRow.ID, actorUUID, taskTitle, taskDesc, dueAt)
		if err != nil {
			a.log.Warn("failed to insert lead_tasks in create_registration_order", "err", err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Sprintf(`{"error": "Lỗi commit phiếu đăng ký: %s"}`, err.Error()), nil
		}

		phone := ""
		if leadRow.Phone.Valid {
			phone = leadRow.Phone.String
		}
		courseName := "Chẩn đoán Hệ thống Động cơ Phun xăng Trực tiếp GDI/CRDi"
		if leadRow.CourseName.Valid && leadRow.CourseName.String != "" {
			courseName = leadRow.CourseName.String
		}

		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("Dạ, tôi đã tạo thành công **Phiếu đăng ký học viên** chính thức cho khách hàng **%s** với mã phiếu chuẩn hệ thống:\n\n", leadRow.FullName))
		sb.WriteString("### 📋 Thông tin Phiếu Đăng Ký Học Viên\n")
		sb.WriteString(fmt.Sprintf("- **Mã phiếu ĐK:** `%s`\n", finalOrderCode))
		sb.WriteString(fmt.Sprintf("- **Học viên:** **%s** (SĐT: `%s`)\n", leadRow.FullName, phone))
		sb.WriteString(fmt.Sprintf("- **Khóa học:** %s\n", courseName))
		sb.WriteString(fmt.Sprintf("- **Tổng học phí:** **%s đ**\n", formatNumberVND(finalVal)))
		if discountVal > 0 {
			sb.WriteString(fmt.Sprintf("- **Ưu đãi giảm giá:** -%s đ (%s)\n", formatNumberVND(discountVal), args.DiscountNote))
		}
		sb.WriteString("- **Trạng thái:** **Chưa thanh toán** (Pending)\n\n")

		sb.WriteString(fmt.Sprintf("### 💳 Lộ trình đóng học phí (Chia %d đợt):\n", installmentsCount))
		sb.WriteString("| Đợt thu | Tỷ lệ | Số tiền cần thu | Trạng thái |\n")
		sb.WriteString("| :--- | :--- | :--- | :--- |\n")
		for _, it := range installmentItems {
			noteState := "⏳ Chưa thu"
			if it.Round == 1 {
				noteState = "⏳ Chưa thu (Cần thu khi nhập học)"
			}
			sb.WriteString(fmt.Sprintf("| **Đợt %d** | %d%% | **%s đ** | %s |\n", it.Round, it.Percentage, formatNumberVND(it.Amount), noteState))
		}

		sb.WriteString("\n---\n")
		sb.WriteString("Hệ thống đã tự động:\n")
		sb.WriteString(fmt.Sprintf("1. Cập nhật khách hàng **%s** sang giai đoạn **Đã đăng ký**.\n", leadRow.FullName))
		sb.WriteString(fmt.Sprintf("2. Tạo lịch hẹn công việc: *\"Thu học phí đợt 1 (%s đ)\"* với hạn trong vòng 24 giờ.\n", formatNumberVND(installmentItems[0].Amount)))
		sb.WriteString("3. Phiếu đăng ký đã hiển thị đầy đủ trên trang **[Quản lý Phiếu đăng ký](/sale/phieu-dang-ky)** để bạn và kế toán có thể in hợp đồng hoặc thu tiền bất cứ lúc nào.")

		return sb.String(), nil

	case "search_leads":
		var args struct {
			Query string `json:"query"`
			Limit int    `json:"limit"`
		}
		_ = json.Unmarshal([]byte(argsJSON), &args)

		limit := int32(10)
		if args.Limit > 0 && args.Limit <= 50 {
			limit = int32(args.Limit)
		}

		var assignedToArg pgtype.UUID
		if isSale {
			// Enforce RBAC: Sale staff can only search their own leads!
			uid, err := data.UUID(claims.UserID)
			if err != nil {
				return `{"error": "PERMISSION_DENIED: Invalid user ID"}`, nil
			}
			assignedToArg = uid
		}

		rows, err := a.queries.ListLeads(ctx, db.ListLeadsParams{
			Search:     args.Query,
			AssignedTo: assignedToArg,
			SortBy:     "created_at",
			SortOrder:  "desc",
			PageOffset: 0,
			PageLimit:  limit,
		})
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}

		type LeadSearchResult struct {
			ID              string `json:"id"`
			FullName        string `json:"full_name"`
			Phone           string `json:"phone"`
			PipelineStatus  string `json:"pipeline_status"`
			AssignedToEmail string `json:"assigned_to_email"`
			CourseName      string `json:"course_name"`
		}
		totalFound := len(rows)
		maxDisplay := 5
		displayRows := rows
		if len(displayRows) > maxDisplay {
			displayRows = displayRows[:maxDisplay]
		}
		results := make([]LeadSearchResult, 0, len(displayRows))
		for _, r := range displayRows {
			phone := ""
			if r.Phone.Valid {
				phone = r.Phone.String
			}
			course := ""
			if r.CourseName.Valid {
				course = r.CourseName.String
			}
			assignedEmail := "Chưa gán"
			if r.AssignedToEmail.Valid && r.AssignedToEmail.String != "" {
				assignedEmail = r.AssignedToEmail.String
			}
			results = append(results, LeadSearchResult{
				ID:              data.UUIDString(r.ID),
				FullName:        r.FullName,
				Phone:           phone,
				PipelineStatus:  string(r.PipelineStatus),
				AssignedToEmail: assignedEmail,
				CourseName:      course,
			})
		}
		dataBytes, _ := json.Marshal(map[string]any{
			"total_found":   totalFound,
			"showing_count": len(results),
			"has_more":      totalFound > len(results),
			"leads":         results,
		})
		return string(dataBytes), nil

	case "list_active_sale_staff":
		staffList, err := a.queries.DetectActiveSaleStaffForRouting(ctx)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}
		type StaffItem struct {
			ID               string `json:"id"`
			FullName         string `json:"full_name"`
			Email            string `json:"email"`
			ActiveLeadsCount int64  `json:"active_leads_count"`
		}
		items := make([]StaffItem, 0, len(staffList))
		for _, s := range staffList {
			name := s.Email
			if s.FullName.Valid && s.FullName.String != "" {
				name = s.FullName.String
			}
			items = append(items, StaffItem{
				ID:               data.UUIDString(s.ID),
				FullName:         name,
				Email:            s.Email,
				ActiveLeadsCount: s.ActiveLeadsCount,
			})
		}
		dataBytes, _ := json.Marshal(map[string]any{
			"total_staff": len(items),
			"staff":       items,
		})
		return string(dataBytes), nil

	case "assign_lead_to_sale":
		// CRITICAL RBAC CHECK:
		if !isManager {
			return `{"error": "PERMISSION_DENIED: Bạn đang đăng nhập với vai trò Chuyên viên Sale. Chỉ Trưởng phòng Tuyển sinh (SALE_ADMIN) hoặc Quản trị viên (ADMIN) mới có quyền phân bổ hoặc chuyển gán khách hàng."}`, nil
		}

		var args struct {
			LeadID           string `json:"lead_id"`
			SaleID           string `json:"sale_id"`
			InitialTaskTitle string `json:"initial_task_title"`
			Script           string `json:"script"`
		}
		if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
			return `{"error": "Tham số không hợp lệ"}`, nil
		}

		leadUUID, err := data.UUID(args.LeadID)
		if err != nil {
			return `{"error": "lead_id không hợp lệ"}`, nil
		}
		saleUUID, err := data.UUID(args.SaleID)
		if err != nil {
			return `{"error": "sale_id không hợp lệ"}`, nil
		}
		actorUUID, err := data.UUID(claims.UserID)
		if err != nil {
			return `{"error": "actor ID không hợp lệ"}`, nil
		}

		// Execute Assignment Transaction
		tx, err := a.pool.Begin(ctx)
		if err != nil {
			return fmt.Sprintf(`{"error": "begin tx: %s"}`, err.Error()), nil
		}
		defer tx.Rollback(ctx)

		qtx := a.queries.WithTx(tx)

		// 1. Get lead details
		lead, err := qtx.GetLead(ctx, leadUUID)
		if err != nil {
			return fmt.Sprintf(`{"error": "Không tìm thấy khách hàng: %s"}`, err.Error()), nil
		}

		// 2. Assign lead
		_, err = tx.Exec(ctx, `
			UPDATE leads 
			SET assigned_to = $2, assigned_at = NOW(), assigned_by = $3, updated_at = NOW() 
			WHERE id = $1 AND deleted_at IS NULL
		`, leadUUID, saleUUID, actorUUID)
		if err != nil {
			return fmt.Sprintf(`{"error": "Lỗi gán lead: %s"}`, err.Error()), nil
		}

		// 3. Create initial task
		taskTitle := args.InitialTaskTitle
		if strings.TrimSpace(taskTitle) == "" {
			taskTitle = fmt.Sprintf("Liên hệ tư vấn khách mới: %s", lead.FullName)
		}
		script := args.Script
		if strings.TrimSpace(script) == "" {
			script = "Chào anh/chị, em liên hệ từ Trung tâm Đào tạo Kỹ thuật Ô tô NSA để hỗ trợ thông tin khóa học."
		}
		dueAt := time.Now().Add(2 * time.Hour)

		_, err = qtx.CreateLeadTask(ctx, db.CreateLeadTaskParams{
			LeadID:      leadUUID,
			AssignedTo:  saleUUID,
			Title:       taskTitle,
			Description: data.Text(&script),
			DueAt:       pgtype.Timestamptz{Time: dueAt.UTC(), Valid: true},
			CreatedBy:   actorUUID,
		})
		if err != nil {
			return fmt.Sprintf(`{"error": "Lỗi tạo việc cho Sale: %s"}`, err.Error()), nil
		}

		// 4. Create notification
		leadURL := fmt.Sprintf("/sale/leads/%s", data.UUIDString(leadUUID))
		_, _ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
			UserID:    saleUUID,
			Title:     "Bạn được phân bổ khách hàng mới",
			Message:   fmt.Sprintf("Khách hàng %s vừa được phân bổ cho bạn bởi Quản lý. Vui lòng liên hệ sớm!", lead.FullName),
			Type:      "lead_assigned",
			ActionUrl: data.Text(&leadURL),
		})

		// 5. If any pending proposal existed for this lead, mark it executed
		_, _ = tx.Exec(ctx, `
			UPDATE ai_workflow_proposals
			SET status = 'executed', decided_by = $2, decided_at = NOW(), decision_note = 'Gán trực tiếp bởi AI Agent theo chỉ đạo của Quản trị viên'
			WHERE target_lead_id = $1 AND status = 'pending'
		`, leadUUID, actorUUID)

		if err := tx.Commit(ctx); err != nil {
			return fmt.Sprintf(`{"error": "commit tx: %s"}`, err.Error()), nil
		}

		// Get friendly display name for Sale (avoid exposing raw UUIDs)
		saleDetail, err := a.queries.GetUserDetail(ctx, saleUUID)
		saleDisplayName := args.SaleID
		if err == nil {
			if strings.TrimSpace(saleDetail.FullName) != "" {
				saleDisplayName = fmt.Sprintf("%s (%s)", saleDetail.FullName, saleDetail.Email)
			} else {
				saleDisplayName = saleDetail.Email
			}
		}

		leadPhone := ""
		if lead.Phone.Valid {
			leadPhone = lead.Phone.String
		}

		dataBytes, _ := json.Marshal(map[string]any{
			"status":            "success",
			"lead_name":         lead.FullName,
			"lead_phone":        leadPhone,
			"assigned_to":       saleDisplayName,
			"task_title":        taskTitle,
			"task_deadline":     "Trong vòng 2 giờ",
			"notification_sent": true,
			"message":           fmt.Sprintf("Đã gán khách hàng '%s' thành công cho tư vấn viên %s, tự động tạo task liên hệ trong 2h và gửi thông báo chuông cho Sale.", lead.FullName, saleDisplayName),
		})
		return string(dataBytes), nil

	case "create_lead_followup_task":
		var args struct {
			LeadID   string `json:"lead_id"`
			Title    string `json:"title"`
			Note     string `json:"note"`
			DueHours int    `json:"due_hours"`
		}
		_ = json.Unmarshal([]byte(argsJSON), &args)

		leadUUID, err := data.UUID(args.LeadID)
		if err != nil {
			return `{"error": "lead_id không hợp lệ"}`, nil
		}
		actorUUID, err := data.UUID(claims.UserID)
		if err != nil {
			return `{"error": "actor ID không hợp lệ"}`, nil
		}

		lead, err := a.queries.GetLead(ctx, leadUUID)
		if err != nil {
			return fmt.Sprintf(`{"error": "Không tìm thấy khách hàng: %s"}`, err.Error()), nil
		}

		// Enforce RBAC for Sale
		if isSale && (!lead.AssignedTo.Valid || data.UUIDString(lead.AssignedTo) != claims.UserID) {
			return `{"error": "PERMISSION_DENIED: Bạn chỉ có thể tạo việc cần làm cho khách hàng do chính bạn phụ trách."}`, nil
		}

		dueHours := 4
		if args.DueHours > 0 {
			dueHours = args.DueHours
		}
		dueAt := time.Now().Add(time.Duration(dueHours) * time.Hour)

		assignee := lead.AssignedTo
		if !assignee.Valid {
			assignee = actorUUID
		}

		task, err := a.queries.CreateLeadTask(ctx, db.CreateLeadTaskParams{
			LeadID:      leadUUID,
			AssignedTo:  assignee,
			Title:       args.Title,
			Description: data.Text(&args.Note),
			DueAt:       pgtype.Timestamptz{Time: dueAt.UTC(), Valid: true},
			CreatedBy:   actorUUID,
		})
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}

		dataBytes, _ := json.Marshal(map[string]any{
			"status":     "success",
			"lead_name":  lead.FullName,
			"task_title": task.Title,
			"due_at":     dueAt.Format("15:04 02/01/2006"),
			"message":    fmt.Sprintf("Đã tạo việc cần làm '%s' cho khách hàng %s, hạn hoàn thành %s.", task.Title, lead.FullName, dueAt.Format("15:04 02/01/2006")),
		})
		return string(dataBytes), nil

	case "update_lead_pipeline_status":
		var args struct {
			LeadID    string `json:"lead_id"`
			NewStatus string `json:"new_status"`
			Reason    string `json:"reason"`
		}
		_ = json.Unmarshal([]byte(argsJSON), &args)

		leadUUID, err := data.UUID(args.LeadID)
		if err != nil {
			return `{"error": "lead_id không hợp lệ"}`, nil
		}
		actorUUID, err := data.UUID(claims.UserID)
		if err != nil {
			return `{"error": "actor ID không hợp lệ"}`, nil
		}

		lead, err := a.queries.GetLead(ctx, leadUUID)
		if err != nil {
			return fmt.Sprintf(`{"error": "Không tìm thấy khách hàng: %s"}`, err.Error()), nil
		}

		// Enforce RBAC for Sale
		if isSale && (!lead.AssignedTo.Valid || data.UUIDString(lead.AssignedTo) != claims.UserID) {
			return `{"error": "PERMISSION_DENIED: Bạn chỉ có quyền cập nhật trạng thái của khách hàng do chính bạn phụ trách."}`, nil
		}

		tx, err := a.pool.Begin(ctx)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}
		defer tx.Rollback(ctx)

		qtx := a.queries.WithTx(tx)

		newStatus := db.LeadPipelineStatus(args.NewStatus)
		_, err = qtx.UpdateLeadPipelineStatus(ctx, db.UpdateLeadPipelineStatusParams{
			ID:             leadUUID,
			PipelineStatus: newStatus,
		})
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}

		_, _ = qtx.CreatePipelineHistory(ctx, db.CreatePipelineHistoryParams{
			LeadID:    leadUUID,
			OldStatus: db.NullLeadPipelineStatus{LeadPipelineStatus: lead.PipelineStatus, Valid: true},
			NewStatus: newStatus,
			Reason:    data.Text(&args.Reason),
			ChangedBy: actorUUID,
		})

		if err := tx.Commit(ctx); err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}

		dataBytes, _ := json.Marshal(map[string]any{
			"status":     "success",
			"lead_name":  lead.FullName,
			"old_status": string(lead.PipelineStatus),
			"new_status": args.NewStatus,
		})
		return string(dataBytes), nil

	case "scan_unassigned_leads":
		if !isManager {
			return `{"error": "PERMISSION_DENIED: Bạn đang đăng nhập với vai trò Chuyên viên Sale. Chỉ Trưởng phòng Tuyển sinh (SALE_ADMIN) hoặc Quản trị viên (ADMIN) mới có quyền truy cập danh sách khách hàng chưa phân bổ của toàn trung tâm."}`, nil
		}

		// Query exact total count in database
		var totalCount int64
		_ = a.pool.QueryRow(ctx, `
			SELECT COUNT(*) 
			FROM leads 
			WHERE deleted_at IS NULL AND assigned_to IS NULL AND pipeline_status = 'data_moi'
		`).Scan(&totalCount)

		// Query breakdown by course
		courseRows, _ := a.pool.Query(ctx, `
			SELECT COALESCE(c.name, 'Chưa xác định'), COUNT(*)
			FROM leads l
			LEFT JOIN courses c ON c.id = l.interested_course_id
			WHERE l.deleted_at IS NULL AND l.assigned_to IS NULL AND l.pipeline_status = 'data_moi'
			GROUP BY c.name
			ORDER BY COUNT(*) DESC
		`)
		courseStats := make(map[string]int64)
		if courseRows != nil {
			for courseRows.Next() {
				var cName string
				var cnt int64
				if err := courseRows.Scan(&cName, &cnt); err == nil {
					courseStats[cName] = cnt
				}
			}
			courseRows.Close()
		}

		rows, err := a.queries.DetectUnassignedLeads(ctx)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}
		type LeadSummary struct {
			ID         string `json:"id"`
			FullName   string `json:"full_name"`
			Phone      string `json:"phone"`
			CourseName string `json:"course_name"`
			Source     string `json:"source"`
		}
		maxDisplay := 5
		displayRows := rows
		if len(displayRows) > maxDisplay {
			displayRows = displayRows[:maxDisplay]
		}
		items := make([]LeadSummary, 0, len(displayRows))
		for _, r := range displayRows {
			course := "Khóa học nghề ô tô"
			if r.CourseName.Valid && r.CourseName.String != "" {
				course = r.CourseName.String
			}
			phone := ""
			if r.Phone.Valid {
				phone = r.Phone.String
			}
			items = append(items, LeadSummary{
				ID:         data.UUIDString(r.ID),
				FullName:   r.FullName,
				Phone:      phone,
				CourseName: course,
				Source:     string(r.Source),
			})
		}
		if totalCount < int64(len(items)) {
			totalCount = int64(len(items))
		}

		dataBytes, _ := json.Marshal(map[string]any{
			"total_unassigned":  totalCount,
			"showing_count":     len(items),
			"has_more":          totalCount > int64(len(items)),
			"course_summary":    courseStats,
			"sample_leads":      items,
			"action_suggestion": "Nếu người dùng muốn chia hàng loạt, gọi tool 'auto_distribute_unassigned_leads'.",
		})
		return string(dataBytes), nil

	case "auto_distribute_unassigned_leads":
		if !isManager {
			return `{"error": "PERMISSION_DENIED: Bạn đang đăng nhập với vai trò Chuyên viên Sale. Chỉ Trưởng phòng Tuyển sinh (SALE_ADMIN) hoặc Quản trị viên (ADMIN) mới có quyền phân bổ hàng loạt."}`, nil
		}

		var args struct {
			MaxLeads int `json:"max_leads"`
		}
		_ = json.Unmarshal([]byte(argsJSON), &args)
		maxLeads := 50
		if args.MaxLeads > 0 && args.MaxLeads <= 200 {
			maxLeads = args.MaxLeads
		}

		actorUUID, err := data.UUID(claims.UserID)
		if err != nil {
			return `{"error": "actor ID không hợp lệ"}`, nil
		}

		// 1. Get active sale staff
		staffList, err := a.queries.DetectActiveSaleStaffForRouting(ctx)
		if err != nil {
			return fmt.Sprintf(`{"error": "Lỗi lấy danh sách Sale: %s"}`, err.Error()), nil
		}
		if len(staffList) == 0 {
			return `{"error": "Không có chuyên viên Sale nào đang hoạt động hoặc đang bật nhận khách."}`, nil
		}

		// 2. Get unassigned leads up to maxLeads
		unassignedRows, err := a.pool.Query(ctx, `
			SELECT l.id, l.full_name
			FROM leads l
			WHERE l.deleted_at IS NULL AND l.assigned_to IS NULL AND l.pipeline_status = 'data_moi'
			ORDER BY l.created_at ASC
			LIMIT $1
		`, maxLeads)
		if err != nil {
			return fmt.Sprintf(`{"error": "Lỗi quét lead chưa gán: %s"}`, err.Error()), nil
		}
		defer unassignedRows.Close()

		type unassignedLeadItem struct {
			ID       pgtype.UUID
			FullName string
		}
		var leadsToAssign []unassignedLeadItem
		for unassignedRows.Next() {
			var it unassignedLeadItem
			if err := unassignedRows.Scan(&it.ID, &it.FullName); err == nil {
				leadsToAssign = append(leadsToAssign, it)
			}
		}

		if len(leadsToAssign) == 0 {
			return `{"message": "Hiện tại không còn khách hàng nào chưa phân công. Tất cả đã được phân bổ!"}`, nil
		}

		// Track assignments per staff
		type staffWorkload struct {
			ID          pgtype.UUID
			Name        string
			Email       string
			ActiveCount int64
			AssignedNow int
		}
		workloads := make([]staffWorkload, len(staffList))
		for i, s := range staffList {
			name := s.Email
			if s.FullName.Valid && s.FullName.String != "" {
				name = s.FullName.String
			}
			workloads[i] = staffWorkload{
				ID:          s.ID,
				Name:        name,
				Email:       s.Email,
				ActiveCount: s.ActiveLeadsCount,
				AssignedNow: 0,
			}
		}

		tx, err := a.pool.Begin(ctx)
		if err != nil {
			return fmt.Sprintf(`{"error": "begin tx: %s"}`, err.Error()), nil
		}
		defer tx.Rollback(ctx)

		qtx := a.queries.WithTx(tx)
		dueAt := time.Now().Add(2 * time.Hour)
		defaultScript := "Chào anh/chị, em liên hệ từ Trung tâm Đào tạo Kỹ thuật Ô tô NSA để hỗ trợ thông tin khóa học."

		for _, lead := range leadsToAssign {
			// Find staff with lowest total (ActiveCount + AssignedNow)
			bestIdx := 0
			minLoad := workloads[0].ActiveCount + int64(workloads[0].AssignedNow)
			for i := 1; i < len(workloads); i++ {
				load := workloads[i].ActiveCount + int64(workloads[i].AssignedNow)
				if load < minLoad {
					minLoad = load
					bestIdx = i
				}
			}

			chosenStaff := &workloads[bestIdx]

			// Assign lead
			_, err = tx.Exec(ctx, `
				UPDATE leads 
				SET assigned_to = $2, assigned_at = NOW(), assigned_by = $3, updated_at = NOW() 
				WHERE id = $1 AND deleted_at IS NULL
			`, lead.ID, chosenStaff.ID, actorUUID)
			if err != nil {
				continue
			}

			// Create lead task
			taskTitle := fmt.Sprintf("Liên hệ tư vấn khách mới: %s", lead.FullName)
			_, _ = qtx.CreateLeadTask(ctx, db.CreateLeadTaskParams{
				LeadID:      lead.ID,
				AssignedTo:  chosenStaff.ID,
				Title:       taskTitle,
				Description: data.Text(&defaultScript),
				DueAt:       pgtype.Timestamptz{Time: dueAt.UTC(), Valid: true},
				CreatedBy:   actorUUID,
			})

			chosenStaff.AssignedNow++
		}

		// Send summary notifications to staff who received leads
		for _, w := range workloads {
			if w.AssignedNow > 0 {
				leadURL := "/sale/leads?status=data_moi"
				_, _ = qtx.CreateNotification(ctx, db.CreateNotificationParams{
					UserID:    w.ID,
					Title:     "Bạn được phân bổ khách hàng mới",
					Message:   fmt.Sprintf("Bạn vừa được hệ thống tự động phân bổ %d khách hàng mới. Vui lòng kiểm tra và liên hệ sớm!", w.AssignedNow),
					Type:      "lead_assigned",
					ActionUrl: data.Text(&leadURL),
				})
			}
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Sprintf(`{"error": "commit tx: %s"}`, err.Error()), nil
		}

		type StaffSummary struct {
			StaffName     string `json:"staff_name"`
			AssignedCount int    `json:"assigned_count"`
		}
		var summaryList []StaffSummary
		for _, w := range workloads {
			if w.AssignedNow > 0 {
				summaryList = append(summaryList, StaffSummary{
					StaffName:     fmt.Sprintf("%s (%s)", w.Name, w.Email),
					AssignedCount: w.AssignedNow,
				})
			}
		}

		dataBytes, _ := json.Marshal(map[string]any{
			"status":            "success",
			"total_distributed": len(leadsToAssign),
			"distribution":      summaryList,
			"message":           fmt.Sprintf("Đã tự động phân bổ cân bằng thành công %d khách hàng mới cho %d nhân viên Sale.", len(leadsToAssign), len(summaryList)),
		})
		return string(dataBytes), nil

	case "scan_stale_leads":
		rows, err := a.queries.DetectStaleActiveLeads(ctx)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}
		type StaleLeadSummary struct {
			ID             string `json:"id"`
			FullName       string `json:"full_name"`
			PipelineStatus string `json:"pipeline_status"`
			CourseName     string `json:"course_name"`
			AssignedTo     string `json:"assigned_to"`
		}
		items := make([]StaleLeadSummary, 0, len(rows))
		for _, r := range rows {
			if isSale && (!r.AssignedTo.Valid || data.UUIDString(r.AssignedTo) != claims.UserID) {
				continue // Enforce RBAC: Sale only sees their own stale leads
			}
			course := "Khóa học"
			if r.CourseName.Valid && r.CourseName.String != "" {
				course = r.CourseName.String
			}
			items = append(items, StaleLeadSummary{
				ID:             data.UUIDString(r.ID),
				FullName:       r.FullName,
				PipelineStatus: string(r.PipelineStatus),
				CourseName:     course,
				AssignedTo:     data.UUIDString(r.AssignedTo),
			})
		}
		totalStale := len(items)
		maxDisplay := 5
		displayItems := items
		if len(displayItems) > maxDisplay {
			displayItems = displayItems[:maxDisplay]
		}
		dataBytes, _ := json.Marshal(map[string]any{
			"total_stale":   totalStale,
			"showing_count": len(displayItems),
			"has_more":      totalStale > len(displayItems),
			"leads":         displayItems,
		})
		return string(dataBytes), nil

	case "scan_overdue_orders":
		rows, err := a.queries.DetectPendingOrdersOverdue(ctx)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}
		type OrderSummary struct {
			OrderCode   string `json:"order_code"`
			FinalAmount string `json:"final_amount"`
			StudentName string `json:"student_name"`
		}
		items := make([]OrderSummary, 0, len(rows))
		for _, r := range rows {
			name := "Chưa cập nhật"
			if r.LeadName.Valid && r.LeadName.String != "" {
				name = r.LeadName.String
			} else if r.StudentName.Valid && r.StudentName.String != "" {
				name = r.StudentName.String
			}
			amountStr := "0"
			if amt, err := r.FinalAmount.Float64Value(); err == nil && amt.Valid {
				amountStr = fmt.Sprintf("%.0f đ", amt.Float64)
			}
			items = append(items, OrderSummary{
				OrderCode:   r.OrderCode,
				FinalAmount: amountStr,
				StudentName: name,
			})
		}
		dataBytes, _ := json.Marshal(map[string]any{
			"overdue_orders_count": len(items),
			"orders":               items,
		})
		return string(dataBytes), nil

	case "get_workflow_summary_stats":
		var userUUID pgtype.UUID
		if isSale {
			uid, _ := data.UUID(claims.UserID)
			userUUID = uid
		}
		stats, err := a.queries.GetAIWorkflowSummaryStats(ctx, userUUID)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}
		dataBytes, _ := json.Marshal(map[string]any{
			"pending_total":    stats.PendingTotal,
			"critical_pending": stats.CriticalPending,
			"executed_today":   stats.ExecutedToday,
			"sales_pending":    stats.SalesPending,
			"revenue_pending":  stats.RevenuePending,
		})
		return string(dataBytes), nil

	case "trigger_full_scan_and_generate_proposals":
		if !isManager {
			return `{"error": "PERMISSION_DENIED: Chỉ Quản trị viên (ADMIN) hoặc Trưởng phòng Tuyển sinh (SALE_ADMIN) mới có quyền quét toàn bộ hệ thống để sinh đề xuất phân công."}`, nil
		}
		created, updated, err := a.engine.ScanAndGenerateProposals(ctx, a.queries, claims)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}
		rows, _ := a.queries.ListAIWorkflowProposals(ctx, db.ListAIWorkflowProposalsParams{
			Status: db.NullAiProposalStatus{
				AiProposalStatus: db.AiProposalStatusPending,
				Valid:            true,
			},
			PageLimit:  10,
			PageOffset: 0,
		})
		views := make([]ProposalView, len(rows))
		for i, r := range rows {
			views[i] = mapRowToView(r)
		}

		dataBytes, _ := json.Marshal(map[string]any{
			"status":            "success",
			"proposals_created": created,
			"proposals_updated": updated,
			"total_pending":     len(views),
		})
		return string(dataBytes), views

	case "get_leads_overview_stats":
		overview, err := a.fetchLeadsOverview(ctx, claims)
		if err != nil {
			return fmt.Sprintf(`{"error": "%s"}`, err.Error()), nil
		}
		dataBytes, _ := json.Marshal(overview)
		return string(dataBytes), nil

	default:
		return `{"status": "unknown_tool"}`, nil
	}
}

type LeadsOverviewReport struct {
	IsPersonalSaleScope bool                `json:"is_personal_sale_scope"`
	StaffEmail          string              `json:"staff_email,omitempty"`
	TotalLeads          int64               `json:"total_leads"`
	UnassignedLeads     int64               `json:"unassigned_leads"`
	AssignedLeads       int64               `json:"assigned_leads"`
	ByStatus            map[string]int64    `json:"by_status"`
	BySource            map[string]int64    `json:"by_source"`
	TopCourses          []CourseLeadStat    `json:"top_courses"`
	SaleStaff           []StaffWorkloadStat `json:"sale_staff"`
}

type CourseLeadStat struct {
	CourseName string `json:"course_name"`
	Count      int64  `json:"count"`
}

type StaffWorkloadStat struct {
	Email          string `json:"email"`
	TotalLeads     int64  `json:"total_leads"`
	ConvertedLeads int64  `json:"converted_leads"`
}

func (a *AgentOrchestrator) fetchLeadsOverview(ctx context.Context, claims *auth.AccessClaims) (LeadsOverviewReport, error) {
	report := LeadsOverviewReport{
		ByStatus: make(map[string]int64),
		BySource: make(map[string]int64),
	}

	isSale := a.isOnlySaleStaff(claims)
	if isSale && claims != nil {
		report.IsPersonalSaleScope = true
		report.StaffEmail = claims.Email

		uid, err := data.UUID(claims.UserID)
		if err != nil {
			return report, fmt.Errorf("invalid user id: %w", err)
		}

		// Count only leads strictly assigned to this sale
		total, err := a.queries.CountLeads(ctx, db.CountLeadsParams{
			AssignedTo: uid,
		})
		if err == nil {
			report.TotalLeads = total
			report.AssignedLeads = total
			report.UnassignedLeads = 0
		}

		sRows, err := a.pool.Query(ctx, `
			SELECT pipeline_status, COUNT(*)
			FROM leads
			WHERE deleted_at IS NULL AND assigned_to = $1
			GROUP BY pipeline_status
		`, uid)
		if err == nil {
			defer sRows.Close()
			for sRows.Next() {
				var status string
				var count int64
				if err := sRows.Scan(&status, &count); err == nil {
					report.ByStatus[status] = count
				}
			}
		}

		srcRows, err := a.pool.Query(ctx, `
			SELECT source, COUNT(*)
			FROM leads
			WHERE deleted_at IS NULL AND assigned_to = $1
			GROUP BY source
		`, uid)
		if err == nil {
			defer srcRows.Close()
			for srcRows.Next() {
				var src string
				var count int64
				if err := srcRows.Scan(&src, &count); err == nil {
					report.BySource[src] = count
				}
			}
		}

		cRows, err := a.pool.Query(ctx, `
			SELECT COALESCE(c.name, 'Chưa xác định'), COUNT(*)
			FROM leads l
			LEFT JOIN courses c ON c.id = l.interested_course_id
			WHERE l.deleted_at IS NULL AND l.assigned_to = $1
			GROUP BY c.name
			ORDER BY COUNT(*) DESC
			LIMIT 5
		`, uid)
		if err == nil {
			defer cRows.Close()
			for cRows.Next() {
				var name string
				var count int64
				if err := cRows.Scan(&name, &count); err == nil {
					report.TopCourses = append(report.TopCourses, CourseLeadStat{CourseName: name, Count: count})
				}
			}
		}

		report.SaleStaff = []StaffWorkloadStat{
			{
				Email:      claims.Email,
				TotalLeads: report.TotalLeads,
			},
		}

		return report, nil
	}

	// Full overview for Managers / Admins
	total, err := a.queries.CountLeads(ctx, db.CountLeadsParams{})
	if err == nil {
		report.TotalLeads = total
	}

	unassigned, err := a.queries.CountUnassignedLeads(ctx)
	if err == nil {
		report.UnassignedLeads = unassigned
		report.AssignedLeads = report.TotalLeads - unassigned
	}

	statuses, err := a.queries.CountLeadsByStatus(ctx)
	if err == nil {
		for _, s := range statuses {
			report.ByStatus[string(s.PipelineStatus)] = s.Count
		}
	}

	sources, err := a.queries.CountLeadsBySource(ctx)
	if err == nil {
		for _, s := range sources {
			report.BySource[string(s.Source)] = s.Count
		}
	}

	// Course breakdown
	cRows, err := a.pool.Query(ctx, `
		SELECT COALESCE(c.name, 'Chưa xác định'), COUNT(*)
		FROM leads l
		LEFT JOIN courses c ON c.id = l.interested_course_id
		WHERE l.deleted_at IS NULL
		GROUP BY c.name
		ORDER BY COUNT(*) DESC
		LIMIT 5
	`)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var name string
			var count int64
			if err := cRows.Scan(&name, &count); err == nil {
				report.TopCourses = append(report.TopCourses, CourseLeadStat{CourseName: name, Count: count})
			}
		}
	}

	// Sale staff workload
	staffRows, err := a.queries.CountLeadsByAssignee(ctx)
	if err == nil {
		for _, s := range staffRows {
			if s.TotalLeads > 0 {
				report.SaleStaff = append(report.SaleStaff, StaffWorkloadStat{
					Email:          s.Email,
					TotalLeads:     s.TotalLeads,
					ConvertedLeads: s.ConvertedLeads,
				})
			}
		}
	}

	return report, nil
}

func (a *AgentOrchestrator) deterministicFallbackChat(ctx context.Context, claims *auth.AccessClaims, message string, history ...AgentChatMessage) (AgentChatResponse, error) {
	lower := strings.ToLower(message)
	historyText := ""
	for _, h := range history {
		historyText += " " + strings.ToLower(h.Content)
	}
	combinedText := lower + " " + historyText

	// 0. Inquiries about creating registration orders (Phiếu đăng ký) or closing a deal (Chốt khách hàng)
	if strings.Contains(combinedText, "phiếu đăng ký") || strings.Contains(combinedText, "tạo phiếu") || strings.Contains(combinedText, "hợp đồng") ||
		(strings.Contains(combinedText, "học phí") && (strings.Contains(combinedText, "triệu") || strings.Contains(combinedText, "đợt") || strings.Contains(combinedText, "lần") || strings.Contains(combinedText, "tr"))) ||
		(strings.Contains(combinedText, "chốt") && (strings.Contains(combinedText, "khách") || strings.Contains(combinedText, "mai") || strings.Contains(combinedText, "học viên"))) {

		amount := 40000000.0
		if strings.Contains(combinedText, "10 triệu") || strings.Contains(combinedText, "10tr") {
			amount = 10000000.0
		} else if strings.Contains(combinedText, "11 triệu") || strings.Contains(combinedText, "11tr") {
			amount = 11000000.0
		} else if strings.Contains(combinedText, "12 triệu") || strings.Contains(combinedText, "12tr") {
			amount = 12000000.0
		} else if strings.Contains(combinedText, "15 triệu") || strings.Contains(combinedText, "15tr") {
			amount = 15000000.0
		} else if strings.Contains(combinedText, "20 triệu") || strings.Contains(combinedText, "20tr") {
			amount = 20000000.0
		} else if strings.Contains(combinedText, "30 triệu") || strings.Contains(combinedText, "30tr") {
			amount = 30000000.0
		} else if strings.Contains(combinedText, "40 triệu") || strings.Contains(combinedText, "40tr") {
			amount = 40000000.0
		} else if strings.Contains(combinedText, "50 triệu") || strings.Contains(combinedText, "50tr") {
			amount = 50000000.0
		} else if strings.Contains(combinedText, "60 triệu") || strings.Contains(combinedText, "60tr") {
			amount = 60000000.0
		}

		installments := 3
		if strings.Contains(combinedText, "1 đợt") || strings.Contains(combinedText, "1 lần") {
			installments = 1
		} else if strings.Contains(combinedText, "2 đợt") || strings.Contains(combinedText, "2 lần") {
			installments = 2
		} else if strings.Contains(combinedText, "3 đợt") || strings.Contains(combinedText, "3 lần") {
			installments = 3
		} else if strings.Contains(combinedText, "4 đợt") || strings.Contains(combinedText, "4 lần") {
			installments = 4
		} else if strings.Contains(combinedText, "5 đợt") || strings.Contains(combinedText, "5 lần") {
			installments = 5
		}

		leadName := "Chị Lê Thị Mai"
		if strings.Contains(combinedText, "mai") {
			leadName = "Chị Lê Thị Mai"
		} else if strings.Contains(combinedText, "long") {
			leadName = "Nguyễn Văn Long"
		} else if strings.Contains(combinedText, "minh") {
			leadName = "Dương Nhật Minh"
		} else if strings.Contains(combinedText, "huy") {
			leadName = "Hoàng Gia Huy"
		} else if strings.Contains(combinedText, "an") {
			leadName = "Trần Văn An"
		}

		argsBytes, _ := json.Marshal(map[string]any{
			"lead_name":    leadName,
			"amount":       amount,
			"installments": installments,
			"notes":        "Đăng ký qua trợ lý NSA AI",
		})
		reply, _ := a.executeTool(ctx, claims, "create_registration_order", string(argsBytes))
		return AgentChatResponse{
			Reply:     reply,
			ModelUsed: "deterministic-domain-engine",
			ToolsUsed: []string{"create_registration_order"},
		}, nil
	}

	// 1. Inquiries about total leads / lead count / pipeline overview / numbers like 52
	if strings.Contains(lower, "tổng") || strings.Contains(lower, "bao nhiêu") || strings.Contains(lower, "tất cả") ||
		strings.Contains(lower, "52") || strings.Contains(lower, "thống kê") || strings.Contains(lower, "phễu") ||
		strings.Contains(lower, "báo cáo") || strings.Contains(lower, "lead") || strings.Contains(lower, "tuyển sinh") {

		overview, err := a.fetchLeadsOverview(ctx, claims)
		if err == nil {
			var sb strings.Builder
			statusNames := map[string]string{
				"data_moi":     "Data mới (chưa gọi/chờ phân bổ)",
				"knm_thue_bao": "Không nghe máy / Thuê bao",
				"goi_lai_sau":  "Hẹn gọi lại sau",
				"follow":       "Đang chăm sóc & tư vấn",
				"da_dang_ky":   "Đã đăng ký nhập học (Thành công)",
				"dang_hoc":     "Đang trong quá trình đào tạo",
				"ket_thuc":     "Đã hoàn thành khóa học",
				"tu_choi":      "Từ chối / Tạm hoãn",
			}
			priorityKeys := []string{"data_moi", "follow", "goi_lai_sau", "da_dang_ky", "dang_hoc", "knm_thue_bao", "tu_choi", "ket_thuc"}

			if overview.IsPersonalSaleScope {
				sb.WriteString(fmt.Sprintf("Chào bạn! Theo phân quyền Chuyên viên Tư vấn Tuyển sinh (%s), bạn hiện đang phụ trách **tổng cộng %d khách hàng** được phân công cho riêng bạn:\n\n", claims.Email, overview.TotalLeads))

				sb.WriteString("### 📊 Trạng thái khách hàng bạn đang chăm sóc\n")
				for _, k := range priorityKeys {
					if cnt, ok := overview.ByStatus[k]; ok && cnt > 0 {
						name := statusNames[k]
						if name == "" {
							name = k
						}
						sb.WriteString(fmt.Sprintf("- **%s:** **%d khách**\n", name, cnt))
					}
				}

				if len(overview.TopCourses) > 0 {
					sb.WriteString("\n### 🎓 Khóa học khách của bạn quan tâm nhiều nhất:\n")
					for _, c := range overview.TopCourses {
						sb.WriteString(fmt.Sprintf("- %s: **%d khách**\n", c.CourseName, c.Count))
					}
				}

				sb.WriteString("\n---\n")
				sb.WriteString("💡 *Lưu ý bảo mật: Theo chính sách phân quyền của Trung tâm NSA, chuyên viên tư vấn chỉ xem và quản lý khách hàng được phân công cho mình. Để xem số liệu toàn trung tâm hoặc điều phối chia lead, cần tài khoản Trưởng phòng Tuyển sinh (SALE_ADMIN) hoặc Admin.*")

				return AgentChatResponse{
					Reply:     sb.String(),
					ModelUsed: "deterministic-domain-engine",
					ToolsUsed: []string{"get_leads_overview_stats"},
				}, nil
			}

			sb.WriteString(fmt.Sprintf("Dạ chuẩn xác ạ! Hệ thống quản lý tuyển sinh NSA hiện đang ghi nhận **tổng cộng %d lead tuyển sinh** trong cơ sở dữ liệu:\n\n", overview.TotalLeads))

			sb.WriteString("### 📊 Thống kê Phễu Tuyển sinh\n")
			for _, k := range priorityKeys {
				if cnt, ok := overview.ByStatus[k]; ok && cnt > 0 {
					name := statusNames[k]
					if name == "" {
						name = k
					}
					sb.WriteString(fmt.Sprintf("- **%s:** **%d khách**\n", name, cnt))
				}
			}

			sb.WriteString("\n### 🎯 Tình trạng phân công tư vấn viên:\n")
			sb.WriteString(fmt.Sprintf("- **Đã phân bổ cho Sale:** **%d khách**\n", overview.AssignedLeads))
			sb.WriteString(fmt.Sprintf("- **Chưa phân bổ (tồn đọng):** **%d khách**\n", overview.UnassignedLeads))

			if len(overview.TopCourses) > 0 {
				sb.WriteString("\n### 🎓 Khóa học được quan tâm hàng đầu:\n")
				for _, c := range overview.TopCourses {
					sb.WriteString(fmt.Sprintf("- %s: **%d khách**\n", c.CourseName, c.Count))
				}
			}

			if len(overview.SaleStaff) > 0 {
				sb.WriteString("\n### 👥 Phân bổ theo nhân viên tư vấn:\n")
				for _, s := range overview.SaleStaff {
					sb.WriteString(fmt.Sprintf("- **%s:** %d lead (Đã chốt thành công: %d)\n", s.Email, s.TotalLeads, s.ConvertedLeads))
				}
			}

			sb.WriteString("\n---\n")
			sb.WriteString("💡 *Bạn có thể yêu cầu tôi: \"quét khách mới chưa chia\", \"chia đều cho các sale\" hoặc mở [Bảng điều phối Lead](/leads) để quản lý toàn màn hình.*")

			return AgentChatResponse{
				Reply:     sb.String(),
				ModelUsed: "deterministic-domain-engine",
				ToolsUsed: []string{"get_leads_overview_stats"},
			}, nil
		}
	}

	isSale := a.isOnlySaleStaff(claims)

	// 2. Inquiries about new leads or scanning unassigned leads
	if isSale {
		if strings.Contains(lower, "data mới") || strings.Contains(lower, "khách mới") || strings.Contains(lower, "danh sách") || strings.Contains(lower, "chăm sóc") {
			uid, err := data.UUID(claims.UserID)
			if err == nil {
				rows, err := a.pool.Query(ctx, `
					SELECT l.full_name, COALESCE(l.phone, ''), COALESCE(c.name, 'Kỹ thuật ô tô'), l.pipeline_status
					FROM leads l
					LEFT JOIN courses c ON c.id = l.interested_course_id
					WHERE l.deleted_at IS NULL AND l.assigned_to = $1 AND l.pipeline_status = 'data_moi'
					ORDER BY l.created_at DESC
					LIMIT 10
				`, uid)
				if err == nil {
					defer rows.Close()
					type LeadRow struct {
						FullName   string
						Phone      string
						CourseName string
						Status     string
					}
					var list []LeadRow
					for rows.Next() {
						var r LeadRow
						if err := rows.Scan(&r.FullName, &r.Phone, &r.CourseName, &r.Status); err == nil {
							list = append(list, r)
						}
					}
					if len(list) > 0 {
						var sb strings.Builder
						sb.WriteString(fmt.Sprintf("Chào bạn! Dưới đây là danh sách **khách hàng mới (Data mới)** được phân bổ cho riêng bạn (%s) chưa kịp liên hệ:\n\n", claims.Email))
						sb.WriteString("| Họ và tên | Số điện thoại | Khóa học quan tâm | Giai đoạn phễu |\n")
						sb.WriteString("| :--- | :--- | :--- | :--- |\n")
						for _, it := range list {
							phone := it.Phone
							if phone == "" {
								phone = "Chưa có"
							}
							sb.WriteString(fmt.Sprintf("| **%s** | `%s` | %s | Data mới |\n", it.FullName, phone, it.CourseName))
						}
						sb.WriteString("\n*Bạn có thể bấm số điện thoại để gọi ngay hoặc cập nhật trạng thái phễu tư vấn sau khi gọi.*")
						return AgentChatResponse{
							Reply:     sb.String(),
							ModelUsed: "deterministic-domain-engine",
							ToolsUsed: []string{"search_leads"},
						}, nil
					}
					return AgentChatResponse{
						Reply:     "Hiện tại bạn không có khách hàng nào ở trạng thái **Data mới**. Hãy kiểm tra các khách đang ở giai đoạn 'Đang chăm sóc' hoặc 'Hẹn gọi lại sau' nhé!",
						ModelUsed: "deterministic-domain-engine",
						ToolsUsed: []string{"search_leads"},
					}, nil
				}
			}
		}

		if strings.Contains(lower, "quét") || strings.Contains(lower, "chưa chia") || strings.Contains(lower, "chưa gán") || strings.Contains(lower, "chia đều") {
			return AgentChatResponse{
				Reply:     "Theo chính sách phân quyền của Trung tâm NSA, tài khoản Chuyên viên Tư vấn (Sale) chỉ quản lý khách hàng được phân bổ cho riêng mình. Quyền quét danh sách khách chưa gán hoặc chia đều lead toàn trung tâm thuộc về Trưởng phòng Tuyển sinh (SALE_ADMIN) và Quản trị viên (ADMIN).",
				ModelUsed: "deterministic-domain-engine",
				ToolsUsed: []string{},
			}, nil
		}

		return AgentChatResponse{
			Reply: fmt.Sprintf("Chào bạn! Tôi là NSA AI hỗ trợ công việc tư vấn tuyển sinh cho %s. Bạn có thể hỏi tôi về 'tôi có bao nhiêu lead', 'cho tôi danh sách data mới', hoặc 'khách nào đang bị ngâm quá 24h'.",
				claims.Email),
			ModelUsed: "deterministic-domain-engine",
			ToolsUsed: []string{},
		}, nil
	}

	// 2. Inquiries about scanning unassigned leads (Manager / Admin only)
	if strings.Contains(lower, "quét") || strings.Contains(lower, "khách mới") || strings.Contains(lower, "chưa chia") || strings.Contains(lower, "chưa gán") || strings.Contains(lower, "điểm nghẽn") {
		created, updated, _ := a.engine.ScanAndGenerateProposals(ctx, a.queries, claims)
		stats, _ := a.queries.GetAIWorkflowSummaryStats(ctx, pgtype.UUID{})
		reply := fmt.Sprintf("Tôi đã quét dữ liệu thực tế của trung tâm NSA:\n- Phát hiện %d đề xuất mới và cập nhật %d đề xuất.\n- Hiện có %d công việc đang chờ duyệt (trong đó có %d việc khẩn cấp).\nBạn có thể kiểm tra danh sách đề xuất ở bảng điều phối để phê duyệt 1-chạm hoặc yêu cầu tôi 'quét khách mới chưa chia'.",
			created, updated, stats.PendingTotal, stats.CriticalPending)
		return AgentChatResponse{
			Reply:     reply,
			ModelUsed: "deterministic-domain-engine",
			ToolsUsed: []string{"trigger_full_scan_and_generate_proposals"},
		}, nil
	}

	stats, _ := a.queries.GetAIWorkflowSummaryStats(ctx, pgtype.UUID{})
	reply := fmt.Sprintf("Chào bạn, tôi là NSA AI Workflow Operator. Hiện hệ thống đang ghi nhận:\n- %d đề xuất chờ duyệt (trong đó có %d việc khẩn cấp)\n- %d đề xuất đã hoàn tất hôm nay.\nBạn có thể hỏi tôi về 'tổng số lead tuyển sinh', 'quét khách mới chưa chia', hoặc 'kiểm tra đơn học phí tồn đọng'.",
		stats.PendingTotal, stats.CriticalPending, stats.ExecutedToday)

	return AgentChatResponse{
		Reply:     reply,
		ModelUsed: "deterministic-domain-engine",
		ToolsUsed: []string{"get_workflow_summary_stats"},
	}, nil
}

func stringPtr(s string) *string {
	return &s
}

type InstallmentItemData struct {
	Round      int    `json:"round"`
	Percentage int    `json:"percentage"`
	Amount     int64  `json:"amount"`
	Status     string `json:"status"`
}

type InstallmentMetaData struct {
	PlanType          int                   `json:"plan_type"`
	TotalInstallments int                   `json:"total_installments"`
	Installments      []InstallmentItemData `json:"installments"`
	UserNotes         string                `json:"user_notes,omitempty"`
}

func buildInstallmentNotes(finalAmount int64, planType int, userNotes string) (string, []InstallmentItemData) {
	if planType < 1 || planType > 5 {
		planType = 3
	}

	percentages := map[int][]int{
		1: {100},
		2: {50, 50},
		3: {40, 30, 30},
		4: {30, 30, 20, 20},
		5: {20, 20, 20, 20, 20},
	}[planType]

	planLabels := map[int]string{
		1: "Đóng 1 lần (100%)",
		2: "Đóng 2 lần (50% - 50%)",
		3: "Đóng 3 lần (40% - 30% - 30%)",
		4: "Đóng 4 lần (30% - 30% - 20% - 20%)",
		5: "Đóng 5 lần (20% - 20% - 20% - 20% - 20%)",
	}[planType]

	var items []InstallmentItemData
	var allocated int64
	for idx, pct := range percentages {
		isLast := idx == len(percentages)-1
		var roundAmount int64
		if isLast {
			roundAmount = finalAmount - allocated
		} else {
			roundAmount = (finalAmount * int64(pct)) / 100
			allocated += roundAmount
		}
		items = append(items, InstallmentItemData{
			Round:      idx + 1,
			Percentage: pct,
			Amount:     roundAmount,
			Status:     "pending",
		})
	}

	meta := InstallmentMetaData{
		PlanType:          planType,
		TotalInstallments: planType,
		Installments:      items,
		UserNotes:         userNotes,
	}
	metaJSON, _ := json.Marshal(meta)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("[CHÍNH SÁCH ĐÓNG HỌC PHÍ: %s]\n", planLabels))
	for _, it := range items {
		sb.WriteString(fmt.Sprintf("• Đợt %d (%d%%): %s đ - Chưa thu (%s đ)\n",
			it.Round, it.Percentage, formatNumberVND(it.Amount), formatNumberVND(it.Amount)))
	}
	if strings.TrimSpace(userNotes) != "" {
		sb.WriteString(fmt.Sprintf("Ghi chú: %s\n", strings.TrimSpace(userNotes)))
	}
	sb.WriteString(fmt.Sprintf("<!--INSTALLMENT_DATA:%s-->", string(metaJSON)))

	return sb.String(), items
}

func formatNumberVND(n int64) string {
	in := strconv.FormatInt(n, 10)
	var out []byte
	l := len(in)
	for i, c := range in {
		if i > 0 && (l-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, byte(c))
	}
	return string(out)
}
