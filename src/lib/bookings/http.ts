import "server-only";
import { createHash } from "node:crypto";
import { protocolClient } from "@/lib/protocol/access";
import { privateHeaders } from "@/lib/protocol/queries";
import { protocolSlug } from "@/lib/protocol/config";
import { isUuid } from "@/lib/protocol/search";
import type { ProtocolMode } from "@/types/protocol";
import type { BookingSnapshot } from "@/types/bookings";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: privateHeaders });
export async function bookingGet(request: Request, mode: ProtocolMode) {
  const client = await protocolClient(mode);
  if (!client) return reply({ error: "تعذر الاتصال." }, 503);
  const q = new URL(request.url).searchParams;
  const search = q.get("q") || "",
    date = q.get("date") || null,
    status = q.get("status") || "all",
    page = Number(q.get("page") || 1),
    token = q.get("token");
  if (
    search.length > 200 ||
    (date && !/^2026-(10|11)-[0-9]{2}$/.test(date)) ||
    !["all", "confirmed", "cancelled"].includes(status) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    (token && !/^[a-f0-9]{64}$/.test(token))
  )
    return reply({ error: "خيارات غير صالحة." }, 400);
  const { data, error } = await client.rpc("booking_snapshot", {
    p_query: search,
    p_date: date,
    p_status: status,
    p_page: page,
    p_token_hash: token
      ? createHash("sha256").update(token).digest("hex")
      : null,
  });
  if (error)
    return reply(
      {
        error: ["PGRST202", "42P01", "42883"].includes(error.code)
          ? "حجوزات المعرض بانتظار اعتماد SQL وتهيئة المواعيد."
          : error.code === "42501"
            ? "لم يُمنح حسابك الوصول لهذا المعرض."
            : "تعذر تحميل الحجوزات.",
      },
      error.code === "42501" ? 403 : 503,
    );
  const snapshot = data as BookingSnapshot;
  if (!snapshot || !Array.isArray(snapshot.bookings))
    return reply({ error: "تعذر التحقق من البيانات." }, 503);
  if (search) {
    const opening = await client.rpc("protocol_snapshot", {
      p_slug: protocolSlug(),
      p_query: search,
      p_page: page,
    });
    if (opening.error) snapshot.opening_error = "تعذر البحث في ضيوف الافتتاح.";
    else snapshot.opening = opening.data as BookingSnapshot["opening"];
  }
  return reply(snapshot);
}
export async function bookingPost(request: Request, mode: ProtocolMode) {
  const client = await protocolClient(mode);
  if (!client) return reply({ error: "تعذر الاتصال." }, 503);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return reply({ error: "طلب غير مصرح." }, 403);
  let x: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 6000) throw Error();
    x = JSON.parse(text);
    if (!x || typeof x !== "object") throw Error();
  } catch {
    return reply({ error: "بيانات غير صالحة." }, 400);
  }
  let result: { data: unknown; error: { code?: string } | null };
  try {
    if (x.action === "events" && isUuid(x.id)) {
      result = await client.rpc("booking_events", { p_id: x.id });
    } else if (
      x.action === "arrival" &&
      isUuid(x.id) &&
      isUuid(x.operation) &&
      Number.isInteger(x.delta) &&
      Number(x.delta) !== 0 &&
      Math.abs(Number(x.delta)) <= 200 &&
      typeof x.reason === "string" &&
      x.reason.length <= 500
    ) {
      result = await client.rpc("booking_arrival", {
        p_id: x.id,
        p_delta: Number(x.delta),
        p_operation: x.operation,
        p_reason: x.reason,
      });
    } else if (
      mode === "admin" &&
      ["cancel", "reschedule"].includes(String(x.action)) &&
      isUuid(x.id) &&
      isUuid(x.operation) &&
      typeof x.reason === "string" &&
      x.reason.trim().length >= 5 &&
      x.reason.length <= 500 &&
      (x.action !== "reschedule" || isUuid(x.slot))
    ) {
      result = await client.rpc("booking_manage", {
        p_id: x.id,
        p_action: String(x.action),
        p_slot: isUuid(x.slot) ? x.slot : null,
        p_reason: x.reason,
        p_operation: x.operation,
      });
    } else if (
      mode === "admin" &&
      x.action === "slot" &&
      (x.id === null || isUuid(x.id)) &&
      x.data &&
      typeof x.data === "object"
    ) {
      const d = x.data as Record<string, unknown>;
      if (
        typeof d.is_closed !== "boolean" ||
        !(
          d.capacity === null ||
          (Number.isInteger(d.capacity) &&
            Number(d.capacity) > 0 &&
            Number(d.capacity) <= 100000)
        ) ||
        (x.id !== null && !Number.isInteger(x.version))
      )
        return reply({ error: "أدخل سعة صحيحة أو اترك الموعد مغلقاً." }, 400);
      result = await client.rpc("booking_slot_save", {
        p_id: x.id as string | null,
        p_data: d,
        p_version: typeof x.version === "number" ? x.version : null,
      });
    } else return reply({ error: "إجراء غير مسموح أو بيانات غير صالحة." }, 400);
    if (result.error)
      return reply(
        {
          error:
            result.error.code === "42501"
              ? "إجراء غير مصرح."
              : "لم يُؤكّد الحفظ. تحقق من التاريخ والحالة والعدد أو حدّث البيانات؛ التصحيح الإداري يتطلب سبباً.",
        },
        409,
      );
    return reply(result.data);
  } catch {
    return reply(
      { error: "تعذر التحقق من الحفظ؛ أعد المحاولة بنفس العملية." },
      503,
    );
  }
}
