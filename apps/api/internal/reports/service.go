// Package reports provides operational metrics and safe CSV exports for administrators.
package reports

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Summary struct {
	ActiveStudents       int64 `json:"active_students"`
	OpenClasses          int64 `json:"open_classes"`
	UpcomingSessions     int64 `json:"upcoming_sessions"`
	AtRiskStudents       int64 `json:"at_risk_students"`
	ApprovedCompletions  int64 `json:"approved_completions"`
	PendingNotifications int64 `json:"pending_notifications"`
}

type Service struct{ pool *pgxpool.Pool }

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

func (s *Service) Summary(ctx context.Context) (Summary, error) {
	const query = `
SELECT
  (SELECT COUNT(*) FROM student_profiles WHERE status='active'),
  (SELECT COUNT(*) FROM classes WHERE status IN ('planning','open','in_progress')),
  (SELECT COUNT(*) FROM class_sessions WHERE starts_at >= NOW() AND status='scheduled'),
  (SELECT COUNT(*) FROM (
    SELECT ar.class_id, ar.student_id
    FROM attendance_records ar
    JOIN classes c ON c.id=ar.class_id
    JOIN courses co ON co.id=c.course_id
    WHERE ar.status <> 'excused'
    GROUP BY ar.class_id, ar.student_id, co.minimum_attendance_pct
    HAVING 100.0*COUNT(*) FILTER (WHERE ar.status IN ('present','late'))/NULLIF(COUNT(*),0) < co.minimum_attendance_pct
  ) risk),
  (SELECT COUNT(*) FROM course_completions WHERE status='approved'),
  (SELECT COUNT(*) FROM notifications WHERE status='unread')`
	var result Summary
	err := s.pool.QueryRow(ctx, query).Scan(
		&result.ActiveStudents, &result.OpenClasses, &result.UpcomingSessions,
		&result.AtRiskStudents, &result.ApprovedCompletions, &result.PendingNotifications,
	)
	if err != nil {
		return Summary{}, fmt.Errorf("load report summary: %w", err)
	}
	return result, nil
}

func (s *Service) Export(ctx context.Context, kind string) ([]byte, error) {
	var headers []string
	var query string
	switch kind {
	case "attendance":
		headers = []string{"Thời gian", "Mã lớp", "Mã học viên", "Họ tên", "Trạng thái", "Nguồn", "Ghi chú"}
		query = `SELECT cs.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', c.class_code, sp.student_code, sp.full_name, ar.status::text, ar.source::text, COALESCE(ar.note,'') FROM attendance_records ar JOIN class_sessions cs ON cs.id=ar.class_session_id JOIN classes c ON c.id=ar.class_id JOIN student_profiles sp ON sp.id=ar.student_id ORDER BY cs.starts_at DESC, c.class_code, sp.student_code`
	case "competencies":
		headers = []string{"Mã lớp", "Mã học viên", "Họ tên", "Tiêu chí", "Mức đánh giá", "Trạng thái phiếu", "Minh chứng"}
		query = `SELECT c.class_code, sp.student_code, sp.full_name, cc.name, ai.rating::text, sa.status::text, COALESCE(sa.evidence_url,'') FROM assessment_items ai JOIN student_assessments sa ON sa.id=ai.assessment_id JOIN classes c ON c.id=sa.class_id JOIN student_profiles sp ON sp.id=sa.student_id JOIN competency_criteria cc ON cc.id=ai.competency_criterion_id ORDER BY c.class_code, sp.student_code, sa.assessment_no, cc.sequence_no`
	case "classes":
		headers = []string{"Mã lớp", "Tên lớp", "Khóa học", "Trạng thái", "Ngày bắt đầu", "Ngày kết thúc", "Sĩ số", "Số buổi"}
		query = `SELECT c.class_code, c.name, co.name, c.status::text, c.start_date::text, c.end_date::text, COUNT(DISTINCT ce.id)::text, COUNT(DISTINCT cs.id)::text FROM classes c JOIN courses co ON co.id=c.course_id LEFT JOIN class_enrollments ce ON ce.class_id=c.id AND ce.status IN ('enrolled','completed') LEFT JOIN class_sessions cs ON cs.class_id=c.id AND cs.status<>'cancelled' GROUP BY c.id,co.name ORDER BY c.start_date DESC,c.class_code`
	case "completions":
		headers = []string{"Mã lớp", "Mã học viên", "Họ tên", "Chuyên cần (%)", "Bài kiểm tra đạt", "Tổng bài bắt buộc", "Điểm thi kết thúc", "Năng lực đạt", "Tổng năng lực", "Quyết định", "Số chứng nhận", "Ngày cấp"}
		query = `SELECT c.class_code, sp.student_code, sp.full_name, cp.attendance_pct::text, cp.required_tests_passed::text, cp.required_tests_total::text, COALESCE(cp.final_exam_score::text,''), cp.required_competencies_met::text, cp.required_competencies_total::text, cp.status::text, COALESCE(cert.certificate_number,''), COALESCE(cert.issued_at::text,'') FROM course_completions cp JOIN classes c ON c.id=cp.class_id JOIN student_profiles sp ON sp.id=cp.student_id LEFT JOIN certificates cert ON cert.completion_id=cp.id AND cert.is_current ORDER BY cp.reviewed_at DESC,c.class_code,sp.student_code`
	default:
		return nil, fmt.Errorf("unsupported report: %s", kind)
	}

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query %s report: %w", kind, err)
	}
	defer rows.Close()

	var output bytes.Buffer
	output.WriteString("\xEF\xBB\xBF") // Excel-friendly UTF-8 BOM.
	w := csv.NewWriter(&output)
	if err := w.Write(headers); err != nil {
		return nil, err
	}
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}
		record := make([]string, len(values))
		for i, value := range values {
			record[i] = csvSafe(fmt.Sprint(value))
		}
		if err := w.Write(record); err != nil {
			return nil, err
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func csvSafe(value string) string {
	trimmed := strings.TrimLeft(value, " \t\r\n")
	if trimmed != "" && strings.ContainsRune("=+-@", rune(trimmed[0])) {
		return "'" + value
	}
	return value
}
