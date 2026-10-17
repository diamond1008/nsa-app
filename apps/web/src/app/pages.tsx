/** Phase 8 pages: role dashboards (foundation placeholders) and the 403 page. */
import { Link } from "react-router-dom";

import { Badge, Button, Card, EmptyState, PageHeader } from "../components/ui";
import { useAuth } from "../features/auth/AuthContext";
import type { Role } from "../lib/types";

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Quản trị viên",
  ACADEMIC_ADMIN: "Quản lý Đào tạo",
  TEACHER: "Giảng viên",
  STUDENT: "Học viên",
  SALE: "Chuyên viên Tuyển sinh (Sale)",
  SALE_ADMIN: "Trưởng phòng Tuyển sinh (Sale Manager)",
};

interface ModuleCard {
  title: string;
  description: string;
  phase: string;
}

const MODULES: Record<Role, ModuleCard[]> = {
  ADMIN: [
    { title: "Học viên", description: "Quản lý hồ sơ và tài khoản học viên", phase: "Phase 9" },
    { title: "Giảng viên", description: "Quản lý đội ngũ giảng viên", phase: "Phase 9" },
    {
      title: "Khóa học & Lớp học",
      description: "Chương trình đào tạo và các lớp đang mở",
      phase: "Phase 9",
    },
    {
      title: "Lịch học",
      description: "Xếp lịch buổi học lý thuyết và thực hành",
      phase: "Phase 9",
    },
  ],
  ACADEMIC_ADMIN: [
    { title: "Học viên", description: "Quản lý hồ sơ và tài khoản học viên", phase: "Phase 9" },
    { title: "Giảng viên", description: "Quản lý đội ngũ giảng viên", phase: "Phase 9" },
    {
      title: "Khóa học & Lớp học",
      description: "Chương trình đào tạo và các lớp đang mở",
      phase: "Phase 9",
    },
    {
      title: "Lịch học",
      description: "Xếp lịch buổi học lý thuyết và thực hành",
      phase: "Phase 9",
    },
  ],
  SALE_ADMIN: [
    {
      title: "Quản lý Lead & Phân bổ",
      description: "Tiếp nhận, phân bổ và theo dõi khách hàng tiềm năng",
      phase: "Phase 26",
    },
    {
      title: "Đơn hàng & Doanh thu",
      description: "Quản lý đơn hàng, duyệt thanh toán và doanh thu tuyển sinh",
      phase: "Phase 26",
    },
    {
      title: "Báo cáo Tuyển sinh",
      description: "Hiệu quả chuyển đổi theo kênh và theo nhân viên",
      phase: "Phase 26",
    },
  ],
  SALE: [
    {
      title: "Quản lý Lead",
      description: "Tiếp nhận và tư vấn khách hàng tiềm năng",
      phase: "Phase 26",
    },
    {
      title: "Đơn hàng & Thu học phí",
      description: "Quản lý đơn hàng và chuyển đổi học viên",
      phase: "Phase 26",
    },
    {
      title: "Nhắc việc & Lịch hẹn",
      description: "Lịch hẹn gọi lại và chăm sóc khách hàng",
      phase: "Phase 26",
    },
  ],
  TEACHER: [
    {
      title: "Lớp phụ trách",
      description: "Các lớp bạn được phân công giảng dạy",
      phase: "Phase 9",
    },
    { title: "Điểm danh", description: "Ghi nhận điểm danh theo buổi học", phase: "Phase 9" },
    {
      title: "Đánh giá kỹ năng",
      description: "Đánh giá tay nghề theo tiêu chí khóa học",
      phase: "Phase 9",
    },
  ],
  STUDENT: [
    { title: "Lịch học", description: "Thời khóa biểu các buổi sắp tới", phase: "Phase 9" },
    { title: "Điểm danh", description: "Lịch sử điểm danh của bạn", phase: "Phase 9" },
    { title: "Đánh giá kỹ năng", description: "Kết quả đánh giá từ giảng viên", phase: "Phase 9" },
    { title: "Tiến độ học tập", description: "Phần trăm hoàn thành khóa học", phase: "Phase 9" },
  ],
};

function Dashboard({ role, heading }: { role: Role; heading: string }) {
  const { user } = useAuth();
  const displayName =
    user?.teacher_profile?.full_name ?? user?.student_profile?.full_name ?? user?.email ?? "";

  return (
    <div>
      <PageHeader
        title={heading}
        subtitle={`Xin chào ${displayName} — vai trò: ${ROLE_LABEL[role]}. Hệ thống đã sẵn sàng, các màn hình nghiệp vụ sẽ mở dần ở Phase 9.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MODULES[role].map((m) => (
          <Card key={m.title} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-navy">{m.title}</h2>
              <Badge tone="gold">{m.phase}</Badge>
            </div>
            <p className="text-sm text-gtext">{m.description}</p>
          </Card>
        ))}
      </div>
      <div className="mt-6">
        <EmptyState
          title="Khu vực làm việc sẽ hiển thị tại đây"
          hint="Dữ liệu thật từ API sẽ được kết nối ở Phase 9 (màn hình tính năng)."
        />
      </div>
    </div>
  );
}

export function AdminDashboard() {
  return <Dashboard role="ADMIN" heading="Tổng quan Quản trị" />;
}

export function TeacherDashboard() {
  return <Dashboard role="TEACHER" heading="Tổng quan Giảng viên" />;
}

export function StudentDashboard() {
  return <Dashboard role="STUDENT" heading="Tổng quan Học viên" />;
}

/** Simple placeholder used for feature routes that arrive in Phase 9. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState
        title="Màn hình đang được xây dựng"
        hint="Sẽ hoàn thiện ở Phase 9 — Feature Screens."
      />
    </div>
  );
}

export function ForbiddenPage() {
  const { homePath, user } = useAuth();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-6xl font-bold text-gold">403</p>
      <h1 className="text-2xl font-bold text-navy-dark">Truy cập bị từ chối</h1>
      <p className="max-w-md text-sm text-gtext">
        Tài khoản của bạn không có quyền truy cập trang này. Nếu bạn cho rằng đây là nhầm lẫn, vui
        lòng liên hệ quản trị viên.
      </p>
      <Link to={homePath(user)}>
        <Button variant="primary">Về trang tổng quan</Button>
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-6xl font-bold text-gtext">404</p>
      <h1 className="text-2xl font-bold text-navy-dark">Không tìm thấy trang</h1>
      <Link to="/">
        <Button variant="ghost">Về trang chủ</Button>
      </Link>
    </div>
  );
}
