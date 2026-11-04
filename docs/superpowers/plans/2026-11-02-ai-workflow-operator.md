# NSA AI Workflow Operator (AMOIQ-Style Human-in-the-Loop Engine) Implementation Plan

> **For agentic workers (Gemini 3.8 Flash):** REQUIRED SUB-SKILL: Follow `.agents/skills/nsa-training-portal-architecture/SKILL.md` strictly. Execute this plan task-by-task in order. Do not skip verification steps.

**Goal:** Xây dựng hệ thống **AI Workflow Operator (Điều phối Quy trình Thông minh)** chuẩn mô hình AMOIQ ngay trên nền tảng NSA: tự động quét dữ liệu thật (PostgreSQL), phát hiện điểm nghẽn vận hành (AS-IS bottlenecks), đề xuất hành động tiếp theo kèm kịch bản tư vấn (TO-BE proposals), và cho phép nhân sự **Phê duyệt 1-chạm (Human-in-the-Loop)** để hệ thống tự động thực thi vào cơ sở dữ liệu (chia Lead, tạo lịch hẹn, chuyển trạng thái, nhắc thu học phí, cảnh báo học viên nguy cơ nghỉ học).

**Architecture:**
- **Database (Goose + SQLC):** Thêm migration `00020_ai_workflow_operator.sql` lưu trữ bảng `ai_workflow_proposals` có `dedup_key` chống trùng lặp, đầy đủ ngữ cảnh JSONB và lịch sử phê duyệt.
- **Backend (`apps/api/internal/aiworkflows`):** Kết hợp **Deterministic Domain Rule Engine** (chạy ổn định 100% offline/CI không phụ thuộc mạng ngoài) + **Optional Gemini LLM Enricher** (nếu cấu hình `GEMINI_API_KEY`). Mọi thao tác phê duyệt (`Approve`) đều chạy trong **1 Transaction (`pgx.Tx`)** thực thi trực tiếp vào bảng `leads`, `lead_tasks`, `lead_pipeline_history`, `notifications`.
- **Frontend (`apps/web/src/features/ai-workflows`):**
  1. Trang điều hành trung tâm **Trợ lý Quy trình AI** (`/sale/ai-workflows` và `/admin/ai-workflows`).
  2. Nút **AI Copilot Drawer** (icon `sparkles`) ngay trên thanh Header cạnh chuông thông báo trong `AppLayout.tsx`.
  3. Khối **Gợi ý Chăm sóc Thông minh (Next-Best-Action)** nhúng trực tiếp vào trang chi tiết khách hàng `LeadProfilePage.tsx`.

**Tech Stack:** Go 1.23+, Chi Router, pgx/v5, sqlc, PostgreSQL 16, React 19, TypeScript, TanStack Query, Tailwind CSS, Vitest.

---

## Global Constraints (Bắt buộc tuân thủ)
1. **Repository:** Làm việc tại `d:\Work\Self-project\nsa-app`.
2. **Không sửa file sinh tự động:** Chỉ sửa file SQL trong `database/queries/` và chạy `sqlc generate`. Tuyệt đối không sửa tay trong `database/generated/`.
3. **Không bịa bảng ngoài phạm vi:** Hệ thống hiện tại quản lý đơn hàng qua bảng `orders` (`pending`, `paid`, `cancelled`, `refunded`), tương tác qua `lead_interactions`, công việc qua `lead_tasks`, thông báo qua `notifications`. Không tạo cổng Zalo/SMS thật bên ngoài mà thực thi vào `lead_tasks`, `lead_interactions`, và `notifications` kèm kịch bản `suggested_script` để tư vấn viên copy/sử dụng ngay.
4. **Ngôn ngữ giao diện:** Thuần Việt, rõ ràng, chuyên nghiệp, đồng bộ tone xanh dương (`#0532e6`) của toàn hệ thống.
5. **Chất lượng CI/CD:** Phải vượt qua 100% các bước kiểm tra: `sqlc generate`, `gofmt`, `go vet ./...`, `go test ./...`, `npm run lint` (`--max-warnings 0`), `npm run typecheck`, `npm run format:check`, `npm test -- --run`, và `npm run build`.

---

## Tasks

### - [ ] Task 1: Tạo Database Migration `00020_ai_workflow_operator.sql`

- **File:** `database/migrations/00020_ai_workflow_operator.sql`
- **Nội dung:**
  ```sql
  -- +goose Up
  CREATE TYPE ai_workflow_domain AS ENUM (
    'sales_crm',
    'revenue_ops',
    'training_ops'
  );

  CREATE TYPE ai_proposal_priority AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
  );

  CREATE TYPE ai_proposal_status AS ENUM (
    'pending',
    'executed',
    'rejected'
  );

  CREATE TYPE ai_action_type AS ENUM (
    'assign_lead',
    'create_followup_task',
    'advance_lead_stage',
    'followup_pending_order',
    'alert_attendance_risk'
  );

  CREATE TABLE ai_workflow_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dedup_key VARCHAR(200) NOT NULL UNIQUE,
    workflow_code VARCHAR(80) NOT NULL,
    domain ai_workflow_domain NOT NULL,
    priority ai_proposal_priority NOT NULL DEFAULT 'medium',
    status ai_proposal_status NOT NULL DEFAULT 'pending',

    target_lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    target_order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    target_student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
    target_class_id UUID REFERENCES classes(id) ON DELETE CASCADE,

    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    title VARCHAR(300) NOT NULL,
    bottleneck_summary TEXT NOT NULL,
    ai_rationale TEXT NOT NULL,
    suggested_script TEXT NOT NULL DEFAULT '',

    action_type ai_action_type NOT NULL,
    action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    decision_note TEXT,
    execution_result JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX idx_ai_proposals_status_priority ON ai_workflow_proposals(status, priority, created_at DESC);
  CREATE INDEX idx_ai_proposals_assigned_user ON ai_workflow_proposals(assigned_user_id, status);
  CREATE INDEX idx_ai_proposals_domain ON ai_workflow_proposals(domain, status);
  CREATE INDEX idx_ai_proposals_lead ON ai_workflow_proposals(target_lead_id) WHERE target_lead_id IS NOT NULL;

  CREATE TRIGGER trg_ai_workflow_proposals_updated_at
    BEFORE UPDATE ON ai_workflow_proposals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- +goose Down
  DROP TRIGGER IF EXISTS trg_ai_workflow_proposals_updated_at ON ai_workflow_proposals;
  DROP TABLE IF EXISTS ai_workflow_proposals CASCADE;
  DROP TYPE IF EXISTS ai_action_type;
  DROP TYPE IF EXISTS ai_proposal_status;
  DROP TYPE IF EXISTS ai_proposal_priority;
  DROP TYPE IF EXISTS ai_workflow_domain;
  ```
- **Verification:** Chạy `make migrate-up` (hoặc áp dụng migration vào DB local/test).

---

### - [ ] Task 2: Viết SQLC Queries trong `database/queries/ai_workflows.sql` & Generate Code

- **File:** `database/queries/ai_workflows.sql`
- **Các truy vấn cần viết:**
  1. `UpsertAIWorkflowProposal :one`
     - Insert vào `ai_workflow_proposals`, `ON CONFLICT (dedup_key) DO UPDATE` cập nhật `title`, `bottleneck_summary`, `ai_rationale`, `suggested_script`, `action_payload`, `context_snapshot`, `updated_at = NOW()` **chỉ khi** `ai_workflow_proposals.status = 'pending'`, trả về `RETURNING *`.
  2. `GetAIWorkflowProposal :one`
     - Lấy chi tiết 1 proposal theo `id`, `LEFT JOIN leads`, `LEFT JOIN orders`, `LEFT JOIN student_profiles`, `LEFT JOIN classes`, `LEFT JOIN users` (người được gán & người duyệt).
  3. `ListAIWorkflowProposals :many`
     - Lọc theo `sqlc.narg(domain)::ai_workflow_domain`, `sqlc.narg(status)::ai_proposal_status`, `sqlc.narg(priority)::ai_proposal_priority`, `sqlc.narg(assigned_user_id)::uuid`, `sqlc.narg(target_lead_id)::uuid`.
     - Sắp xếp ưu tiên: `CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END ASC, created_at DESC`.
     - Hỗ trợ `LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset)`.
  4. `CountAIWorkflowProposals :one`
     - Đếm tổng bản ghi tương ứng với bộ lọc của `ListAIWorkflowProposals`.
  5. `GetAIWorkflowSummaryStats :one`
     - Đếm:
       - `pending_total`: số đề xuất đang `pending`
       - `critical_pending`: số đề xuất `pending` có `priority = 'critical'`
       - `sales_pending`: số đề xuất `pending` thuộc `sales_crm`
       - `revenue_pending`: số đề xuất `pending` thuộc `revenue_ops`
       - `training_pending`: số đề xuất `pending` thuộc `training_ops`
       - `executed_today`: số đề xuất `executed` có `decided_at >= CURRENT_DATE`
       - (Có tham số lọc `sqlc.narg(assigned_user_id)::uuid` để khi nhân viên `SALE` xem chỉ tính của cá nhân họ).
  6. `MarkAIProposalExecuted :one`
     - Cập nhật `status = 'executed'`, `suggested_script = $2`, `decided_by = $3`, `decided_at = NOW()`, `decision_note = $4`, `execution_result = $5` WHERE `id = $1 AND status = 'pending'`.
  7. `MarkAIProposalRejected :one`
     - Cập nhật `status = 'rejected'`, `decided_by = $2`, `decided_at = NOW()`, `decision_note = $3` WHERE `id = $1 AND status = 'pending'`.
  8. **Các truy vấn quét điểm nghẽn thực tế (Detectors):**
     - `DetectUnassignedLeads :many`: Lấy tối đa 25 Lead có `deleted_at IS NULL AND assigned_to IS NULL AND pipeline_status = 'data_moi'`, kèm tên khóa học quan tâm (`courses.name`).
     - `DetectStaleActiveLeads :many`: Lấy tối đa 30 Lead có `deleted_at IS NULL AND pipeline_status IN ('data_moi', 'knm_thue_bao', 'goi_lai_sau', 'follow')` mà thời gian tương tác cuối cùng (hoặc `created_at` nếu chưa có tương tác) đã quá 24 giờ, và chưa có `lead_tasks` nào đang mở (`completed_at IS NULL`).
     - `DetectPendingOrdersOverdue :many`: Lấy tối đa 25 đơn hàng trong bảng `orders` có `deleted_at IS NULL AND status = 'pending'` được tạo quá 24 giờ, kèm thông tin Lead/Học viên và khóa học.
     - `DetectActiveSaleStaffForRouting :many`: Lấy danh sách nhân viên Sale đang bật nhận Lead (`is_accepting_leads = TRUE AND status = 'active'`), sắp xếp theo `lead_assignment_order ASC, email ASC`.
- **Verification:** Chạy `sqlc generate` ở thư mục gốc và kiểm tra `database/generated/ai_workflows.sql.go` sinh ra không lỗi.

---

### - [ ] Task 3: Xây dựng Backend Module `apps/api/internal/aiworkflows`

- **Files:**
  - `apps/api/internal/aiworkflows/models.go`
  - `apps/api/internal/aiworkflows/engine.go`
  - `apps/api/internal/aiworkflows/service.go`
  - `apps/api/internal/aiworkflows/handler.go`
  - `apps/api/internal/aiworkflows/service_test.go`

- **Chi tiết thiết kế:**
  1. **`models.go`**:
     - Định nghĩa DTOs chuẩn JSON snake_case: `ProposalView`, `SummaryStatsView`, `ScanResultView`, `ApproveProposalInput` (`suggested_script`, `decision_note`, `assigned_to`, `due_at`), `RejectProposalInput` (`decision_note`), `LeadCopilotInsightView`.
  2. **`engine.go` (Bộ não phát hiện điểm nghẽn & sinh kịch bản SOP):**
     - Hàm `ScanAndGenerateProposals(ctx, actorClaims)`:
       - **Quy trình 1 (`LEAD_ROUTING_SLA` - Domain `sales_crm`, Priority `critical`):**
         - Phát hiện Lead mới chưa chia người phụ trách.
         - Tự động chọn nhân viên Sale tiếp theo trong danh sách `DetectActiveSaleStaffForRouting` (round-robin).
         - Sinh đề xuất `assign_lead` với kịch bản: *"Chào anh/chị [Tên], em từ Trung tâm Đào tạo NSA. Em nhận được thông tin đăng ký tìm hiểu khóa [Tên khóa học] của mình..."*.
       - **Quy trình 2 (`PIPELINE_HYGIENE_FOLLOWUP` - Domain `sales_crm`, Priority `high`):**
         - Phát hiện Lead đang ở `data_moi`, `knm_thue_bao`, `goi_lai_sau`, `follow` bị bỏ quên > 24h chưa có lịch hẹn mở.
         - Sinh đề xuất `create_followup_task` với hạn `due_at = NOW() + 4 hours`, gợi ý kịch bản chăm sóc lại phù hợp theo từng trạng thái (ví dụ nếu `knm_thue_bao` thì gợi ý nhắn Zalo + gọi lại khung giờ chiều).
       - **Quy trình 3 (`ORDER_PAYMENT_FOLLOWUP` - Domain `revenue_ops`, Priority `high`):**
         - Phát hiện Phiếu đăng ký (`orders`) đang `pending` quá 24h chưa thu tiền.
         - Sinh đề xuất `followup_pending_order` (tạo task nhắc thu học phí kèm mã đơn `order_code`, số tiền `final_amount`, kịch bản nhắc hoàn tất thủ tục nhập học lịch sự).
     - Hàm `BuildLeadCopilotInsight(ctx, leadID)`:
       - Phân tích tức thì 1 Lead cụ thể: Tính **Điểm tiềm năng (Lead Score 0–100)** dựa trên độ đầy đủ thông tin (SĐT, Email, Khóa học quan tâm), nguồn Lead, số lần tương tác, và độ trễ chăm sóc.
       - Trả về: `lead_score`, `temperature` (`hot` | `warm` | `cold`), `summary` (tóm tắt ngắn gọn lịch sử chăm sóc), `bottleneck` (rủi ro rớt khách nếu có), `next_best_action` (hành động đề xuất tiếp theo), và `suggested_script` (kịch bản gọi/nhắn tin mẫu).
  3. **`service.go` (Thực thi Human-in-the-Loop trong Transaction):**
     - Kiểm tra phân quyền RBAC chặt chẽ:
       - `SALE` chỉ được xem/duyệt đề xuất gán cho chính mình (`assigned_user_id == claims.UserID`).
       - `SALE_ADMIN` và `ADMIN` được xem/quét/duyệt toàn bộ đề xuất Tuyển sinh & Doanh thu.
       - `ACADEMIC_ADMIN` và `ADMIN` được xem/quét/duyệt đề xuất Đào tạo.
     - Hàm `Approve(ctx, claims, proposalID, input)`:
       - Mở `tx, err := s.pool.Begin(ctx)` (`defer tx.Rollback(ctx)`).
       - Khóa và kiểm tra proposal đang ở trạng thái `pending`.
       - Nếu người dùng có chỉnh sửa `input.SuggestedScript`, lấy bản đã chỉnh sửa.
       - Thực thi hành động thật tương ứng với `action_type`:
         - `assign_lead`: Cập nhật `leads.assigned_to`, tạo thông báo `notifications` cho Sale nhận Lead, tạo task gọi điện đầu tiên trong `lead_tasks`.
         - `create_followup_task`: Tạo bản ghi mới trong `lead_tasks` gắn với `target_lead_id`, `assigned_to`, `title`, `description = suggested_script`, `due_at`.
         - `advance_lead_stage`: Cập nhật `leads.pipeline_status` và ghi `lead_pipeline_history`.
         - `followup_pending_order`: Tạo `lead_tasks` (nếu đơn có `lead_id`) hoặc thông báo nhắc thu phí cho người tạo đơn.
       - Đánh dấu proposal thành `executed` cùng kết quả `execution_result` JSON.
       - `tx.Commit(ctx)`.
     - Hàm `Reject(ctx, claims, proposalID, input)`:
       - Đánh dấu proposal thành `rejected` kèm `decision_note`.
  4. **`handler.go` & Mount Routes trong `apps/api/cmd/api/main.go`:**
     - Mount tại `/api/v1/ai-workflows` (yêu cầu đăng nhập và role thuộc `ADMIN`, `ACADEMIC_ADMIN`, `SALE_ADMIN`, `SALE`):
       - `GET /summary` -> `aiHandler.Summary`
       - `GET /proposals` -> `aiHandler.ListProposals`
       - `POST /scan` -> `aiHandler.Scan`
       - `GET /proposals/{proposalID}` -> `aiHandler.GetProposal`
       - `POST /proposals/{proposalID}/approve` -> `aiHandler.Approve`
       - `POST /proposals/{proposalID}/reject` -> `aiHandler.Reject`
       - `GET /leads/{leadID}/copilot` -> `aiHandler.LeadCopilot`
- **Verification:**
  - Viết unit test trong `apps/api/internal/aiworkflows/service_test.go` kiểm tra logic chấm điểm Lead Score và phân loại kịch bản.
  - Chạy `cd apps/api && go vet ./... && go test ./...`.

---

### - [ ] Task 4: Xây dựng Frontend API Client & Domain Types

- **Files:**
  - `apps/web/src/lib/domainTypes.ts`
  - `apps/web/src/features/ai-workflows/aiWorkflowApi.ts`
- **Chi tiết:**
  - Khai báo đầy đủ các kiểu TypeScript: `AIWorkflowDomain`, `AIProposalPriority`, `AIProposalStatus`, `AIActionType`, `AIWorkflowProposal`, `AIWorkflowSummary`, `AILeadCopilotInsight`.
  - Tạo `aiWorkflowApi` với các hàm: `getSummary()`, `listProposals(params)`, `scanWorkflows()`, `approveProposal(id, payload)`, `rejectProposal(id, payload)`, `getLeadCopilot(leadId)`.
- **Verification:** Chạy `cd apps/web && npm run typecheck`.

---

### - [ ] Task 5: Xây dựng Giao diện Trung tâm Điều phối AI (`AIWorkflowHubPage.tsx`), Drawer nhanh (`AIWorkflowDrawer.tsx`) & Copilot Chi tiết Lead (`LeadAICopilotCard.tsx`)

- **Files:**
  - `apps/web/src/features/ai-workflows/AIWorkflowHubPage.tsx`
  - `apps/web/src/features/ai-workflows/AIWorkflowDrawer.tsx`
  - `apps/web/src/features/ai-workflows/LeadAICopilotCard.tsx`
  - `apps/web/src/app/AppLayout.tsx`
  - `apps/web/src/routes/router.tsx`
  - `apps/web/src/features/sale/LeadProfilePage.tsx`

- **Chi tiết trải nghiệm UI/UX (Tone xanh dương chủ đạo `#0532e6`, Liquid Glass hiện đại):**
  1. **`AIWorkflowHubPage.tsx` (Trang Điều phối Quy trình AI - `/sale/ai-workflows` & `/admin/ai-workflows`):**
     - **Header:** Tiêu đề *"Điều phối Quy trình Thông minh"*, mô tả *"Tự động phát hiện điểm nghẽn vận hành, gợi ý kịch bản xử lý và thực thi ngay sau khi phê duyệt"*, kèm nút bấm chính **"Quét điểm nghẽn ngay"** (có hiệu ứng loading mượt mà).
     - **4 Thẻ Chỉ số (KPI Cards):**
       - *Đề xuất chờ duyệt* (`pending_total`)
       - *Điểm nghẽn khẩn cấp* (`critical_pending`)
       - *Đã thực thi hôm nay* (`executed_today`)
       - *Tự động hóa Tuyển sinh & Doanh thu* (`sales_pending + revenue_pending`)
     - **Thanh lọc (Tabs & Filters):**
       - Trạng thái: *Chờ phê duyệt (`pending`)* | *Đã thực thi (`executed`)* | *Đã bỏ qua (`rejected`)*.
       - Nghiệp vụ: *Tất cả* | *Tuyển sinh & Chia Lead* | *Theo dõi Học phí*.
     - **Danh sách Thẻ Đề xuất (Human-in-the-Loop Proposal Cards):**
       - Mỗi thẻ hiển thị rõ 3 phần chuẩn AMOIQ:
         1. **Điểm nghẽn hiện tại (AS-IS):** Huy hiệu mức độ ưu tiên (`Khẩn cấp` / `Cao` / `Trung bình`), tên khách hàng/đơn hàng, lý do nghẽn (`bottleneck_summary`).
         2. **Đề xuất của AI (TO-BE):** Hành động sẽ thực thi (`Tự động chia Lead`, `Tạo lịch hẹn chăm sóc`, `Nhắc thu học phí`) + lý giải (`ai_rationale`).
         3. **Kịch bản gợi ý & Phê duyệt:** Ô `textarea` cho phép nhân viên xem và **sửa trực tiếp kịch bản lời thoại (`suggested_script`)** trước khi bấm **[Phê duyệt & Thực thi]** hoặc **[Bỏ qua]**.
  2. **`AIWorkflowDrawer.tsx` + Tích hợp `AppLayout.tsx`:**
     - Trên thanh công cụ góc phải của `AppLayout.tsx` (ngay bên trái nút Chuông thông báo), thêm nút tròn có icon `sparkles` (`aria-label="Trợ lý quy trình AI"`) kèm badge số lượng đề xuất đang chờ duyệt.
     - Khi bấm vào sẽ mở Drawer trượt từ bên phải sang, hiển thị danh sách rút gọn các đề xuất `pending` để nhân viên có thể bấm **[Duyệt nhanh]** ngay ở bất kỳ màn hình nào, hoặc bấm *"Mở trung tâm điều phối"* để sang trang đầy đủ.
     - Thêm mục menu **"Trợ lý Quy trình AI"** vào nhóm `"tuyen-sinh"` trong `AppLayout.tsx` cho `ADMIN`, `SALE_ADMIN`, `SALE`.
  3. **`LeadAICopilotCard.tsx` nhúng vào `LeadProfilePage.tsx`:**
     - Trong trang chi tiết khách hàng (`LeadProfilePage.tsx`), hiển thị khối **Phân tích & Gợi ý Chăm sóc AI**:
       - Chấm điểm độ tiềm năng (`Lead Score / 100`) và nhãn nhiệt độ (`Nóng` / `Ấm` / `Lạnh`).
       - Tóm tắt nhanh lịch sử tương tác & cảnh báo điểm nghẽn.
       - Kịch bản tư vấn đề xuất tiếp theo kèm nút **[Copy kịch bản]** và **[Tạo lịch hẹn từ gợi ý này]**.

---

### - [ ] Task 6: Cập nhật OpenAPI, Viết Unit Tests & Chạy Full Quality Gate

- **Files:**
  - `docs/openapi.yaml`
  - `apps/web/src/features/ai-workflows/AIWorkflowHubPage.test.tsx`
- **Các bước kiểm tra bắt buộc (Không được bỏ sót):**
  1. `sqlc generate`
  2. `gofmt -w apps/api database/generated`
  3. `cd apps/api && go vet ./... && go test ./...`
  4. `cd apps/web && npm run format`
  5. `cd apps/web && npm run lint` (Đảm bảo 0 errors, 0 warnings)
  6. `cd apps/web && npm run typecheck`
  7. `cd apps/web && npm run format:check`
  8. `cd apps/web && npm run test -- --run`
  9. `cd apps/web && npm run build`
  10. `npx --yes @redocly/cli@latest lint docs/openapi.yaml`
