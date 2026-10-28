"use client";
import GuestArchive from "./GuestArchive";
import { useState } from "react";
import type { AdminGuest, GuestManagementData } from "@/types/admin";
import { useAdminData } from "@/lib/admin/useAdminData";
import GuestSearch from "@/components/protocol/GuestSearch";
import GuestFilters from "@/components/protocol/GuestFilters";
import GuestDetails from "@/components/protocol/GuestDetails";
import GuestEditor from "./GuestEditor";
import GuestReview from "./GuestReview";
import GuestTable from "./GuestTable";
import AdminStatus from "../AdminStatus";
export default function GuestManagement({ cloudName }: { cloudName: string }) {
  const [filters, setFilters] = useState({
    q: "",
    category: "",
    attendance: "all",
    priority: "all",
    review: "all",
    exhibition: "",
    archive: "active",
    page: 1,
  });
  const query = new URLSearchParams({
    ...filters,
    page: String(filters.page),
  }).toString();
  const { data, error, loading, updating, slow, limited, refresh } =
    useAdminData<GuestManagementData>("/api/admin/guest-management", query);
  const [details, setDetails] = useState<string | null>(null),
    [editing, setEditing] = useState<AdminGuest | null | undefined>(),
    [reviewing, setReviewing] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const archiveGuest = data?.guests.find((g) => g.id === archiving);
  const selected = data?.guests.find((g) => g.id === details),
    reviewGuest = data?.guests.find((g) => g.id === reviewing);
  const exhibition = data?.exhibitions.find(
    (e) => e.slug === data.selected_slug,
  );
  function filter(value: Partial<typeof filters>) {
    setArchiving(null);
    setDetails(null);
    setReviewing(null);
    setFilters((v) => ({ ...v, ...value, page: 1 }));
  }
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={!data || loading}
          onClick={() => setEditing(null)}
          className="min-h-11 rounded bg-foreground px-5 text-sm text-surface disabled:opacity-50"
        >
          إضافة ضيف
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!data}
            onClick={() =>
              filter({
                review: filters.review === "pending" ? "all" : "pending",
              })
            }
            aria-pressed={filters.review === "pending"}
            className="min-h-11 rounded border border-line bg-surface px-4 text-sm disabled:opacity-50"
          >
            بانتظار المراجعة{" "}
            <b className="mr-2 tabular-nums">{data?.review_total ?? "—"}</b>
          </button>
          <button
            type="button"
            disabled={loading || !!error}
            onClick={() => void refresh()}
            className="min-h-11 px-2 text-xs text-muted underline"
          >
            تحديث
          </button>
        </div>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {data && data.exhibitions.length > 1 && (
          <label className="text-xs text-muted">
            المعرض
            <select
              value={data?.selected_slug || filters.exhibition}
              onChange={(e) =>
                filter({ exhibition: e.target.value, category: "" })
              }
              disabled={!data || data.exhibitions.length === 1}
              className="mt-1 min-h-11 w-full rounded border border-line bg-surface px-3 text-sm text-foreground disabled:opacity-80"
            >
              {data?.exhibitions.map((e) => (
                <option key={e.id} value={e.slug}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-muted">
          حالة المراجعة
          <select
            value={filters.review}
            onChange={(e) => filter({ review: e.target.value })}
            className="mt-1 min-h-11 w-full rounded border border-line bg-surface px-3 text-sm text-foreground"
          >
            <option value="all">الجميع</option>
            <option value="pending">تحتاج مراجعة</option>
            <option value="approved">لا تحتاج مراجعة</option>
          </select>
        </label>
      </div>
      <label className="mb-4 block text-xs text-muted">
        قائمة الضيوف
        <select
          value={filters.archive}
          onChange={(e) => filter({ archive: e.target.value })}
          className="mt-1 min-h-11 w-full rounded border border-line bg-surface px-3 text-sm text-foreground"
        >
          <option value="active">الضيوف النشطون</option>
          <option value="archived">الضيوف المستبعدون</option>
        </select>
      </label>
      {data && !data.archiving_ready && (
        <p className="mb-3 text-xs text-muted">
          الإزالة والاستعادة بانتظار التهيئة المعتمدة. قوائم الضيوف الحالية
          محفوظة.
        </p>
      )}
      <GuestSearch value={filters.q} onChange={(q) => filter({ q })} />
      <GuestFilters
        categories={data?.categories || []}
        category={filters.category}
        attendance={filters.attendance}
        priority={filters.priority}
        onCategory={(category) => filter({ category })}
        onAttendance={(attendance) => filter({ attendance })}
        onPriority={(priority) => filter({ priority })}
      />
      <AdminStatus
        error={error}
        loading={!data && loading}
        updating={updating}
        slow={slow}
        limited={limited}
        onRetry={() => void refresh()}
      />
      {data && (
        <>
          <p aria-live="polite" className="mb-3 text-xs text-muted">
            {loading
              ? "جارٍ تحديث البيانات…"
              : "نتائج البحث: " + data.total_matches}
          </p>
          {data.guests.length ? (
            <GuestTable
              guests={data.guests}
              onDetails={(g) => setDetails(g.id)}
              onEdit={setEditing}
              onReview={(g) => setReviewing(g.id)}
              onArchive={(g) => setArchiving(g.id)}
              archiveReady={data.archiving_ready === true}
              disabled={loading || !!error}
            />
          ) : (
            <p className="rounded border border-dashed border-line bg-surface py-10 text-center text-sm text-muted">
              لا توجد سجلات تطابق البحث.
            </p>
          )}
          {data.total_matches > data.page_size && (
            <nav
              aria-label="صفحات الضيوف"
              className="mt-4 flex items-center justify-center gap-4 text-sm"
            >
              <button
                disabled={loading || filters.page <= 1}
                onClick={() => setFilters((v) => ({ ...v, page: v.page - 1 }))}
                className="min-h-11 rounded border border-line px-4 disabled:opacity-40"
              >
                السابق
              </button>
              <span>
                {filters.page} /{" "}
                {Math.ceil(data.total_matches / data.page_size)}
              </span>
              <button
                disabled={
                  loading || filters.page * data.page_size >= data.total_matches
                }
                onClick={() => setFilters((v) => ({ ...v, page: v.page + 1 }))}
                className="min-h-11 rounded border border-line px-4 disabled:opacity-40"
              >
                التالي
              </button>
            </nav>
          )}
        </>
      )}
      {selected && (
        <GuestDetails
          guest={selected}
          mode="admin"
          disabled={loading || !!error}
          onClose={() => setDetails(null)}
          onSaved={refresh}
          onEdit={() => {
            setDetails(null);
            setEditing(selected);
          }}
        />
      )}
      {reviewGuest && (
        <GuestReview
          guest={reviewGuest}
          ready={data?.review_ready || false}
          message={data?.review_message}
          onClose={() => setReviewing(null)}
          onEdit={() => {
            setReviewing(null);
            setEditing(reviewGuest);
          }}
          onSaved={refresh}
        />
      )}
      {archiveGuest && (
        <GuestArchive
          guest={archiveGuest}
          disabled={!!error || !data?.archiving_ready}
          onClose={() => setArchiving(null)}
          onSaved={refresh}
        />
      )}
      {editing !== undefined && data && (
        <GuestEditor
          guest={editing}
          categories={data.categories}
          cloudName={cloudName}
          exhibitionSlug={data.selected_slug}
          exhibitionLabel={exhibition?.name}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            if (editing === null) {
              filter({
                q: "",
                category: "",
                attendance: "all",
                priority: "all",
                review: "all",
              });
            }
            await refresh();
          }}
        />
      )}
    </>
  );
}
