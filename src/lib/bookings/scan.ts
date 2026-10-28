import type { ExhibitionBooking, BookingSnapshot } from "@/types/bookings";
export type ScanResult =
  | { kind: "success"; message: string; booking: ExhibitionBooking }
  | { kind: "rejected" | "connection"; message: string; reason?: "format" | "unknown" | "cancelled" | "used" | "date" | "access" };
export async function verifyBookingCode(raw: string, endpoint: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<ScanResult> {
  const match = /^ABAAD-BOOKING:([a-f0-9]{64})$/.exec(raw);
  if (!match) return { kind: "rejected", reason: "format", message: "هذا الرمز لا يعود لحجز معرض صالح." };
  try {
    const response = await request(endpoint + "?" + new URLSearchParams({ token: match[1] }), { cache: "no-store", signal });
    if (response.redirected || response.status === 401 || response.status === 403)
      return { kind: "rejected", reason: "access", message: "تعذر السماح بالتحقق؛ راجع جلسة الدخول وصلاحية الوصول." };
    if (!response.ok) return { kind: "connection", message: "تعذر الاتصال بالخادم للتحقق. أعد المحاولة؛ لم يُحكم على صلاحية الرمز." };
    const snapshot = await response.json() as BookingSnapshot;
    if (!Array.isArray(snapshot.bookings) || !Number.isInteger(snapshot.total_matches)) throw Error("unconfirmed");
    if (snapshot.total_matches === 0 && snapshot.bookings.length === 0)
      return { kind: "rejected", reason: "unknown", message: "رمز غير معروف؛ لم يوجد حجز مطابق." };
    const booking = snapshot.bookings[0];
    if (snapshot.total_matches !== 1 || !booking || !booking.id || !booking.full_name ||
      !Number.isInteger(booking.guest_count) || !Number.isInteger(booking.checked_in_guest_count) ||
      booking.guest_count < 1 || booking.checked_in_guest_count < 0 || booking.checked_in_guest_count > booking.guest_count)
      throw Error("unconfirmed");
    if (booking.status === "cancelled") return { kind: "rejected", reason: "cancelled", message: "هذا الحجز ملغى ولا يُسمح بالدخول به." };
    if (booking.status !== "confirmed") throw Error("unconfirmed");
    if (booking.checked_in_guest_count === booking.guest_count)
      return { kind: "rejected", reason: "used", message: "سبق تسجيل وصول جميع ضيوف هذا الحجز." };
    const verifiedAt = new Date(snapshot.observed_at);
    if (!Number.isFinite(verifiedAt.getTime())) throw Error("unconfirmed");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit" }).format(verifiedAt);
    if (booking.visit_date !== today)
      return { kind: "rejected", reason: "date", message: "الحجز ليس لتاريخ اليوم؛ الدخول في تاريخ آخر يحتاج إلى موافقة الإدارة." };
    return { kind: "success", message: "تم التحقق بنجاح. تسجيل الوصول يتم من تفاصيل الحجز.", booking };
  } catch (error) {
    if (signal.aborted) throw error;
    return { kind: "connection", message: "تعذر الاتصال للتحقق. أعد المحاولة عند عودة الاتصال؛ لم يُحكم على صلاحية الرمز." };
  }
}
/** Prevents concurrent scans and repeated decoder frames, including failed codes. */
export class ScanGate {
  private busy = false;
  private last = { raw: "", at: -Infinity };
  constructor(private clock = () => Date.now()) {}
  enter(raw: string) {
    const now = this.clock();
    if (this.busy || (this.last.raw === raw && now - this.last.at < 2500)) return false;
    this.busy = true; this.last = { raw, at: now }; return true;
  }
  reset() { if (!this.busy) this.last = { raw: "", at: -Infinity }; }
  leave() { this.busy = false; }
}

/** Never replace a freshly verified booking with an older list-cache snapshot. */
export function currentScannedBooking(verified: ExhibitionBooking, rows: ExhibitionBooking[]) {
  const row = rows.find(item => item.id === verified.id);
  if (!row) return verified;
  const current = Date.parse(row.updated_at), checked = Date.parse(verified.updated_at);
  return Number.isFinite(current) && (current > checked || (current === checked && row.updated_at >= verified.updated_at)) ? row : verified;
}
