import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { QueryState } from "../../components/data";
import { Icon } from "../../components/icons";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "../../components/ui";
import { formatDate, mutationMessage } from "../../lib/format";
import { saleApi } from "./saleApi";
import type { ConvertLeadInput } from "./saleApi";
import type { ConvertResult, TrainingClass } from "../../lib/domainTypes";
import { formatVND, generateStudentPassword, getSourceLabel } from "./saleShared";

export function LeadConvertPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);
  const [preCopied, setPreCopied] = useState(false);
  const [convertResult, setConvertResult] = useState<ConvertResult | null>(null);

  // Identity & Credentials Verification
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [classId, setClassId] = useState("");
  const [amount, setAmount] = useState<number>(15000000);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountNote, setDiscountNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("transfer");
  const [notes, setNotes] = useState("");

  // Queries
  const leadQuery = useQuery({
    queryKey: ["sale", "lead", id],
    queryFn: () => saleApi.getLead(id!),
    enabled: Boolean(id),
  });

  const classesQuery = useQuery({
    queryKey: ["sale", "classes", "available"],
    queryFn: () =>
      saleApi.listClasses({
        capacity: "available",
      }),
  });

  const convertMutation = useMutation({
    mutationFn: (data: ConvertLeadInput) => saleApi.convertLead(id!, data),
    onSuccess: (result) => {
      setConvertResult(result);
      queryClient.invalidateQueries({ queryKey: ["sale", "lead", id] });
      queryClient.invalidateQueries({ queryKey: ["sale", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["sale", "dashboard"] });
    },
    onError: (err: unknown) => {
      setFormError(mutationMessage(err));
    },
  });

  const lead = leadQuery.data;
  const availableClasses = useMemo<TrainingClass[]>(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return ((classesQuery.data?.items ?? []) as TrainingClass[]).filter((c) => {
      // Lớp nào tới ngày khai giảng rồi ko đc chọn ghi danh
      if (c.start_date && c.start_date <= todayStr) {
        return false;
      }
      return c.status === "planning" || c.status === "open";
    });
  }, [classesQuery.data?.items]);

  // Auto-select class matching interested course if available
  useEffect(() => {
    if (!classId && availableClasses.length > 0) {
      if (lead?.interested_course_id) {
        const matched = availableClasses.find((c) => c.course_id === lead.interested_course_id);
        if (matched) {
          setClassId(matched.id);
          return;
        }
      }
      // Fallback: select first available class
      setClassId(availableClasses[0].id);
    }
  }, [classId, lead?.interested_course_id, availableClasses]);

  useEffect(() => {
    if (lead) {
      setFullName(lead.full_name || "");
      setEmail(lead.email || "");
      setPhone(lead.phone || "");
      setPassword((prev) => prev || generateStudentPassword());
    }
  }, [lead]);

  const finalAmount = Math.max(0, amount - discountAmount);

  const handleCopyPreInfo = () => {
    const text = `Thông tin tài khoản Học viện NSA:
- Họ và tên: ${fullName}
- Tên đăng nhập (Email): ${email}
- Mật khẩu: ${password}
- Link đăng nhập: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    setPreCopied(true);
    setTimeout(() => setPreCopied(false), 3000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!fullName.trim()) {
      setFormError("Vui lòng nhập họ và tên học viên.");
      return;
    }

    if (!email.trim() || !email.includes("@") || !email.includes(".")) {
      setFormError(
        "Vui lòng nhập địa chỉ Email hợp lệ. Email là tên đăng nhập bắt buộc của học viên.",
      );
      return;
    }

    if (!classId) {
      setFormError("Vui lòng chọn lớp học để ghi danh.");
      return;
    }

    if (!password.trim()) {
      setFormError("Vui lòng nhập hoặc bấm tạo mật khẩu khởi tạo cho học viên.");
      return;
    }

    convertMutation.mutate({
      class_id: classId,
      amount,
      discount_amount: discountAmount,
      discount_note: discountNote.trim() || undefined,
      payment_method: paymentMethod || undefined,
      notes: notes.trim() || undefined,
      password: password.trim(),
      email: email.trim(),
      full_name: fullName.trim(),
      phone: phone.trim() || undefined,
    });
  };

  const handleCopyPassword = () => {
    if (convertResult?.initial_password) {
      navigator.clipboard.writeText(convertResult.initial_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  if (leadQuery.isLoading) {
    return (
      <div className="py-12 text-center">
        <QueryState loading={true} error={null}>
          <div />
        </QueryState>
      </div>
    );
  }

  if (leadQuery.error || !lead) {
    return (
      <div className="space-y-4">
        <ErrorBanner message="Không tìm thấy Lead hoặc bạn không có quyền truy cập." />
        <Button variant="ghost" onClick={() => navigate("/sale/leads")}>
          ← Quay lại danh sách Lead
        </Button>
      </div>
    );
  }

  // Already converted view
  if (lead.converted_student_id && !convertResult) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Chuyển đổi Học viên"
          subtitle="Khách hàng này đã được chuyển đổi thành Học viên chính thức."
        />
        <Card className="p-6">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5">
            <div className="flex items-center gap-3">
              <Icon name="check" className="h-6 w-6 text-emerald-600" />
              <div>
                <h3 className="font-bold text-emerald-900">Lead đã được chuyển đổi thành công</h3>
                <p className="mt-1 text-sm text-emerald-800">
                  Mã học viên: <strong>{lead.converted_student_code}</strong> • Ngày chuyển đổi:{" "}
                  {formatDate(lead.converted_at)}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={`/sale/hoc-vien/${lead.converted_student_id}`}>
                <Button variant="primary">Xem hồ sơ Đào tạo →</Button>
              </Link>
              <Link to="/sale/orders">
                <Button variant="ghost">Xem danh sách Đơn hàng</Button>
              </Link>
              <Link to={`/sale/leads/${lead.id}`}>
                <Button variant="soft">Quay lại Lead Profile</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Conversion Success View
  if (convertResult) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Chuyển đổi Thành công!"
          eyebrow="1-Click Conversion"
          subtitle="Học viên đã được ghi danh vào lớp và đơn hàng đã được khởi tạo trong hệ thống."
        />

        <Card className="p-6">
          <div className="space-y-6">
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                  <Icon name="user-check" className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-emerald-950">
                    Chào mừng Tân học viên {lead.full_name}!
                  </h2>
                  <p className="mt-1 text-sm text-emerald-800">
                    Toàn bộ hồ sơ đào tạo, tài khoản đăng nhập và đơn hàng thu phí đã được tạo tự
                    động.
                  </p>

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-emerald-200 bg-white p-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-gtext">
                        Mã Học Viên
                      </span>
                      <p className="mt-1 text-xl font-bold text-navy">
                        {convertResult.student_code}
                      </p>
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-white p-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-gtext">
                        Mã Đơn Hàng (Phiếu thu)
                      </span>
                      <p className="mt-1 text-xl font-bold text-navy">{convertResult.order_code}</p>
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-white p-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-gtext">
                        Tổng thanh toán
                      </span>
                      <p className="mt-1 text-xl font-bold text-emerald-700 tabular-nums">
                        {formatVND(finalAmount)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Initial Password Alert Box */}
            {convertResult.initial_password && (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon name="lock" className="h-5 w-5 text-amber-700" />
                      <h4 className="font-bold text-amber-950">
                        Mật khẩu khởi tạo tạm thời (Chỉ hiển thị 1 lần)
                      </h4>
                    </div>
                    <p className="mt-1 text-xs text-amber-900">
                      Vui lòng sao chép và gửi cho học viên. Học viên sẽ được yêu cầu đổi mật khẩu ở
                      lần đăng nhập đầu tiên.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-amber-400 bg-white px-3.5 py-2 font-mono text-base font-bold text-navy select-all">
                      {convertResult.initial_password}
                    </span>
                    <Button variant="accent" onClick={handleCopyPassword} className="shrink-0">
                      <Icon name="check" className="h-4 w-4" />
                      {copied ? "Đã copy!" : "Copy"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Next Action Links */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-gborder">
              <Link to="/sale/leads">
                <Button variant="ghost">← Về danh sách Lead</Button>
              </Link>
              <Link to="/sale/orders">
                <Button variant="soft">Xem danh sách đơn hàng</Button>
              </Link>
              <Link to={`/sale/hoc-vien/${convertResult.student_id}`}>
                <Button variant="primary">Xem hồ sơ Đào tạo (360°) →</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gtext">
        <Link to="/sale/leads" className="hover:text-navy hover:underline">
          Lead Tuyển sinh
        </Link>
        <span>/</span>
        <Link to={`/sale/leads/${lead.id}`} className="hover:text-navy hover:underline">
          {lead.full_name}
        </Link>
        <span>/</span>
        <span className="font-semibold text-navy">Chuyển đổi thành Học viên</span>
      </div>

      <PageHeader
        title="1-Click Chuyển đổi Lead → Học viên"
        eyebrow="Quy trình Nhập học"
        subtitle="Ghi danh học viên vào lớp học chính thức và tự động tạo đơn hàng thu học phí."
      />

      {formError && <ErrorBanner message={formError} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Lead Summary (4 cols) */}
        <div className="space-y-4 lg:col-span-4">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-bold text-navy-heading">Thông tin Khách hàng</h3>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-gtext">Họ và tên</span>
                <p className="font-semibold text-navy">{lead.full_name}</p>
              </div>

              <div>
                <span className="text-xs text-gtext">Số điện thoại</span>
                <p className="font-mono text-navy">{lead.phone || "—"}</p>
              </div>

              <div>
                <span className="text-xs text-gtext">Email</span>
                <p className="text-navy">{lead.email || "Sẽ tự tạo email nội bộ"}</p>
              </div>

              <div>
                <span className="text-xs text-gtext">Nguồn khách hàng</span>
                <p className="text-navy">{getSourceLabel(lead.source)}</p>
              </div>

              <div>
                <span className="text-xs text-gtext">Khóa học quan tâm</span>
                <p className="font-medium text-navy">
                  {lead.interested_course_name || "Chưa xác định"}
                </p>
              </div>

              {lead.notes && (
                <div>
                  <span className="text-xs text-gtext">Ghi chú</span>
                  <p className="text-xs text-navy/80 italic">{lead.notes}</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right: Convert Form (8 cols) */}
        <div className="space-y-4 lg:col-span-8">
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Verification & Credentials Block */}
              <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 space-y-3.5">
                <div className="flex items-start gap-2.5">
                  <Icon name="lock" className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                      Rà soát thông tin định danh & Cấp mật khẩu đăng nhập
                    </h4>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Email này sẽ trở thành Tên đăng nhập hệ thống của học viên. Sau khi chuyển
                      đổi, thông tin định danh sẽ được khóa để đảm bảo an toàn tài khoản và dữ liệu
                      đào tạo.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input
                    label="Họ và tên học viên *"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                  <Input
                    label="Email đăng nhập (Tài khoản) *"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Input
                    label="Số điện thoại"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                {/* Password generator row */}
                <div className="pt-2 border-t border-amber-200/80">
                  <label className="mb-1 block text-xs font-semibold text-amber-950">
                    Mật khẩu khởi tạo cho học viên *
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-64">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-mono text-xs text-navy focus:border-[#0532e6] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={showPassword ? "Ẩn" : "Hiện"}
                      >
                        <Icon name={showPassword ? "close" : "edit"} className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-2.5 text-xs text-[#0532e6] bg-white border border-blue-200 hover:bg-blue-50"
                      onClick={() => setPassword(generateStudentPassword())}
                    >
                      <Icon name="rotate-ccw" className="h-3 w-3 mr-1" />
                      Tạo ngẫu nhiên
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-2.5 text-xs text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50"
                      onClick={handleCopyPreInfo}
                    >
                      <Icon name="check" className="h-3 w-3 mr-1" />
                      {preCopied ? "Đã sao chép!" : "Sao chép tài khoản"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Class Selection */}
              <div>
                <label className="mb-1 block text-sm font-bold text-navy-heading">
                  Chọn lớp học mở ghi danh *
                </label>
                <p className="mb-2 text-xs text-gtext">
                  Chỉ các lớp đang mở (open/active) và còn chỗ trống mới hiển thị ở đây.
                </p>

                <Select label="" value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">-- Chọn lớp học --</option>
                  {availableClasses.map((c) => {
                    const enrolled = c.enrolled_students ?? 0;
                    const max = c.maximum_students ?? 0;
                    const remaining = Math.max(0, max - enrolled);
                    const isMatched = c.course_id === lead?.interested_course_id;
                    return (
                      <option key={c.id} value={c.id}>
                        {isMatched ? "★ [Đúng khóa quan tâm] " : ""}
                        {c.course_code ? `[${c.course_code}] ` : ""}
                        {c.name} ({c.class_code}) —{" "}
                        {c.start_date ? `Khai giảng: ${formatDate(c.start_date)} · ` : ""}Còn{" "}
                        {remaining} chỗ ({enrolled}/{max})
                      </option>
                    );
                  })}
                </Select>
                {availableClasses.length === 0 && !classesQuery.isLoading && (
                  <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                    Hiện chưa có lớp học nào khả dụng còn chỗ trống.
                  </p>
                )}
              </div>

              {/* Tuition & Financials */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Học phí niêm yết (VNĐ) *"
                  type="number"
                  min="0"
                  step="10000"
                  required
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />

                <Input
                  label="Giảm giá / Ưu đãi (VNĐ)"
                  type="number"
                  min="0"
                  step="10000"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Lý do giảm giá / Mã voucher"
                  placeholder="VD: Học bổng đầu khóa, Giới thiệu bạn bè..."
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                />

                <Select
                  label="Hình thức thanh toán"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="transfer">Chuyển khoản ngân hàng</option>
                  <option value="cash">Tiền mặt</option>
                  <option value="card">Thẻ tín dụng / POS</option>
                  <option value="other">Hình thức khác</option>
                </Select>
              </div>

              {/* Final Amount Summary Box */}
              <div className="flex items-center justify-between rounded-xl bg-[#0532e6]/5 p-4 border border-[#0532e6]/20">
                <span className="font-bold text-navy text-sm">Số tiền thanh toán thực tế:</span>
                <span className="text-xl font-bold text-navy tabular-nums">
                  {formatVND(finalAmount)}
                </span>
              </div>

              <Textarea
                label="Ghi chú đơn hàng"
                placeholder="Ghi chú thêm về đợt thanh toán, thỏa thuận học phí..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-gborder">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate(`/sale/leads/${lead.id}`)}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="accent"
                  loading={convertMutation.isPending}
                  className="px-6"
                >
                  <Icon name="user-check" className="h-4 w-4" />
                  Xác nhận Chuyển đổi & Tạo Đơn hàng
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
