import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router-dom";
import type { ComponentType, ReactNode } from "react";

import AppLayout from "../app/AppLayout";
import { ForbiddenPage, NotFoundPage } from "../app/pages";
import { FullPageLoading } from "../components/ui";
import { homePathFor, useAuth } from "../features/auth/AuthContext";
import ChangePasswordPage from "../features/auth/ChangePasswordPage";
import LoginPage from "../features/auth/LoginPage";
import OAuthCallbackPage from "../features/auth/OAuthCallbackPage";
import type { Role } from "../lib/types";

function lazyLoad<P extends object = Record<string, never>>(
  importFn: () => Promise<Record<string, unknown>>,
  exportName: string,
) {
  const Component = lazy(async () => {
    const module = await importFn();
    return { default: module[exportName] as ComponentType<P> };
  }) as unknown as ComponentType<P>;
  return function LazyWrapper(props: P) {
    return (
      <Suspense fallback={<FullPageLoading />}>
        <Component {...props} />
      </Suspense>
    );
  };
}

// Admin pages lazy bundle
const AdminDashboardPage = lazyLoad(
  () => import("../features/admin/AdminPages"),
  "AdminDashboardPage",
);
const AdminOperationsPage = lazyLoad(
  () => import("../features/admin/AdminPages"),
  "AdminOperationsPage",
);
const ClassDetailPage = lazyLoad<{ readOnly?: boolean }>(
  () => import("../features/admin/AdminPages"),
  "ClassDetailPage",
);
const ClassesPage = lazyLoad<{ readOnly?: boolean }>(
  () => import("../features/admin/AdminPages"),
  "ClassesPage",
);
const CoursesPage = lazyLoad(() => import("../features/admin/AdminPages"), "CoursesPage");
const ScheduleAdminPage = lazyLoad<{ readOnly?: boolean }>(
  () => import("../features/admin/AdminPages"),
  "ScheduleAdminPage",
);
const StudentsPage = lazyLoad(() => import("../features/admin/AdminPages"), "StudentsPage");
const TeachersPage = lazyLoad(() => import("../features/admin/AdminPages"), "TeachersPage");
const AdminAttendancePage = lazyLoad<{ readOnly?: boolean }>(
  () => import("../features/admin/AdminAttendancePage"),
  "AdminAttendancePage",
);
const PersonProfilePage = lazyLoad<{ kind: "student" | "teacher"; readOnly?: boolean }>(
  () => import("../features/admin/PersonProfilePage"),
  "PersonProfilePage",
);
const UserManagementPage = lazyLoad<{ mode?: "all" | "sale" | "academic" }>(
  () => import("../features/users/UserManagementPage"),
  "UserManagementPage",
);

// Teacher pages lazy bundle
const TeacherAttendancePage = lazyLoad(
  () => import("../features/teacher/TeacherAttendancePage"),
  "TeacherAttendancePage",
);
const AssessmentPage = lazyLoad(() => import("../features/teacher/TeacherPages"), "AssessmentPage");
const TeacherAssessmentLandingPage = lazyLoad(
  () => import("../features/teacher/TeacherPages"),
  "TeacherAssessmentLandingPage",
);
const TeacherClassDetailPage = lazyLoad(
  () => import("../features/teacher/TeacherPages"),
  "TeacherClassDetailPage",
);
const TeacherClassesPage = lazyLoad(
  () => import("../features/teacher/TeacherPages"),
  "TeacherClassesPage",
);
const TeacherDashboardPage = lazyLoad(
  () => import("../features/teacher/TeacherPages"),
  "TeacherDashboardPage",
);
const TeacherSchedulePage = lazyLoad(
  () => import("../features/teacher/TeacherPages"),
  "TeacherSchedulePage",
);

// Student pages lazy bundle
const StudentAssessmentsPage = lazyLoad(
  () => import("../features/student/StudentPages"),
  "StudentAssessmentsPage",
);
const StudentAttendancePage = lazyLoad(
  () => import("../features/student/StudentPages"),
  "StudentAttendancePage",
);
const StudentCoursesPage = lazyLoad(
  () => import("../features/student/StudentPages"),
  "StudentCoursesPage",
);
const StudentDashboardPage = lazyLoad(
  () => import("../features/student/StudentPages"),
  "StudentDashboardPage",
);
const StudentProgressPage = lazyLoad(
  () => import("../features/student/StudentPages"),
  "StudentProgressPage",
);
const StudentSchedulePage = lazyLoad(
  () => import("../features/student/StudentPages"),
  "StudentSchedulePage",
);

// Sale pages lazy bundle
const SaleDashboardPage = lazyLoad(() => import("../features/sale/SalePages"), "SaleDashboardPage");
const LeadPipelinePage = lazyLoad(() => import("../features/sale/SalePages"), "LeadPipelinePage");
const LeadProfilePage = lazyLoad(() => import("../features/sale/SalePages"), "LeadProfilePage");
const LeadConvertPage = lazyLoad(() => import("../features/sale/SalePages"), "LeadConvertPage");
const SaleReportsPage = lazyLoad(() => import("../features/sale/SalePages"), "SaleReportsPage");
const SaleStudentsPage = lazyLoad(() => import("../features/sale/SalePages"), "SaleStudentsPage");
const SaleRegistrationOrdersPage = lazyLoad(
  () => import("../features/sale/SalePages"),
  "SaleRegistrationOrdersPage",
);
const SaleReceiptsPage = lazyLoad(() => import("../features/sale/SalePages"), "SaleReceiptsPage");

/** Blocks everything until the silent refresh finishes; forces login when anonymous. */
function RequireAuth({ children }: { children?: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullPageLoading />;
  if (status === "anonymous" || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children ?? <Outlet />;
}

/** Role gate INSIDE the authenticated area. Wrong role → 403 page. */
function RequireRole({
  role,
  roles,
  children,
}: {
  role?: Role;
  roles?: Role[];
  children: ReactNode;
}) {
  const { hasRole } = useAuth();
  const allowed = roles ? roles.some((r) => hasRole(r)) : role ? hasRole(role) : false;
  if (!allowed) return <ForbiddenPage />;
  return <>{children}</>;
}

/** /login is only for anonymous users; authenticated users go home. */
function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === "loading") return <FullPageLoading />;
  if (status === "authenticated" && user) {
    return <Navigate to={homePathFor(user)} replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { status, user } = useAuth();
  if (status === "loading") return <FullPageLoading />;
  return <Navigate to={user ? homePathFor(user) : "/login"} replace />;
}

export const router = createBrowserRouter([
  { path: "/", element: <HomeRedirect /> },
  {
    path: "/login",
    element: (
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: "/auth/callback",
    element: <OAuthCallbackPage />,
  },
  {
    path: "/doi-mat-khau",
    element: (
      <RequireAuth>
        <ChangePasswordPage />
      </RequireAuth>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          // Sale CRM routes
          {
            path: "/sale",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <SaleDashboardPage />
              </RequireRole>
            ),
          },
          {
            path: "/sale/leads",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <LeadPipelinePage />
              </RequireRole>
            ),
          },
          {
            path: "/sale/leads/:id",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <LeadProfilePage />
              </RequireRole>
            ),
          },
          {
            path: "/sale/leads/:id/convert",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <LeadConvertPage />
              </RequireRole>
            ),
          },
          {
            path: "/sale/hoc-vien",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <SaleStudentsPage />
              </RequireRole>
            ),
          },
          {
            path: "/sale/hoc-vien/:personId",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <PersonProfilePage kind="student" readOnly />
              </RequireRole>
            ),
          },
          {
            path: "/sale/phieu-dang-ky",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <SaleRegistrationOrdersPage />
              </RequireRole>
            ),
          },
          {
            path: "/sale/phieu-thu",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <SaleReceiptsPage />
              </RequireRole>
            ),
          },
          {
            path: "/sale/lop-hoc",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <ClassesPage readOnly />
              </RequireRole>
            ),
          },
          {
            path: "/sale/lop-hoc/:classId",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <ClassDetailPage readOnly />
              </RequireRole>
            ),
          },
          {
            path: "/sale/lich-hoc",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <ScheduleAdminPage readOnly />
              </RequireRole>
            ),
          },
          {
            path: "/sale/diem-danh",
            element: (
              <RequireRole roles={["SALE", "SALE_ADMIN", "ADMIN"]}>
                <AdminAttendancePage readOnly />
              </RequireRole>
            ),
          },
          {
            path: "/sale/orders",
            element: <Navigate to="/sale/phieu-dang-ky" replace />,
          },
          {
            path: "/sale/orders/:id",
            element: <Navigate to="/sale/phieu-dang-ky" replace />,
          },
          {
            path: "/sale/reports",
            element: (
              <RequireRole roles={["SALE_ADMIN", "ADMIN"]}>
                <SaleReportsPage />
              </RequireRole>
            ),
          },
          {
            path: "/sale/users",
            element: (
              <RequireRole roles={["SALE_ADMIN", "ADMIN"]}>
                <UserManagementPage mode="sale" />
              </RequireRole>
            ),
          },
          // Legacy redirects for Vietnamese routes
          { path: "/sale/don-hang", element: <Navigate to="/sale/phieu-dang-ky" replace /> },
          { path: "/sale/don-hang/:id", element: <Navigate to="/sale/phieu-dang-ky" replace /> },
          { path: "/sale/students", element: <Navigate to="/sale/hoc-vien" replace /> },
          { path: "/sale/receipts", element: <Navigate to="/sale/phieu-thu" replace /> },
          { path: "/sale/bao-cao", element: <Navigate to="/sale/reports" replace /> },
          { path: "/sale/nhan-vien", element: <Navigate to="/sale/users" replace /> },
          { path: "/sale/doi-ngu", element: <Navigate to="/sale/users" replace /> },
          {
            path: "/admin",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN"]}>
                <AdminDashboardPage />
              </RequireRole>
            ),
          },
          {
            path: "/admin/users",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN"]}>
                <UserManagementPage mode="all" />
              </RequireRole>
            ),
          },
          { path: "/admin/tai-khoan", element: <Navigate to="/admin/users" replace /> },
          {
            path: "/admin/van-hanh",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN"]}>
                <AdminOperationsPage />
              </RequireRole>
            ),
          },
          {
            path: "/admin/hoc-vien",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN"]}>
                <StudentsPage />
              </RequireRole>
            ),
          },
          {
            path: "/admin/hoc-vien/:personId",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN", "SALE", "SALE_ADMIN"]}>
                <PersonProfilePage kind="student" />
              </RequireRole>
            ),
          },
          {
            path: "/admin/giang-vien",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN"]}>
                <TeachersPage />
              </RequireRole>
            ),
          },
          {
            path: "/admin/giang-vien/:personId",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN"]}>
                <PersonProfilePage kind="teacher" />
              </RequireRole>
            ),
          },
          {
            path: "/admin/khoa-hoc",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN"]}>
                <CoursesPage />
              </RequireRole>
            ),
          },
          {
            path: "/admin/lop-hoc",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN"]}>
                <ClassesPage />
              </RequireRole>
            ),
          },
          {
            path: "/admin/lop-hoc/:classId",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN"]}>
                <ClassDetailPage />
              </RequireRole>
            ),
          },
          {
            path: "/admin/lich-hoc",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN"]}>
                <ScheduleAdminPage />
              </RequireRole>
            ),
          },
          {
            path: "/admin/diem-danh",
            element: (
              <RequireRole roles={["ADMIN", "ACADEMIC_ADMIN"]}>
                <AdminAttendancePage />
              </RequireRole>
            ),
          },
          {
            path: "/teacher",
            element: (
              <RequireRole role="TEACHER">
                <TeacherDashboardPage />
              </RequireRole>
            ),
          },
          {
            path: "/teacher/lop-phu-trach",
            element: (
              <RequireRole role="TEACHER">
                <TeacherClassesPage />
              </RequireRole>
            ),
          },
          {
            path: "/teacher/lop-phu-trach/:classId",
            element: (
              <RequireRole role="TEACHER">
                <TeacherClassDetailPage />
              </RequireRole>
            ),
          },
          {
            path: "/teacher/lop-phu-trach/:classId/hoc-vien/:studentId/danh-gia",
            element: (
              <RequireRole role="TEACHER">
                <AssessmentPage />
              </RequireRole>
            ),
          },
          {
            path: "/teacher/diem-danh",
            element: (
              <RequireRole role="TEACHER">
                <TeacherAttendancePage />
              </RequireRole>
            ),
          },
          {
            path: "/teacher/danh-gia",
            element: (
              <RequireRole role="TEACHER">
                <TeacherAssessmentLandingPage />
              </RequireRole>
            ),
          },
          {
            path: "/teacher/lich-day",
            element: (
              <RequireRole role="TEACHER">
                <TeacherSchedulePage />
              </RequireRole>
            ),
          },
          {
            path: "/student",
            element: (
              <RequireRole role="STUDENT">
                <StudentDashboardPage />
              </RequireRole>
            ),
          },
          {
            path: "/student/khoa-hoc",
            element: (
              <RequireRole role="STUDENT">
                <StudentCoursesPage />
              </RequireRole>
            ),
          },
          {
            path: "/student/lich-hoc",
            element: (
              <RequireRole role="STUDENT">
                <StudentSchedulePage />
              </RequireRole>
            ),
          },
          {
            path: "/student/diem-danh",
            element: (
              <RequireRole role="STUDENT">
                <StudentAttendancePage />
              </RequireRole>
            ),
          },
          {
            path: "/student/danh-gia",
            element: (
              <RequireRole role="STUDENT">
                <StudentAssessmentsPage />
              </RequireRole>
            ),
          },
          {
            path: "/student/tien-do",
            element: (
              <RequireRole role="STUDENT">
                <StudentProgressPage />
              </RequireRole>
            ),
          },
          // Backward compatibility aliases
          { path: "/giang-vien", element: <Navigate to="/teacher" replace /> },
          {
            path: "/giang-vien/lop-phu-trach",
            element: <Navigate to="/teacher/lop-phu-trach" replace />,
          },
          { path: "/giang-vien/lich-day", element: <Navigate to="/teacher/lich-day" replace /> },
          { path: "/giang-vien/diem-danh", element: <Navigate to="/teacher/diem-danh" replace /> },
          { path: "/giang-vien/danh-gia", element: <Navigate to="/teacher/danh-gia" replace /> },
          {
            path: "/giang-vien/diem-kiem-tra",
            element: <Navigate to="/teacher/lop-phu-trach" replace />,
          },
          { path: "/hoc-vien", element: <Navigate to="/student" replace /> },
          { path: "/hoc-vien/khoa-hoc", element: <Navigate to="/student/khoa-hoc" replace /> },
          { path: "/hoc-vien/lich-hoc", element: <Navigate to="/student/lich-hoc" replace /> },
          { path: "/hoc-vien/diem-danh", element: <Navigate to="/student/diem-danh" replace /> },
          { path: "/hoc-vien/danh-gia", element: <Navigate to="/student/danh-gia" replace /> },
          { path: "/hoc-vien/tien-do", element: <Navigate to="/student/tien-do" replace /> },
          { path: "/hoc-vien/ho-so", element: <Navigate to="/student" replace /> },
        ],
      },
    ],
  },
  {
    path: "/403",
    element: (
      <RequireAuth>
        <ForbiddenPage />
      </RequireAuth>
    ),
  },
  { path: "*", element: <NotFoundPage /> },
]);
