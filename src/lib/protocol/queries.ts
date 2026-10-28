import {isPriority} from "./priority";
import { protocolClient } from "./access";
import "server-only";

import { protocolSlug } from "./config";
import { isUuid } from "./search";
import type { GuestSnapshot, ProtocolMode } from "@/types/protocol";
export const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};
export async function snapshotResponse(request: Request, mode: ProtocolMode) {
  const client = await protocolClient(mode);
  const query = new URL(request.url).searchParams;
  const search = (query.get("q") || "").slice(0, 200);
  const category = query.get("category") || null;
  const attendance = query.get("attendance") || "all";
  const priority=query.get("priority")||"all";
  const page = Number(query.get("page") || 1);
  if (
    (priority!=="all"&&!isPriority(priority)) ||
    (category && !isUuid(category)) ||
    !["all", "arrived", "pending"].includes(attendance) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000
  )
    return Response.json(
      { error: "خيارات البحث غير صالحة." },
      { status: 400, headers: privateHeaders },
    );
  try {
    if (!client) throw new Error("setup");
    const { data, error } = await client.rpc("protocol_snapshot", {
      p_slug: protocolSlug(),
      p_query: search,
      p_category: category,
      p_attendance: attendance,
      p_page: page,
      p_priority: priority,
    });
    if (error)
      return Response.json(
        {
          error: ["PGRST202", "42P01", "42883"].includes(error.code)
            ? "قاعدة بيانات التشريفات تحتاج التهيئة المعتمدة قبل عرض الضيوف."
            : error.code === "42501"
              ? "لم يُمنح حسابك الوصول إلى هذا المعرض. راجع الإدارة."
              : "تعذر تحميل بيانات الضيوف. يرجى إعادة المحاولة.",
        },
        { status: error.code === "42501" ? 403 : 503, headers: privateHeaders },
      );
    const snapshot = data as unknown as GuestSnapshot;
    if (
      !snapshot ||
      !Array.isArray(snapshot.guests) ||
      !Array.isArray(snapshot.categories)
    )
      throw new Error("invalid response");
    return Response.json(snapshot, { headers: privateHeaders });
  } catch {
    return Response.json(
      { error: "تعذر تحميل بيانات الضيوف. يرجى إعادة المحاولة." },
      { status: 503, headers: privateHeaders },
    );
  }
}
