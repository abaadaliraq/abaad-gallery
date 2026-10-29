"use client";
import LiveStatus from "@/components/live/LiveStatus";
import LoadingIndicator from "@/components/ui/LoadingIndicator";
import { useState } from "react";
import type { StaffProfile } from "@/types/auth";
import type { Artwork, SalesMode } from "@/types/sales";
import { useSalesData } from "@/lib/sales/useSalesData";
import { branding } from "@/config/branding";
import SalesHeader from "./SalesHeader";
import SalesStats from "./SalesStats";
import ArtistSelector from "./ArtistSelector";
import ArtworkSearch from "./ArtworkSearch";
import ArtworkFilters from "./ArtworkFilters";
import ArtworkGrid from "./ArtworkGrid";
import ArtworkDetails from "./ArtworkDetails";
import ArtworkEditor from "@/components/admin/artworks/ArtworkEditor";
import ArtistEditor from "@/components/admin/artworks/ArtistEditor";
export default function SalesDashboard({
  staff,
  mode = "sales",
  cloudName = "",
  readOnly = false,
  embedded = false,
}: {
  staff: StaffProfile;
  mode?: SalesMode;
  cloudName?: string;
  readOnly?: boolean;
  embedded?: boolean;
}) {
  const {
    filters,
    setFilters,
    snapshot,
    error,
    setup,
    loading,
    updating,
    slow,
    limited,
    refresh,
  } = useSalesData(mode);
  const [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<Artwork | null | undefined>(),
    [artistsOpen, setArtistsOpen] = useState(false);
  const artwork = snapshot?.artworks.find((a) => a.id === selected);
  function filter(value: Partial<typeof filters>) {
    if(value.artist!==undefined){const chosen=snapshot?.artists.find(a=>a.id===value.artist);value.collection=chosen?.slug==='wissam-radi'?'painting':'all';}
    setSelected(null);
    setFilters((current) => ({ ...current, ...value, page: 1 }));
  }
  const ContentTag = embedded ? "section" : "main";
  return (
    <div
      className={
        embedded
          ? ""
          : "mx-auto min-h-dvh max-w-[1440px] px-3 py-3 sm:px-7 sm:py-5 lg:px-10"
      }
    >
      <a className="sr-only focus:not-sr-only" href="#sales-content">
        انتقل إلى الأعمال الفنية
      </a>
      {!embedded && <SalesHeader staff={staff} admin={mode === "admin"} />}
      <ContentTag id="sales-content">
        <SalesStats data={snapshot} />
        <LiveStatus
          updating={updating}
          slow={slow}
          limited={limited}
          error={snapshot ? error : undefined}
          onRetry={() => void refresh()}
        />
        <ArtistSelector
          artists={snapshot?.artists || null}
          selected={filters.artist}
          onSelect={(artist) => filter({ artist })}
          disabled={loading || !!error}
        />
        {mode === "admin" && !readOnly && (
          <div className="mb-3 flex flex-wrap gap-2 sm:mb-5 sm:flex sm:flex-wrap sm:gap-2">
            {[
              ["إضافة عمل", () => setEditing(null)],
              ["إدارة الفنانين", () => setArtistsOpen(true)],
            ].map(([label, action]) => (
              <button
                key={String(label)}
                type="button"
                disabled={!snapshot || loading}
                onClick={action as () => void}
                className="min-h-11 rounded border border-line bg-surface px-1.5 text-xs disabled:opacity-50 sm:px-4 sm:text-sm"
              >
                {String(label)}
              </button>
            ))}
          </div>
        )}
        {snapshot?.artists.find(a=>a.id===filters.artist)?.slug==='wissam-radi' && <div className="mb-3 flex flex-wrap gap-2 sm:mb-5" aria-label="أقسام أعمال وسام راضي">{([['painting','اللوحات'],['miniature','المصغرات']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={filters.collection===value} onClick={()=>filter({collection:value})} className="min-h-11 rounded border border-line bg-surface px-2 text-xs sm:px-4 sm:text-sm">{label} — {snapshot.artists.find(a=>a.id===filters.artist)?.[value==='painting'?'paintings':'miniatures']??'—'} عملاً</button>)}</div>}
        <div className="sales-mobile-tools">
        <ArtworkSearch value={filters.q} onChange={(q) => filter({ q })} />
        <ArtworkFilters
          artists={snapshot?.artists || []}
          artist={filters.artist}
          status={filters.status}
          onChange={filter}
        />
        </div>
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted">
          <p aria-live="polite">
            {loading
              ? "جارٍ تحديث الأعمال…"
              : snapshot
                ? "نتائج البحث: " + snapshot.total_matches
                : "البيانات غير متاحة حالياً"}
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={() => void refresh()}
            className="min-h-11 px-2 underline underline-offset-4 disabled:opacity-50"
          >
            تحديث
          </button>
        </div>
        {error && (
          <section
            role="alert"
            className="mb-4 rounded border border-line bg-surface p-5 text-sm leading-7"
          >
            <p>{error}</p>
            {setup && (
              <p className="mt-2 text-xs text-muted">
                أسماء الفنانين أعلاه من إعدادات المعرض. لم تُضف أعمال أو أسعار
                افتراضية؛ العمليات بانتظار تهيئة قاعدة البيانات المعتمدة.
              </p>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 min-h-11 rounded border border-line px-4"
            >
              إعادة المحاولة
            </button>
          </section>
        )}
        {!error && !snapshot ? (
          <LoadingIndicator />
        ) : snapshot?.artworks.length ? (
          <ArtworkGrid
            artworks={snapshot.artworks}
            mode={mode}
            onOpen={(a) => setSelected(a.id)}
          />
        ) : (
          (!error || setup) && (
            <section className="rounded border border-dashed border-line bg-surface px-5 py-12 text-center">
              <p className="text-base">
                {snapshot && snapshot.total > 0
                  ? "لا توجد أعمال تطابق البحث."
                  : "لم تتم إضافة أعمال فنية لهذا الفنان بعد."}
              </p>
              <p className="mt-2 text-xs text-muted">
                تظهر هنا الصور والتفاصيل والأسعار بعد إدخال الأعمال المعتمدة.
              </p>
            </section>
          )
        )}
        {snapshot && snapshot.total_matches > snapshot.page_size && (
          <nav
            aria-label="صفحات الأعمال"
            className="mt-6 flex items-center justify-center gap-4 text-sm"
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
              {Math.ceil(snapshot.total_matches / snapshot.page_size)}
            </span>
            <button
              disabled={
                loading ||
                filters.page * snapshot.page_size >= snapshot.total_matches
              }
              onClick={() => setFilters((v) => ({ ...v, page: v.page + 1 }))}
              className="min-h-11 rounded border border-line px-4 disabled:opacity-40"
            >
              التالي
            </button>
          </nav>
        )}
        {artwork && (
          <ArtworkDetails
            readOnly={readOnly}
            artwork={artwork}
            mode={mode}
            disabled={loading}
            onClose={() => setSelected(null)}
            onSaved={refresh}
            onEdit={() => {
              setSelected(null);
              setEditing(artwork);
            }}
          />
        )}
        {mode === "admin" && !readOnly && snapshot && editing !== undefined && (
          <ArtworkEditor
            artwork={editing}
            artists={snapshot.artists}
            cloudName={cloudName}
            onClose={() => setEditing(undefined)}
            onSaved={refresh}
          />
        )}
        {mode === "admin" && snapshot && artistsOpen && (
          <ArtistEditor
            artists={snapshot.artists}
            onClose={() => setArtistsOpen(false)}
            onSaved={refresh}
          />
        )}
      </ContentTag>
      {!embedded && (
        <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-line pt-4 text-[11px] text-muted">
          <span>تُراجع التغييرات دون إعادة تحميل الصفحة.</span>
          <span lang="en">
            {branding.productName} · {branding.developerName}
          </span>
        </footer>
      )}
    </div>
  );
}
