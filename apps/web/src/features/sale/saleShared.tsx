import clsx from "clsx";
import type {
  InteractionChannel,
  LeadPipelineStatus,
  LeadSource,
  OrderStatus,
} from "../../lib/domainTypes";

export const PIPELINE_STATUS_OPTIONS: Array<{ value: LeadPipelineStatus; label: string }> = [
  { value: "data_moi", label: "Data mới" },
  { value: "knm_thue_bao", label: "KNM / Thuê bao" },
  { value: "goi_lai_sau", label: "Gọi lại sau" },
  { value: "follow", label: "Follow / Chăm sóc" },
  { value: "tu_choi", label: "Từ chối" },
  { value: "da_dang_ky", label: "Đã đăng ký" },
  { value: "dang_hoc", label: "Đang học" },
  { value: "ket_thuc", label: "Kết thúc" },
];

export const SOURCE_OPTIONS: Array<{ value: LeadSource; label: string }> = [
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
  { value: "zalo", label: "Zalo" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Giới thiệu" },
  { value: "walk_in", label: "Đến trực tiếp" },
  { value: "event", label: "Sự kiện" },
  { value: "other", label: "Khác" },
];

function secureRandomInt(max: number): number {
  const array = new Uint32Array(1);
  window.crypto.getRandomValues(array);
  return array[0] % max;
}

export function generateStudentPassword(length = 8): string {
  // 8 ký tự gồm chữ cái (hoa, thường) và số, không chứa ký tự dễ nhầm lẫn (I, l, O, o, 0, 1)
  const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowers = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = uppers + lowers + digits;

  const chars = [
    uppers[secureRandomInt(uppers.length)],
    lowers[secureRandomInt(lowers.length)],
    digits[secureRandomInt(digits.length)],
  ];

  for (let i = 3; i < length; i++) {
    chars.push(all[secureRandomInt(all.length)]);
  }

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

export const CHANNEL_OPTIONS: Array<{ value: InteractionChannel; label: string }> = [
  { value: "phone_call", label: "Điện thoại" },
  { value: "zalo", label: "Zalo" },
  { value: "facebook", label: "Facebook Messenger" },
  { value: "email", label: "Email" },
  { value: "in_person", label: "Gặp trực tiếp" },
  { value: "sms", label: "Tin nhắn SMS" },
  { value: "other", label: "Kênh khác" },
];

export function getPipelineStatusLabel(status: LeadPipelineStatus | string): string {
  const match = PIPELINE_STATUS_OPTIONS.find((opt) => opt.value === status);
  return match ? match.label : status;
}

export function getSourceLabel(source: LeadSource | string): string {
  const match = SOURCE_OPTIONS.find((opt) => opt.value === source);
  return match ? match.label : source;
}

export function getChannelLabel(channel: InteractionChannel | string): string {
  const match = CHANNEL_OPTIONS.find((opt) => opt.value === channel);
  return match ? match.label : channel;
}

export function formatVND(amount?: number | null): string {
  if (amount == null) return "0 đ";
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(amount))} đ`;
}

export function LeadPipelineBadge({
  status,
  className,
}: {
  status: LeadPipelineStatus | string;
  className?: string;
}) {
  let badgeStyles = "bg-slate-100 text-slate-700 border-slate-200";

  switch (status) {
    case "data_moi":
      badgeStyles = "bg-blue-50 text-blue-700 border-blue-200";
      break;
    case "knm_thue_bao":
      badgeStyles = "bg-slate-100 text-slate-700 border-slate-200";
      break;
    case "goi_lai_sau":
      badgeStyles = "bg-amber-50 text-amber-700 border-amber-200";
      break;
    case "follow":
      badgeStyles = "bg-purple-50 text-purple-700 border-purple-200";
      break;
    case "tu_choi":
      badgeStyles = "bg-rose-50 text-rose-700 border-rose-200";
      break;
    case "da_dang_ky":
      badgeStyles = "bg-emerald-50 text-emerald-700 border-emerald-200";
      break;
    case "dang_hoc":
      badgeStyles = "bg-teal-50 text-teal-700 border-teal-200";
      break;
    case "ket_thuc":
      badgeStyles = "bg-zinc-200 text-zinc-700 border-zinc-300";
      break;
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-normal",
        badgeStyles,
        className,
      )}
    >
      {getPipelineStatusLabel(status)}
    </span>
  );
}

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus | string;
  className?: string;
}) {
  let badgeStyles = "bg-slate-100 text-slate-700 border-slate-200";
  let label = status;

  switch (status) {
    case "pending":
      badgeStyles = "bg-amber-50 text-amber-700 border-amber-200";
      label = "Chờ thanh toán";
      break;
    case "paid":
      badgeStyles = "bg-emerald-50 text-emerald-700 border-emerald-200";
      label = "Đã thanh toán";
      break;
    case "cancelled":
      badgeStyles = "bg-rose-50 text-rose-700 border-rose-200";
      label = "Đã hủy";
      break;
    case "refunded":
      badgeStyles = "bg-zinc-100 text-zinc-700 border-zinc-200";
      label = "Đã hoàn tiền";
      break;
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-normal",
        badgeStyles,
        className,
      )}
    >
      {label}
    </span>
  );
}
