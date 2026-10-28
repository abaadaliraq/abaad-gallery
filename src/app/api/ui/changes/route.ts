import { createClient } from "@/lib/supabase/server";
import { isStaffIdentity } from "@/lib/auth/authorization";
import { isRole } from "@/types/auth";
import { privateHeaders } from "@/lib/protocol/queries";
import { protocolSlug } from "@/lib/protocol/config";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams,
    role = params.get("role"),
    scopes = (params.get("scopes") || "").split(",").filter(Boolean);
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: privateHeaders });
  if (
    !isRole(role) ||
    scopes.length > 6 ||
    scopes.some(
      (s) =>
        ![
          "protocol",
          "bookings",
          "sales",
          "staff",
          "settings",
          "overview",
        ].includes(s),
    )
  )
    return reply({ error: "طلب تحقق غير صالح." }, 400);
  const client = await createClient({ writable: true });
  if (!client) return reply({ error: "تعذر إعداد الاتصال." }, 503);
  try {
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error) {
      return reply(
        { error: "تعذر التحقق من الجلسة." },
        error.status && error.status >= 500 ? 503 : 401,
      );
    }
    if (!isStaffIdentity(user)) return reply({ error: "انتهت الجلسة." }, 401);
    const { data: staff, error: staffError } = await client
      .from("staff_roles")
      .select("user_id,role,is_active")
      .eq("user_id", user.id)
      .maybeSingle();
    if (staffError)
      return reply({ error: "تعذر قراءة الصلاحيات الحالية." }, 503);
    if (!staff || !staff.is_active || staff.role !== role)
      return reply({ error: "لم يعد الوصول متاحاً." }, 403);
    if (
      scopes.some(
        (s) =>
          (role === "protocol" && !["protocol", "bookings"].includes(s)) ||
          (role === "sales" && s !== "sales"),
      )
    )
      return reply({ error: "غير مصرح." }, 403);
    if (!scopes.length) return reply({ revisions: {} });
    const { data, error: rpcError } = await client.rpc("ui_revision_snapshot", {
      p_slug: protocolSlug(),
      p_scopes: scopes,
    });
    if (rpcError) {
      if (["PGRST202", "42883", "42P01"].includes(rpcError.code))
        return reply({ limited: true });
      return reply(
        { error: "تعذر التحقق من تحديثات المعرض." },
        rpcError.code === "42501" ? 403 : 503,
      );
    }
    const revisions = (data as { revisions?: Record<string, unknown> } | null)
      ?.revisions;
    if (
      !revisions ||
      Array.isArray(revisions) ||
      scopes.some((scope) => typeof revisions[scope] !== "string")
    )
      return reply({ error: "تعذر التحقق من مؤشر التحديث." }, 503);
    return reply(data);
  } catch {
    return reply({ error: "تعذر التحقق من الاتصال." }, 503);
  }
}
