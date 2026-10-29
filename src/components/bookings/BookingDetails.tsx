"use client";
import {
  SaveFeedback,
  Spinner,
  notifySaved,
} from "@/components/live/LiveStatus";
import { useLiveSafety } from "@/lib/live/useLiveSafety";
import { useLiveStore } from "@/lib/live/LiveProvider";
import { useEffect, useRef, useState } from "react";
import type {
  BookingEvent,
  BookingSlot,
  ExhibitionBooking,
} from "@/types/bookings";
import ProtocolDialog from "@/components/protocol/ProtocolDialog";
type Send = (body: Record<string, unknown>) => Promise<unknown>;
export default function BookingDetails({
  disabled = false,
  fullScreen = false,
  scanNote,
  booking: b,
  slots,
  admin,
  onClose,
  onSaved,
  send,
}: {
  disabled?: boolean;
  fullScreen?: boolean;
  scanNote?: string;
  booking: ExhibitionBooking;
  slots: BookingSlot[];
  admin: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  send: Send;
}) {
  const [delta, setDelta] = useState(1),
    [reason, setReason] = useState(""),
    [target, setTarget] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [events, setEvents] = useState<BookingEvent[] | null>(null);
  const [pendingAction, setPendingAction] = useState("");
  const [hasPending, setHasPending] = useState(false);
  const pending = useRef<{
      key: string;
      payload: Record<string, unknown>;
    } | null>(null),
    lock = useRef(false);
  const blocked = useLiveSafety("bookings");
  const detailStore = useLiveStore();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const differentDate = b.visit_date !== today;
  useEffect(() => {
    let alive = true;
    (detailStore
      ? detailStore.detail("bookings", b.id, b.updated_at, () =>
          send({ action: "events", id: b.id }),
        )
      : send({ action: "events", id: b.id })
    )
      .then((x) => {
        if (alive) setEvents(x as BookingEvent[]);
      })
      .catch(() => {
        if (alive) setEvents(null);
      });
    return () => {
      alive = false;
    };
  }, [b.id, b.updated_at, send, detailStore]);
  async function act(action: string) {
    if (lock.current || !confirmed || disabled || blocked) return;
    lock.current = true;
    setBusy(true);
    setError("");
    if (!pending.current)
      pending.current = {
        key: crypto.randomUUID(),
        payload: { action, id: b.id, delta, reason, slot: target || null },
      };
    setHasPending(true);
    setPendingAction(String(pending.current.payload.action));
    try {
      await send({
        ...pending.current.payload,
        operation: pending.current.key,
      });
      pending.current = null;
      setHasPending(false);
      notifySaved("تم تأكيد إجراء الحجز.");
      await onSaved();
      setConfirmed(false);
      setReason("");
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "status" in e &&
        [400, 403, 409].includes(Number(e.status))
      ) {
        pending.current = null;
        setHasPending(false);
      }
      setError(e instanceof Error ? e.message : "تعذر تأكيد الحفظ.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <ProtocolDialog
      title="تفاصيل حجز المعرض"
      fullScreen={fullScreen}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <fieldset
        disabled={disabled || blocked}
        className="space-y-4 text-sm leading-7"
      >
        <h3 className="text-lg">{b.full_name}</h3>
        <p dir="ltr" className="break-all">
          {b.booking_reference}
        </p>
        <p>
          {b.visit_date} · {b.start_time.slice(0, 5)} – {b.end_time.slice(0, 5)}{" "}
          · بغداد
        </p>
        <p dir="ltr">{b.phone}</p>
        {b.email && <p>{b.email}</p>}
        <p>
          عدد الزوار: {b.guest_count} · دخل: {b.checked_in_guest_count} · متبقٍ:{" "}
          {b.guest_count - b.checked_in_guest_count}
        </p>
        <p>الحالة: {b.status === "confirmed" ? "مؤكد" : "ملغى"}</p>
        {b.notes && <p>{b.notes}</p>}
        {scanNote && <p role="status" className="rounded border border-line bg-surface p-3 text-muted">{scanNote}</p>}
        {differentDate && <p className="text-sm text-muted">تسجيل الوصول خارج تاريخ الحجز يتطلب الإجراء الإداري المعتمد.</p>}
        {b.status === "confirmed" && (
          <>
            <label className="block">
              {admin ? "عدد الداخلين / التصحيح السالب" : "عدد الداخلين"}
              <input
                type="number"
                min={admin ? -b.checked_in_guest_count : 1}
                max={b.guest_count - b.checked_in_guest_count}
                value={delta}
                disabled={busy || hasPending}
                onChange={(e) => setDelta(Number(e.target.value))}
                className="mx-3 w-24 rounded border border-line bg-background p-2"
              />
            </label>
            {admin && (
              <label className="block">
                سبب الإجراء الإداري
                <input
                  value={reason}
                  maxLength={500}
                  disabled={busy || hasPending}
                  onChange={(e) => setReason(e.target.value)}
                  className="block w-full rounded border border-line bg-background p-2"
                />
              </label>
            )}
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              أؤكد مراجعة الحجز والعدد قبل تنفيذ الإجراء
            </label>
            <button
              type="button"
              disabled={
                busy ||
                !confirmed ||
                (!admin && differentDate) ||
                delta === 0 ||
                delta > b.guest_count - b.checked_in_guest_count ||
                delta < (admin ? -b.checked_in_guest_count : 1) ||
                (admin &&
                  (differentDate || delta < 0) &&
                  reason.trim().length < 5)
              }
              onClick={() => void act("arrival")}
              className="min-h-11 rounded bg-foreground px-4 text-surface disabled:opacity-40"
            >
              {busy && pendingAction === "arrival" ? (
                <>
                  <Spinner /> جارٍ التحقق…
                </>
              ) : (
                "تسجيل الوصول / التصحيح"
              )}
            </button>
            {admin && b.checked_in_guest_count === 0 && (
              <div className="space-y-3 border-t border-line pt-4">
                <p>
                  الإلغاء أو النقل يحتاج سبباً؛ لا يمكن إلغاء حجز فيه وصول قبل
                  تصحيحه.
                </p>
                <label className="block">
                  نقل إلى موعد
                  <select
                    value={target}
                    disabled={busy || hasPending}
                    onChange={(e) => setTarget(e.target.value)}
                    className="block w-full rounded border border-line bg-background p-2"
                  >
                    <option value="">اختر موعداً</option>
                    {slots
                      .filter(
                        (s) =>
                          s.id !== b.slot_id &&
                          !s.is_closed &&
                          s.capacity !== null,
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.visit_date} · {s.start_time.slice(0, 5)} · متبقٍ{" "}
                          {s.capacity! - s.reserved_count}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={
                      busy || !confirmed || reason.trim().length < 5 || !target
                    }
                    onClick={() => void act("reschedule")}
                    className="min-h-11 rounded border border-line px-4 disabled:opacity-40"
                  >
                    {busy && pendingAction === "reschedule" ? (
                      <>
                        <Spinner /> جارٍ نقل الموعد…
                      </>
                    ) : (
                      "نقل الموعد"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !confirmed || reason.trim().length < 5}
                    onClick={() => void act("cancel")}
                    className="min-h-11 rounded border border-line px-4 text-error disabled:opacity-40"
                  >
                    {busy && pendingAction === "cancel" ? (
                      <>
                        <Spinner /> جارٍ الإلغاء…
                      </>
                    ) : (
                      "إلغاء الحجز"
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {hasPending && (
          <button
            type="button"
            disabled={busy || !confirmed}
            onClick={() => void act(String(pending.current!.payload.action))}
            className="min-h-11 underline"
          >
            إعادة التحقق من الإجراء السابق
          </button>
        )}
        {error && (
          <p role="alert" className="text-error">
            {error}
          </p>
        )}
        <section className="border-t border-line pt-4">
          <h4>سجل الوصول والإجراءات</h4>
          {events === null ? (
            <p>تعذر تحميل سجل العمليات.</p>
          ) : events.length === 0 ? (
            <p>لا توجد عمليات مسجلة.</p>
          ) : (
            events.map((e) => (
              <div key={e.id} className="border-b border-line py-2">
                <p>
                  {
                    (
                      {
                        check_in: "تسجيل وصول",
                        correction: "تصحيح إداري",
                        date_override: "استثناء تاريخ إداري",
                        cancel: "إلغاء الحجز",
                        reschedule: "نقل الموعد",
                      } as Record<string, string>
                    )[e.action]
                  }{" "}
                  · {e.guest_delta} · {e.actor_name || e.actor_id}
                </p>
                <time>
                  {new Date(e.created_at).toLocaleString("ar-IQ", {
                    timeZone: "Asia/Baghdad",
                  })}
                </time>
                {e.reason && <p>{e.reason}</p>}
              </div>
            ))
          )}
        </section>
        <SaveFeedback pending={busy} />
      </fieldset>
    </ProtocolDialog>
  );
}
