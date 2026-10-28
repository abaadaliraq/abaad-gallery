import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  Activity,
  ActivityResult,
  AdminExhibition,
  AdminGuest,
  DataState,
  GuestManagementData,
  ProtocolSummary,
  SalesSummary,
  StaffDirectory,
} from "@/types/admin";
import type { GuestSnapshot } from "@/types/protocol";
import type { SalesSnapshot } from "@/types/sales";
import { protocolSlug } from "@/lib/protocol/config";
import { privateHeaders } from "@/lib/protocol/queries";
import { isUuid } from "@/lib/protocol/search";
import { isPriority } from "@/lib/protocol/priority";
import { adminClient } from "./access";
import { baghdadDateRange, filterActivities, saleEventKind } from "./domain";
type Client = SupabaseClient<Database>;
const missing = (code?: string) =>
  !!code && ["PGRST202", "42P01", "42883"].includes(code);
export async function exhibitions(client: Client) {
  const { data, error } = await client
    .from("protocol_exhibitions")
    .select("id,slug,name,is_active")
    .eq("is_active", true)
    .order("name");
  if (error || !data) throw Error("تعذر قراءة المعارض المتاحة.");
  return data as AdminExhibition[];
}
async function selectedExhibition(client: Client, slug?: string) {
  const rows = await exhibitions(client);
  const selected =
    rows.find((e) => e.slug === (slug || protocolSlug())) ||
    (rows.length === 1 && !slug ? rows[0] : null);
  if (!selected) throw Error("اختر معرضاً نشطاً متاحاً للإدارة.");
  return { rows, selected };
}
export async function staffDirectory(
  client: Client,
): Promise<DataState<StaffDirectory>> {
  const { data, error } = await client.rpc("admin_staff_directory", {});
  if (error)
    return missing(error.code)
      ? {
          state: "pending",
          message:
            "دليل الموظفين والتعديلات بانتظار اعتماد supabase/admin.sql؛ صلاحيات staff_roles الحالية محفوظة.",
        }
      : { state: "error", message: "تعذر قراءة دليل الموظفين." };
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !Array.isArray(data.staff) ||
    typeof data.total !== "number"
  )
    return { state: "error", message: "استجابة دليل الموظفين غير صالحة." };
  return { state: "ready", data: data as unknown as StaffDirectory };
}
async function protocolSummary(
  client: Client,
  exhibition: AdminExhibition,
): Promise<DataState<ProtocolSummary>> {
  try {
    const quick = await client.rpc("admin_guest_page", {
      p_slug: exhibition.slug,
    });
    if (!quick.error) {
      const value = quick.data as unknown as GuestManagementData;
      return {
        state: "ready",
        data: {
          total: value.total,
          checked_in: value.checked_in,
          pending: value.pending,
          review_required: value.review_total,
        },
      };
    }
    if (!missing(quick.error.code))
      return {
        state: "error",
        message: "تعذر التحقق من إحصاءات الضيوف النشطين.",
      };
  } catch {
    /* Retain compatibility until the reviewed RPC is installed. */
  }
  const [snapshot, review] = await Promise.all([
    client.rpc("protocol_snapshot", { p_slug: exhibition.slug }),
    client
      .from("protocol_invitations")
      .select("id", { count: "exact", head: true })
      .eq("exhibition_id", exhibition.id)
      .eq("review_required", true),
  ]);
  const data = snapshot.data as unknown as GuestSnapshot;
  if (
    snapshot.error ||
    review.error ||
    review.count === null ||
    !data ||
    typeof data.total !== "number"
  )
    return {
      state: "error",
      message:
        "تعذر جلب إحصائيات التشريفات. لا يُعرض صفر بدلاً من الاستعلام الفاشل.",
    };
  return {
    state: "ready",
    data: {
      total: data.total,
      checked_in: data.checked_in,
      pending: data.pending,
      review_required: review.count,
    },
  };
}
async function salesSummary(
  client: Client,
  slug: string,
): Promise<DataState<SalesSummary>> {
  const { data, error } = await client.rpc("sales_snapshot", { p_slug: slug });
  if (error)
    return {
      state: missing(error.code) ? "pending" : "error",
      message: missing(error.code)
        ? "قاعدة المبيعات بانتظار التهيئة المعتمدة."
        : "تعذر جلب إحصائيات الأعمال الفنية.",
    };
  const snapshot = data as unknown as SalesSnapshot;
  if (!snapshot || typeof snapshot.total !== "number")
    return { state: "error", message: "استجابة المبيعات غير صالحة." };
  return {
    state: "ready",
    data: {
      total: snapshot.total,
      available: snapshot.available,
      reserved: snapshot.reserved,
      sold: snapshot.sold,
    },
  };
}
export async function activities(
  client: Client,
  exhibition: AdminExhibition,
  params: URLSearchParams,
  directory: DataState<StaffDirectory>,
  own: { user_id: string; full_name: string },
  limit = 200,
): Promise<ActivityResult> {
  const department = params.get("department") || "all",
    kind = params.get("kind") || "all",
    actor = params.get("actor") || "";
  if (
    !["all", "protocol", "sales"].includes(department) ||
    ![
      "all",
      "check_in",
      "undo_check_in",
      "reserve",
      "sell",
      "cancel_reservation",
      "correct_status",
      "artwork_added",
    ].includes(kind) ||
    (actor && !isUuid(actor))
  )
    throw Error("فلتر العمليات غير صالح.");
  const range = baghdadDateRange(
    params.get("from") || "",
    params.get("to") || "",
  );
  const names = new Map<string, string>([[own.user_id, own.full_name]]);
  if (directory.state === "ready")
    [...directory.data.staff, ...(directory.data.historical_staff || [])].forEach((s) => names.set(s.user_id, s.full_name));
  let p = client
    .from("protocol_attendance_events")
    .select("id,invitation_id,actor_id,action,created_at,reason")
    .eq("exhibition_id", exhibition.id)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  let a = client
    .from("artwork_status_history")
    .select(
      "id,listing_id,actor_id,previous_status,new_status,created_at,reason",
    )
    .eq("exhibition_id", exhibition.id)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (actor) {
    p = p.eq("actor_id", actor);
    a = a.eq("actor_id", actor);
  }
  if (range.from) {
    p = p.gte("created_at", range.from);
    a = a.gte("created_at", range.from);
  }
  if (range.to) {
    p = p.lt("created_at", range.to);
    a = a.lt("created_at", range.to);
  }
  const [protocol, sales] = await Promise.all([
    department === "sales" ? Promise.resolve({ data: [], error: null }) : p,
    department === "protocol" ? Promise.resolve({ data: [], error: null }) : a,
  ]);
  const errors: string[] = [];
  if (protocol.error) errors.push("تعذر قراءة سجل التشريفات.");
  if (sales.error) errors.push("تعذر قراءة سجل المبيعات.");
  const truncated =
    (protocol.data || []).length > limit || (sales.data || []).length > limit;
  const pr = (protocol.data || []).slice(0, limit),
    sr = (sales.data || []).slice(0, limit);
  const invitationIds = [...new Set(pr.map((e) => e.invitation_id))],
    listingIds = [...new Set(sr.map((e) => e.listing_id))];
  const [invitations, listings] = await Promise.all([
    invitationIds.length
      ? client
          .from("protocol_invitations")
          .select("id,guest_id")
          .in("id", invitationIds)
      : Promise.resolve({ data: [], error: null }),
    listingIds.length
      ? client
          .from("exhibition_artworks")
          .select("id,artwork_id,artwork_code")
          .in("id", listingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const guestIds = [
      ...new Set((invitations.data || []).map((i) => i.guest_id)),
    ],
    artIds = [...new Set((listings.data || []).map((i) => i.artwork_id))];
  const [guests, artworks] = await Promise.all([
    guestIds.length
      ? client
          .from("protocol_guests")
          .select("id,full_name_ar")
          .in("id", guestIds)
      : Promise.resolve({ data: [], error: null }),
    artIds.length
      ? client.from("artworks").select("id,title_ar").in("id", artIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (invitations.error || listings.error || guests.error || artworks.error)
    errors.push("تعذر تحميل بعض أسماء أصحاب العمليات.");
  const guestsById = new Map(
      (guests.data || []).map((g) => [g.id, g.full_name_ar]),
    ),
    artById = new Map((artworks.data || []).map((g) => [g.id, g.title_ar]));
  const subjects = new Map(
      (invitations.data || []).map((i) => [
        i.id,
        guestsById.get(i.guest_id) || "اسم الضيف غير متاح",
      ]),
    ),
    titles = new Map(
      (listings.data || []).map((i) => [
        i.id,
        artById.get(i.artwork_id) || i.artwork_code,
      ]),
    );
  const events: Activity[] = [
    ...pr.map((e) => ({
      id: e.id,
      department: "protocol" as const,
      kind: e.action,
      subject: subjects.get(e.invitation_id) || "اسم الضيف غير متاح",
      actor_id: e.actor_id,
      actor_name: e.actor_id ? names.get(e.actor_id) || null : null,
      created_at: e.created_at,
      reason: e.reason,
    })),
    ...sr.map((e) => ({
      id: e.id,
      department: "sales" as const,
      kind: saleEventKind(e.previous_status, e.new_status),
      subject: titles.get(e.listing_id) || "اسم العمل غير متاح",
      actor_id: e.actor_id,
      actor_name: e.actor_id ? names.get(e.actor_id) || null : null,
      created_at: e.created_at,
      reason: e.reason,
    })),
  ];
  const filtered = filterActivities(events, {
    department,
    kind,
    actor,
    from: range.from,
    to: range.to,
  });
  return { events: filtered, total: filtered.length, truncated, errors };
}
async function legacyGuestManagement(
  client: Client,
  params: URLSearchParams,
): Promise<GuestManagementData> {
  const { rows, selected } = await selectedExhibition(
    client,
    params.get("exhibition") || undefined,
  );
  const category = params.get("category") || null,
    attendance = params.get("attendance") || "all",
    priority = params.get("priority") || "all",
    review = params.get("review") || "all",
    page = Number(params.get("page") || 1);
  if (
    (category && !isUuid(category)) ||
    !["all", "arrived", "pending"].includes(attendance) ||
    (priority !== "all" && !isPriority(priority)) ||
    !["all", "pending", "approved"].includes(review) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000
  )
    throw Error("فلاتر الضيوف غير صالحة.");
  const args = {
    p_slug: selected.slug,
    p_query: (params.get("q") || "").slice(0, 200),
    p_category: category,
    p_attendance: attendance,
    p_priority: priority,
  };
  const first = await client.rpc("protocol_snapshot", { ...args, p_page: 1 });
  if (first.error) throw Error("تعذر قراءة قائمة الضيوف.");
  const snapshot = first.data as unknown as GuestSnapshot;
  if (!snapshot || !Array.isArray(snapshot.guests))
    throw Error("استجابة قائمة الضيوف غير صالحة.");
  const pages = Math.ceil(snapshot.total_matches / snapshot.page_size);
  if (pages > 50) throw Error("ضيّق البحث لعرض قائمة إدارية أصغر.");
  const extra = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
      client.rpc("protocol_snapshot", { ...args, p_page: i + 2 }),
    ),
  );
  if (extra.some((r) => r.error))
    throw Error("تعذر إكمال قائمة الضيوف. أعد التحديث.");
  const all = [
    ...snapshot.guests,
    ...extra.flatMap((r) => (r.data as unknown as GuestSnapshot).guests),
  ];
  if (
    new Set(all.map((g) => g.id)).size !== all.length ||
    all.length !== snapshot.total_matches
  )
    throw Error("تغيرت القائمة أثناء تحميلها؛ أعد التحديث.");
  const matches = all.filter(
    (g) => review === "all" || g.review_required === (review === "pending"),
  );
  const pageRows = matches.slice((page - 1) * 20, page * 20);
  const [reviewCount, versionRows, directory] = await Promise.all([
    client
      .from("protocol_invitations")
      .select("id", { count: "exact", head: true })
      .eq("exhibition_id", selected.id)
      .eq("review_required", true),
    pageRows.length
      ? client
          .from("protocol_invitations")
          .select("id,guest_id,updated_at")
          .in(
            "id",
            pageRows.map((g) => g.id),
          )
      : Promise.resolve({ data: [], error: null }),
    staffDirectory(client),
  ]);
  if (reviewCount.error || reviewCount.count === null || versionRows.error)
    throw Error("تعذر قراءة حالة المراجعة وتوقيت البيانات.");
  const versions = new Map(
    (versionRows.data || []).map((g) => [g.id, g.updated_at]),
  );
  const guestVersions = pageRows.length
    ? await client
        .from("protocol_guests")
        .select("id,updated_at")
        .in(
          "id",
          pageRows.map((g) => g.guest_id),
        )
    : { data: [], error: null };
  if (guestVersions.error) throw Error("تعذر قراءة نسخة بيانات الضيف.");
  const guestById = new Map(
    (guestVersions.data || []).map((g) => [g.id, g.updated_at]),
  );
  const guests: AdminGuest[] = pageRows.map((g) => ({
    ...g,
    invitation_updated_at: versions.get(g.id) || null,
    guest_updated_at: guestById.get(g.guest_id) || null,
  }));
  return {
    ...snapshot,
    guests,
    total_matches: matches.length,
    page,
    page_size: 20,
    review_total: reviewCount.count,
    exhibitions: rows,
    selected_slug: selected.slug,
    review_ready:
      directory.state === "ready" && directory.data.capabilities.guest_review,
    review_message: directory.state !== "ready" ? directory.message : undefined,
  };
}
export async function adminResponse(
  request: Request,
  kind: "overview" | "guests" | "staff" | "activity" | "settings" | "artworks",
) {
  const { client, staff } = await adminClient();
  const params = new URL(request.url).searchParams;
  try {
    if (kind === "staff")
      return Response.json(await staffDirectory(client), {
        headers: privateHeaders,
      });
    if (kind === "guests")
      return Response.json(await guestManagement(client, params), {
        headers: privateHeaders,
      });
    const { selected } = await selectedExhibition(client);
    if (kind === "settings")
      return Response.json(
        { exhibition: selected },
        { headers: privateHeaders },
      );
    if (kind === "artworks") {
      const { data, error } = await client.rpc("sales_snapshot", {
        p_slug: selected.slug,
      });
      return Response.json(
        error
          ? {
              state: missing(error.code) ? "pending" : "error",
              message: "تعذر قراءة مجموعات الأعمال من Supabase.",
            }
          : { state: "ready", data },
        { headers: privateHeaders },
      );
    }
    const directory = await staffDirectory(client);
    if (kind === "activity")
      return Response.json(
        await activities(client, selected, params, directory, staff),
        { headers: privateHeaders },
      );
    const [protocol, sales, activity] = await Promise.all([
      protocolSummary(client, selected),
      salesSummary(client, selected.slug),
      activities(client, selected, new URLSearchParams(), directory, staff, 12),
    ]);
    return Response.json(
      { protocol, sales, staff: directory, activity, exhibition: selected },
      { headers: privateHeaders },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "تعذر تحميل بيانات الإدارة." },
      { status: 503, headers: privateHeaders },
    );
  }
}

async function guestManagement(
  client: Client,
  params: URLSearchParams,
): Promise<GuestManagementData> {
  const archive = params.get("archive") || "active",
    review = params.get("review") || "all",
    attendance = params.get("attendance") || "all",
    priority = params.get("priority") || "all",
    category = params.get("category") || null,
    page = Number(params.get("page") || 1);
  if (
    !["active", "archived"].includes(archive) ||
    !["all", "pending", "approved"].includes(review) ||
    !["all", "arrived", "pending"].includes(attendance) ||
    (priority !== "all" && !isPriority(priority)) ||
    (category && !isUuid(category)) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000
  )
    throw Error("فلاتر الضيوف غير صالحة.");
  let response;
  try {
    response = await client.rpc("admin_guest_page", {
      p_slug: params.get("exhibition") || protocolSlug(),
      p_query: (params.get("q") || "").slice(0, 200),
      p_category: category,
      p_attendance: attendance,
      p_priority: priority,
      p_page: page,
      p_review: review,
      p_archive: archive,
    });
  } catch {
    response = { data: null, error: { code: "PGRST202" } };
  }
  if (response.error) {
    if (!missing(response.error.code)) throw Error("تعذر جلب قائمة الضيوف.");
    if (archive === "archived")
      throw Error("عرض الضيوف المستبعدين بانتظار التهيئة المعتمدة.");
    return {
      ...(await legacyGuestManagement(client, params)),
      archiving_ready: false,
    };
  }
  const result = response.data as unknown as GuestManagementData;
  if (
    !result ||
    !Array.isArray(result.guests) ||
    !Array.isArray(result.exhibitions)
  )
    throw Error("تعذر التحقق من قائمة الضيوف.");
  return result;
}
