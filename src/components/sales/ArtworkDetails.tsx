"use client";
import { useLiveStore } from "@/lib/live/LiveProvider";
import { useEffect, useState } from "react";
import type { Artwork, SalesMode, StatusEvent } from "@/types/sales";
import { artworkHistory } from "@/lib/sales/actions";
import { dimensions, priceText, statusLabels } from "@/lib/sales/domain";
import SalesDialog from "./SalesDialog";
import ArtworkImage from "./ArtworkImage";
import ArtworkStatusBadge from "./ArtworkStatusBadge";
import ArtworkStatusActions from "./ArtworkStatusActions";
const stamp = (value: string) =>
  new Intl.DateTimeFormat("ar-IQ-u-nu-latn", {
    timeZone: "Asia/Baghdad",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
export default function ArtworkDetails({
  artwork,
  mode,
  onClose,
  onSaved,
  onEdit,
  disabled,
  readOnly = false,
}: {
  artwork: Artwork;
  mode: SalesMode;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onEdit: () => void;
  disabled: boolean;
  readOnly?: boolean;
}) {
  const detailStore = useLiveStore();
  const [events, setEvents] = useState<StatusEvent[]>([]),
    [historyError, setHistoryError] = useState("");
  useEffect(() => {
    let disposed = false;
    if (mode === "admin")
      (detailStore
        ? detailStore.detail(
            "sales",
            artwork.id,
            String(artwork.version),
            async () => {
              const result = await artworkHistory(artwork.id);
              if (result.error) throw Error(result.error);
              return result;
            },
          )
        : artworkHistory(artwork.id)
      )
        .then((result) => {
          if (!disposed) {
            setEvents(result.events || []);
            setHistoryError(result.error || "");
          }
        })
        .catch(() => {
          if (!disposed) setHistoryError("تعذر قراءة سجل التغييرات.");
        });
    return () => {
      disposed = true;
    };
  }, [mode, artwork.id, artwork.version, detailStore]);
  const miniature = artwork.collection_kind === "miniature";
  const fields = [
    ["الفنان", artwork.artist_name_ar],
    ["رقم العمل", artwork.artwork_code],
    ["سنة الإنجاز", artwork.year_created],
    ["الأبعاد", dimensions(artwork)],
    ["الخامة والتقنية", artwork.medium],
  ];
  return (
    <SalesDialog title={miniature ? "تفاصيل المصغرة" : "تفاصيل العمل الفني"} onClose={onClose} wide={!miniature}>
      <div className={miniature ? "grid gap-4" : "grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]"}>
        {(!miniature || artwork.photo_local_path || artwork.photo_public_id || artwork.photo_url) && <ArtworkImage
          key={artwork.photo_local_path || artwork.photo_public_id || artwork.photo_url}
          artwork={artwork}
          mode={mode}
          large
        />}
        <div>
          <ArtworkStatusBadge status={artwork.status} />
          {!miniature && <h3 className="mt-3 text-xl font-medium leading-9">
            {artwork.title_ar || "الاسم الفني غير مكتمل"}
          </h3>}
          {artwork.title_en && (
            <p dir="ltr" lang="en" className="text-right text-sm text-muted">
              {artwork.title_en}
            </p>
          )}
          <p className="my-4 text-lg tabular-nums">
            {priceText(artwork.price, artwork.currency)}
          </p>
          <dl className="space-y-3 border-y border-line py-4 text-sm">
            {fields
              .filter(([, value]) => value !== null && value !== "")
              .map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="shrink-0 text-muted">{label}</dt>
                  <dd className="text-left">{value}</dd>
                </div>
              ))}
          </dl>
          {mode === "admin" && artwork.catalog_note && <p role="note" className="mt-4 text-sm text-muted">{artwork.catalog_note}</p>}
          {artwork.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
              {artwork.description}
            </p>
          )}
          {((artwork.status === "reserved" && artwork.reserved_at) ||
            (artwork.status === "sold" && artwork.sold_at)) && (
            <p className="mt-4 text-xs leading-6 text-muted">
              {artwork.status === "sold" ? "وقت تسجيل البيع: " : "وقت الحجز: "}
              {stamp(
                (artwork.status === "sold"
                  ? artwork.sold_at
                  : artwork.reserved_at)!,
              )}
              <br />
              الموظف:{" "}
              {(artwork.status === "sold"
                ? artwork.sold_by_name
                : artwork.reserved_by_name) || "غير متاح"}
            </p>
          )}
          {!readOnly && (
            <ArtworkStatusActions
              artwork={artwork}
              mode={mode}
              onSaved={onSaved}
              disabled={disabled}
            />
          )}
          {mode === "admin" && !readOnly && (
            <button
              type="button"
              onClick={onEdit}
              disabled={disabled}
              className="mt-3 min-h-11 rounded border border-line px-4 text-sm"
            >
              تعديل بيانات العمل والسعر
            </button>
          )}
        </div>
      </div>
      {mode === "admin" && (
        <section className="mt-6 border-t border-line pt-4">
          <h3 className="text-sm font-medium">سجل تغييرات الحالة</h3>
          {historyError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {historyError}
            </p>
          )}
          <ol className="mt-3 divide-y divide-line">
            {events.map((event) => (
              <li key={event.id} className="py-3 text-xs leading-6">
                <span>
                  {event.previous_status
                    ? statusLabels[event.previous_status]
                    : "إضافة العمل"}{" "}
                  ← {statusLabels[event.new_status]}
                </span>
                <span className="block text-muted">
                  {event.actor_name} · {stamp(event.created_at)}
                  {event.reason ? " · " + event.reason : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </SalesDialog>
  );
}
