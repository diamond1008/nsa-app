package aiworkflows

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/diamond1008/nsa-training-platform/apps/api/internal/auth"
	db "github.com/diamond1008/nsa-training-platform/database/generated"
)

type Engine struct{}

func NewEngine() *Engine {
	return &Engine{}
}

func (e *Engine) ScanAndGenerateProposals(ctx context.Context, q *db.Queries, claims *auth.AccessClaims) (int, int, error) {
	createdCount := 0
	updatedCount := 0

	// 1. Detect unassigned leads (LEAD_ROUTING_SLA)
	activeStaff, err := q.DetectActiveSaleStaffForRouting(ctx)
	if err == nil && len(activeStaff) > 0 {
		unassignedLeads, err := q.DetectUnassignedLeads(ctx)
		if err == nil {
			staffIndex := 0
			for _, lead := range unassignedLeads {
				staff := activeStaff[staffIndex%len(activeStaff)]
				staffIndex++

				courseName := "khóa học chuyên môn"
				if lead.CourseName.Valid && lead.CourseName.String != "" {
					courseName = lead.CourseName.String
				}

				dedupKey := fmt.Sprintf("unassigned_lead_%s", lead.ID.String())
				title := fmt.Sprintf("Khách mới chưa chia: %s", lead.FullName)
				bottleneck := fmt.Sprintf("Khách hàng đăng ký từ nguồn %s lúc %s chưa được phân bổ tư vấn viên.",
					lead.Source, lead.CreatedAt.Time.Format("15:04 02/01/2006"))
				rationale := "Theo quy định SLA trung tâm, Lead mới cần được liên hệ trong vòng 15-30 phút để đạt tỷ lệ chuyển đổi cao nhất. Đề xuất gán ngay cho tư vấn viên đang sẵn sàng nhận việc."
				script := fmt.Sprintf("Chào anh/chị %s, em là %s từ Trung tâm Đào tạo NSA. Em nhận được thông tin đăng ký tìm hiểu khóa học %s của mình. Em liên hệ hỗ trợ mình thông tin chi tiết về lịch khai giảng và chính sách học phí ưu đãi đợt này ạ.",
					lead.FullName, staff.FullName.String, courseName)

				actionPayload, _ := json.Marshal(map[string]any{
					"lead_id":          lead.ID.String(),
					"assigned_user_id": staff.ID.String(),
					"assigned_email":   staff.Email,
					"auto_task":        true,
				})

				contextSnapshot, _ := json.Marshal(map[string]any{
					"lead_name":   lead.FullName,
					"source":      string(lead.Source),
					"course_name": courseName,
					"created_at":  lead.CreatedAt.Time.Format(time.RFC3339),
				})

				res, err := q.UpsertAIWorkflowProposal(ctx, db.UpsertAIWorkflowProposalParams{
					DedupKey:          dedupKey,
					WorkflowCode:      "LEAD_ROUTING_SLA",
					Domain:            db.AiWorkflowDomainSalesCrm,
					Priority:          db.AiProposalPriorityCritical,
					TargetLeadID:      lead.ID,
					TargetOrderID:     pgtype.UUID{Valid: false},
					TargetStudentID:   pgtype.UUID{Valid: false},
					TargetClassID:     pgtype.UUID{Valid: false},
					AssignedUserID:    staff.ID,
					Title:             title,
					BottleneckSummary: bottleneck,
					AiRationale:       rationale,
					SuggestedScript:   script,
					ActionType:        db.AiActionTypeAssignLead,
					ActionPayload:     actionPayload,
					ContextSnapshot:   contextSnapshot,
				})
				if err == nil {
					if res.CreatedAt.Time.Equal(res.UpdatedAt.Time) {
						createdCount++
					} else {
						updatedCount++
					}
				}
			}
		}
	}

	// 2. Detect stale active leads (PIPELINE_HYGIENE_FOLLOWUP)
	staleLeads, err := q.DetectStaleActiveLeads(ctx)
	if err == nil {
		for _, lead := range staleLeads {
			courseName := "khóa học"
			if lead.CourseName.Valid && lead.CourseName.String != "" {
				courseName = lead.CourseName.String
			}

			statusName := formatPipelineStatus(string(lead.PipelineStatus))
			dedupKey := fmt.Sprintf("stale_lead_%s_%s", lead.ID.String(), time.Now().Format("2006-01-02"))
			title := fmt.Sprintf("Cảnh báo bỏ quên: %s (%s)", lead.FullName, statusName)
			bottleneck := fmt.Sprintf("Khách hàng đang ở giai đoạn '%s', không có tương tác mới trong hơn 24 giờ qua và chưa có lịch hẹn chăm sóc tiếp theo.", statusName)
			rationale := "Khách hàng trong phễu đang có nguy cơ nguội dần hoặc tìm kiếm đơn vị khác. Cần chủ động liên hệ lại để hâm nóng nhu cầu và thúc đẩy quyết định."

			script := generateFollowupScript(lead.FullName, string(lead.PipelineStatus), courseName)

			actionPayload, _ := json.Marshal(map[string]any{
				"lead_id":          lead.ID.String(),
				"assigned_user_id": lead.AssignedTo.String(),
				"title":            fmt.Sprintf("Chăm sóc lại khách hàng: %s", lead.FullName),
				"due_hours":        4,
			})

			contextSnapshot, _ := json.Marshal(map[string]any{
				"lead_name":        lead.FullName,
				"status":           string(lead.PipelineStatus),
				"course_name":      courseName,
				"last_activity_at": lead.LastActivityAt,
			})

			res, err := q.UpsertAIWorkflowProposal(ctx, db.UpsertAIWorkflowProposalParams{
				DedupKey:          dedupKey,
				WorkflowCode:      "PIPELINE_HYGIENE_FOLLOWUP",
				Domain:            db.AiWorkflowDomainSalesCrm,
				Priority:          db.AiProposalPriorityHigh,
				TargetLeadID:      lead.ID,
				TargetOrderID:     pgtype.UUID{Valid: false},
				TargetStudentID:   pgtype.UUID{Valid: false},
				TargetClassID:     pgtype.UUID{Valid: false},
				AssignedUserID:    lead.AssignedTo,
				Title:             title,
				BottleneckSummary: bottleneck,
				AiRationale:       rationale,
				SuggestedScript:   script,
				ActionType:        db.AiActionTypeCreateFollowupTask,
				ActionPayload:     actionPayload,
				ContextSnapshot:   contextSnapshot,
			})
			if err == nil {
				if res.CreatedAt.Time.Equal(res.UpdatedAt.Time) {
					createdCount++
				} else {
					updatedCount++
				}
			}
		}
	}

	// 3. Detect pending orders overdue (ORDER_PAYMENT_FOLLOWUP)
	pendingOrders, err := q.DetectPendingOrdersOverdue(ctx)
	if err == nil {
		for _, order := range pendingOrders {
			customerName := "Học viên"
			if order.LeadName.Valid && order.LeadName.String != "" {
				customerName = order.LeadName.String
			} else if order.StudentName.Valid && order.StudentName.String != "" {
				customerName = order.StudentName.String
			}

			courseName := "khóa học"
			if order.CourseName.Valid && order.CourseName.String != "" {
				courseName = order.CourseName.String
			}

			amountStr := formatAmount(order.FinalAmount)
			dedupKey := fmt.Sprintf("pending_order_%s", order.ID.String())
			title := fmt.Sprintf("Đơn đăng ký chờ thanh toán: %s (%s đ)", order.OrderCode, amountStr)
			bottleneck := fmt.Sprintf("Phiếu đăng ký %s khóa %s trị giá %s đ đã tạo hơn 24h nhưng vẫn chưa hoàn tất đóng phí.",
				order.OrderCode, courseName, amountStr)
			rationale := "Học viên chưa hoàn tất đóng phí có rủi ro hủy đơn hoặc lỡ mất hạn chốt danh sách mở lớp. Cần nhắc phí lịch sự và giải đáp thắc mắc phương thức thanh toán."

			script := fmt.Sprintf("Chào anh/chị %s, Trung tâm Đào tạo NSA xin thông báo phiếu đăng ký %s khóa học %s của mình đã sẵn sàng. Để trung tâm kịp hoàn tất thủ tục nhập học và giữ trọn ưu đãi, anh/chị vui lòng thanh toán học phí %s đ trong hôm nay nhé ạ. Cần hỗ trợ xuất hóa đơn hay thanh toán chuyển khoản anh/chị cứ nhắn em hỗ trợ ngay ạ!",
				customerName, order.OrderCode, courseName, amountStr)

			actionPayload, _ := json.Marshal(map[string]any{
				"order_id":         order.ID.String(),
				"order_code":       order.OrderCode,
				"lead_id":          order.LeadID,
				"student_id":       order.StudentID,
				"assigned_user_id": order.CreatedBy.String(),
				"title":            fmt.Sprintf("Nhắc học phí phiếu đăng ký: %s", order.OrderCode),
				"amount":           amountStr,
			})

			contextSnapshot, _ := json.Marshal(map[string]any{
				"order_code":    order.OrderCode,
				"customer_name": customerName,
				"amount":        amountStr,
				"course_name":   courseName,
				"created_at":    order.CreatedAt.Time.Format(time.RFC3339),
			})

			res, err := q.UpsertAIWorkflowProposal(ctx, db.UpsertAIWorkflowProposalParams{
				DedupKey:          dedupKey,
				WorkflowCode:      "ORDER_PAYMENT_FOLLOWUP",
				Domain:            db.AiWorkflowDomainRevenueOps,
				Priority:          db.AiProposalPriorityHigh,
				TargetLeadID:      order.LeadID,
				TargetOrderID:     order.ID,
				TargetStudentID:   order.StudentID,
				TargetClassID:     pgtype.UUID{Valid: false},
				AssignedUserID:    order.CreatedBy,
				Title:             title,
				BottleneckSummary: bottleneck,
				AiRationale:       rationale,
				SuggestedScript:   script,
				ActionType:        db.AiActionTypeFollowupPendingOrder,
				ActionPayload:     actionPayload,
				ContextSnapshot:   contextSnapshot,
			})
			if err == nil {
				if res.CreatedAt.Time.Equal(res.UpdatedAt.Time) {
					createdCount++
				} else {
					updatedCount++
				}
			}
		}
	}

	return createdCount, updatedCount, nil
}

func (e *Engine) BuildLeadCopilotInsight(ctx context.Context, q *db.Queries, leadID pgtype.UUID) (LeadCopilotInsightView, error) {
	lead, err := q.GetLead(ctx, leadID)
	if err != nil {
		return LeadCopilotInsightView{}, err
	}

	interactions, _ := q.ListLeadInteractionsByLead(ctx, leadID)

	score := 50
	tags := []string{}

	if lead.Phone.Valid && strings.TrimSpace(lead.Phone.String) != "" {
		score += 15
		tags = append(tags, "Có SĐT")
	}
	if lead.Email.Valid && strings.TrimSpace(lead.Email.String) != "" {
		score += 10
		tags = append(tags, "Có Email")
	}
	if lead.InterestedCourseID.Valid {
		score += 15
		tags = append(tags, "Rõ nhu cầu khóa học")
	}

	// Interaction count
	if len(interactions) > 0 {
		bonus := len(interactions) * 5
		if bonus > 15 {
			bonus = 15
		}
		score += bonus
		tags = append(tags, fmt.Sprintf("%d lần tương tác", len(interactions)))
	} else {
		score -= 10
		tags = append(tags, "Chưa tương tác")
	}

	// Pipeline status weighting
	switch lead.PipelineStatus {
	case db.LeadPipelineStatusDaDangKy, db.LeadPipelineStatusDangHoc:
		score = 100
		tags = append(tags, "Đã chốt")
	case db.LeadPipelineStatusFollow:
		score += 10
		tags = append(tags, "Đang cân nhắc")
	case db.LeadPipelineStatusGoiLaiSau:
		score += 5
		tags = append(tags, "Hẹn gọi lại")
	case db.LeadPipelineStatusKnmThueBao:
		score -= 20
		tags = append(tags, "Khó liên lạc")
	case db.LeadPipelineStatusTuChoi:
		score = 15
		tags = append(tags, "Từ chối")
	}

	if score > 100 {
		score = 100
	}
	if score < 10 {
		score = 10
	}

	temp := "warm"
	if score >= 75 {
		temp = "hot"
	} else if score < 45 {
		temp = "cold"
	}

	courseName := "khóa học"
	if lead.CourseName.Valid && lead.CourseName.String != "" {
		courseName = lead.CourseName.String
	}

	summary := fmt.Sprintf("Khách hàng %s quan tâm %s từ nguồn %s. Đã có %d lượt tương tác ghi nhận trong hệ thống.",
		lead.FullName, courseName, lead.Source, len(interactions))

	bottleneck := "Chưa ghi nhận điểm nghẽn nghiêm trọng."
	nextAction := "Tiếp tục trao đổi nắm bắt mục tiêu học tập và tư vấn lộ trình phù hợp."

	if len(interactions) == 0 {
		bottleneck = "Khách hàng mới tiếp nhận chưa có cuộc gọi hoặc tin nhắn chăm sóc đầu tiên."
		nextAction = "Thực hiện cuộc gọi chào hỏi trong vòng 30 phút, giới thiệu tổng quan quyền lợi và ưu đãi."
	} else if lead.PipelineStatus == db.LeadPipelineStatusKnmThueBao {
		bottleneck = "Số điện thoại khó kết nối, dễ dẫn đến mất liên lạc hoàn toàn."
		nextAction = "Chuyển sang nhắn tin Zalo kèm hình ảnh giới thiệu khóa học, hẹn khung giờ gọi lại vào chiều tối."
	} else if lead.PipelineStatus == db.LeadPipelineStatusFollow {
		bottleneck = "Khách hàng đang đắn đo về học phí hoặc thời gian học."
		nextAction = "Gửi chính sách hỗ trợ chia đợt học phí hoặc suất quà tặng khai giảng để thúc đẩy chốt đơn."
	}

	script := generateFollowupScript(lead.FullName, string(lead.PipelineStatus), courseName)

	var recCourse *string
	if lead.CourseName.Valid && lead.CourseName.String != "" {
		recCourse = &lead.CourseName.String
	}

	return LeadCopilotInsightView{
		LeadID:            lead.ID.String(),
		FullName:          lead.FullName,
		LeadScore:         score,
		Temperature:       temp,
		Summary:           summary,
		Bottleneck:        bottleneck,
		NextBestAction:    nextAction,
		SuggestedScript:   script,
		RecommendedCourse: recCourse,
		Confidence:        0.92,
		Tags:              tags,
	}, nil
}

func formatPipelineStatus(s string) string {
	switch s {
	case "data_moi":
		return "Data mới"
	case "knm_thue_bao":
		return "KNM / Thuê bao"
	case "goi_lai_sau":
		return "Gọi lại sau"
	case "follow":
		return "Đang tư vấn"
	case "tu_choi":
		return "Từ chối"
	case "da_dang_ky":
		return "Đã đăng ký"
	case "dang_hoc":
		return "Đang học"
	case "ket_thuc":
		return "Kết thúc"
	default:
		return s
	}
}

func generateFollowupScript(fullName, status, courseName string) string {
	switch status {
	case "knm_thue_bao":
		return fmt.Sprintf("Chào anh/chị %s, em bên tuyển sinh Trung tâm NSA có liên hệ hỗ trợ mình về khóa học %s nhưng chưa kết nối được máy. Em xin phép gửi thông tin lộ trình và lịch học qua Zalo để mình tiện xem trước nhé ạ. Anh/chị rảnh khung giờ nào em xin phép gọi lại tư vấn kỹ hơn ạ!", fullName, courseName)
	case "goi_lai_sau":
		return fmt.Sprintf("Chào anh/chị %s, như đã hẹn hôm trước, em liên hệ lại để trao đổi thêm với mình về lớp %s sắp khai giảng. Hiện tại anh/chị tiện trao đổi vài phút không ạ?", fullName, courseName)
	case "follow":
		return fmt.Sprintf("Chào anh/chị %s, lớp %s đợt này hiện chỉ còn 3 suất đăng ký ưu đãi học phí cuối cùng. Em nhắn để giữ chỗ học tốt nhất cho mình, anh/chị có cần em hỗ trợ thêm thủ tục nào không ạ?", fullName, courseName)
	default:
		return fmt.Sprintf("Chào anh/chị %s, em từ Trung tâm Đào tạo NSA. Em thấy mình quan tâm khóa %s, em xin phép hỗ trợ mình thông tin chi tiết về lịch học và quyền lợi học viên nhé ạ!", fullName, courseName)
	}
}

func formatAmount(amount pgtype.Numeric) string {
	if !amount.Valid {
		return "0"
	}
	f, _ := amount.Float64Value()
	v := int64(f.Float64)
	if v == 0 {
		return "0"
	}

	str := fmt.Sprintf("%d", v)
	var parts []string
	for len(str) > 3 {
		parts = append([]string{str[len(str)-3:]}, parts...)
		str = str[:len(str)-3]
	}
	if len(str) > 0 {
		parts = append([]string{str}, parts...)
	}
	return strings.Join(parts, ".")
}
