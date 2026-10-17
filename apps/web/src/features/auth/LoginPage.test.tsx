/** Component tests for the login screen: validation, server-error display, and Google/Microsoft OAuth. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "./LoginPage";

// Mock the auth context used by LoginPage.
const loginMock = vi.fn();
const exchangeOAuthCodeMock = vi.fn();
vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    login: loginMock,
    exchangeOAuthCode: exchangeOAuthCodeMock,
    homePath: () => "/admin",
    user: null,
    status: "anonymous",
  }),
}));

// Mock authApi getOAuthConfig
vi.mock("./authApi", () => ({
  getOAuthConfig: vi.fn().mockResolvedValue({
    google_configured: false,
    google_client_id: "",
    microsoft_configured: false,
    microsoft_client_id: "",
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    loginMock.mockReset();
    exchangeOAuthCodeMock.mockReset();
    mockNavigate.mockReset();
  });

  it("renders the login form elements including Google and Microsoft SSO", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Đăng nhập hệ thống" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Microsoft" })).toBeInTheDocument();
  });

  it("shows validation errors on empty submit and never calls login", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByText("Vui lòng nhập email")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập mật khẩu")).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid email format", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.type(screen.getByLabelText("Mật khẩu"), "whatever1");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByText("Email không hợp lệ")).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("shows the generic server error on 401", async () => {
    const { ApiRequestError } = await import("../../lib/apiClient");
    loginMock.mockRejectedValue(
      new ApiRequestError(401, "INVALID_CREDENTIALS", "Invalid email or password"),
    );

    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "admin@nsa.local");
    await userEvent.type(screen.getByLabelText("Mật khẩu"), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Email hoặc mật khẩu không đúng. Vui lòng thử lại."),
    ).toBeInTheDocument();
  });

  it("displays SSO error passed in route state", () => {
    renderPage({
      ssoError:
        "Email unknown@example.com chưa được cấp tài khoản trong hệ thống. Vui lòng liên hệ Quản trị viên để được tạo tài khoản.",
    });

    expect(
      screen.getByText(
        "Email unknown@example.com chưa được cấp tài khoản trong hệ thống. Vui lòng liên hệ Quản trị viên để được tạo tài khoản.",
      ),
    ).toBeInTheDocument();
  });

  it("displays missing config message when Google button is clicked without client ID", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Google" }));

    expect(
      await screen.findByText(
        "Hệ thống chưa được cấu hình GOOGLE_CLIENT_ID trong file .env. Vui lòng cung cấp Client ID từ Google Cloud Console để đăng nhập tài khoản Google thật.",
      ),
    ).toBeInTheDocument();
  });

  it("displays missing config message when Microsoft button is clicked without client ID", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Microsoft" }));

    expect(
      await screen.findByText(
        "Hệ thống chưa được cấu hình MICROSOFT_CLIENT_ID trong file .env. Vui lòng cung cấp Application (Client) ID từ Azure Portal để đăng nhập tài khoản Microsoft thật.",
      ),
    ).toBeInTheDocument();
  });
});
