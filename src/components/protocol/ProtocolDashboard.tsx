"use client";
import LiveStatus from "@/components/live/LiveStatus";
import { useState } from "react";
import { branding } from "@/config/branding";
import { useProtocolData } from "@/lib/protocol/useProtocolData";
import type { Guest, ProtocolMode } from "@/types/protocol";
import type { StaffProfile } from "@/types/auth";
import ProtocolHeader from "./ProtocolHeader";
import ProtocolStats from "./ProtocolStats";
import GuestSearch from "./GuestSearch";
import GuestFilters from "./GuestFilters";
import GuestList from "./GuestList";
import GuestEmptyState from "./GuestEmptyState";
import ProtocolSkeleton from "./ProtocolSkeleton";
import GuestDetails from "./GuestDetails";
import GuestEditor from "./GuestEditor";
import GuestImport from "./GuestImport";
export default function ProtocolDashboard({
  staff,
  mode = "protocol",
  cloudName = "",
  importSourceKey = "",
  active = true,
  embedded = false,
}: {
  staff: StaffProfile;
  active?: boolean;
  embedded?: boolean;
  mode?: ProtocolMode;
  cloudName?: string;
  importSourceKey?: string;
}) {
  const {
    filters,
    setFilters,
    snapshot,
    loading,
    updating,
    slow,
    limited,
    error,
    refresh,
  } = useProtocolData(mode, active);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Guest | null | undefined>();
  const [importing, setImporting] = useState(false);
  const guest = snapshot?.guests.find((item) => item.id === selected);
  function filter(update: Partial<typeof filters>) {
    setSelected(null);
    setFilters((current) => ({ ...current, ...update, page: 1 }));
  }
  return (
    <div className={embedded ? "flex flex-col" : "mx-auto flex min-h-dvh max-w-[1440px] flex-col px-4 py-5 sm:px-7 sm:py-6 lg:px-10"}>
      <a href="#protocol-content" className="sr-only focus:not-sr-only">
        انتقل إلى قائمة الضيوف
      </a>
      {!embedded && <ProtocolHeader staff={staff} admin={mode === "admin"} />}
      <main id="protocol-content" className="flex-1">
        <ProtocolStats data={snapshot} />
        <LiveStatus
          updating={updating}
          slow={slow}
          limited={limited}
          error={snapshot ? error : undefined}
          onRetry={() => void refresh()}
        />
        {mode === "admin" && (
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(null)}
              disabled={!snapshot || loading}
              className="min-h-11 rounded bg-foreground px-5 text-sm text-surface disabled:opacity-50"
            >
              إضافة ضيف
            </button>
            <button
              type="button"
              onClick={() => setImporting(true)}
              disabled={!snapshot || loading}
              className="min-h-11 rounded border border-line bg-surface px-5 text-sm disabled:opacity-50"
            >
              استيراد CSV
            </button>
            <span className="text-xs text-muted">
              تعديل البيانات والاستيراد للإدارة فقط
            </span>
          </div>
        )}
        <GuestSearch value={filters.q} onChange={(q) => filter({ q })} />
        <GuestFilters
          categories={snapshot?.categories || []}
          category={filters.category}
          attendance={filters.attendance}
          priority={filters.priority}
          onPriority={(priority) => filter({ priority })}
          onCategory={(category) => filter({ category })}
          onAttendance={(attendance) => filter({ attendance })}
        />
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs leading-6 text-muted">
          <p aria-live="polite">
            {loading
              ? "جارٍ تحديث بيانات الضيوف…"
              : snapshot
                ? "نتائج البحث: " + snapshot.total_matches
                : "البيانات غير متاحة حالياً"}
          </p>
          <div className="flex items-center gap-3">
            {snapshot && (
              <span>
                آخر تحقق:{" "}
                <time dateTime={snapshot.observed_at} className="tabular-nums">
                  {new Intl.DateTimeFormat("ar-IQ-u-nu-latn", {
                    timeZone: "Asia/Baghdad",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }).format(new Date(snapshot.observed_at))}
                </time>
              </span>
            )}
            <button
              type="button"
              disabled={loading || !!error}
              onClick={() => void refresh()}
              className="min-h-10 px-2 underline underline-offset-4 disabled:opacity-50"
            >
              تحديث
            </button>
          </div>
        </div>
        {error && !snapshot ? (
          <GuestEmptyState
            kind="error"
            message={error}
            onRetry={() => void refresh()}
          />
        ) : !snapshot ? (
          <ProtocolSkeleton />
        ) : snapshot.total === 0 ? (
          <GuestEmptyState kind="empty" />
        ) : snapshot.guests.length === 0 ? (
          <GuestEmptyState kind="search" />
        ) : (
          <GuestList
            guests={snapshot.guests}
            mode={mode}
            onOpen={(guest) => setSelected(guest.id)}
            onSaved={refresh}
            disabled={loading}
          />
        )}
        {snapshot && snapshot.total_matches > snapshot.page_size && (
          <nav
            aria-label="صفحات الضيوف"
            className="mt-5 flex items-center justify-center gap-4 text-sm"
          >
            <button
              type="button"
              disabled={loading || filters.page <= 1}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
              className="min-h-11 rounded border border-line px-4 disabled:opacity-40"
            >
              السابق
            </button>
            <span className="tabular-nums">
              {filters.page} /{" "}
              {Math.ceil(snapshot.total_matches / snapshot.page_size)}
            </span>
            <button
              type="button"
              disabled={
                loading ||
                filters.page * snapshot.page_size >= snapshot.total_matches
              }
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
              className="min-h-11 rounded border border-line px-4 disabled:opacity-40"
            >
              التالي
            </button>
          </nav>
        )}
        {guest && (
          <GuestDetails
            guest={guest}
            mode={mode}
            disabled={loading}
            onClose={() => setSelected(null)}
            onSaved={refresh}
            onEdit={() => {
              setSelected(null);
              setEditing(guest);
            }}
          />
        )}
        {mode === "admin" && editing !== undefined && snapshot && (
          <GuestEditor
            guest={editing}
            categories={snapshot.categories}
            cloudName={cloudName}
            onClose={() => setEditing(undefined)}
            onSaved={refresh}
          />
        )}{" "}
        {mode === "admin" && importing && snapshot && (
          <GuestImport
            sourceKey={importSourceKey}
            categories={snapshot.categories}
            cloudName={cloudName}
            onClose={() => setImporting(false)}
            onSaved={refresh}
          />
        )}
      </main>
      {!embedded && <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-line pt-4 text-[11px] text-muted">
        <span>تُراجع التغييرات دون إعادة تحميل الصفحة.</span>
        <span lang="en" dir="ltr">
          {branding.productName} · {branding.developerName}
        </span>
      </footer>}
    </div>
  );
}
