"use client";
import {
  SaveFeedback,
  Spinner,
  notifySaved,
} from "@/components/live/LiveStatus";
import { useLiveSafety } from "@/lib/live/useLiveSafety";
import { useRef, useState } from "react";
import type { BookingSlot } from "@/types/bookings";
export default function SlotManagement({
  slots,
  send,
  onSaved,
}: {
  slots: BookingSlot[];
  send: (x: Record<string, unknown>) => Promise<unknown>;
  onSaved: () => Promise<void>;
}) {
  const operationBusy = useRef(false);
  const [date, setDate] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [capacity, setCapacity] = useState(""),
    [closed, setClosed] = useState(true),
    [editing, setEditing] = useState<BookingSlot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const blocked = useLiveSafety("bookings");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || blocked || operationBusy.current) return;
    operationBusy.current = true;
    setBusy(true);
    try {
      await send({
        action: "slot",
        id: editing?.id || null,
        version: editing?.version || null,
        data: {
          visit_date: date,
          start_time: start,
          end_time: end,
          capacity: capacity === "" ? null : Number(capacity),
          is_closed: closed,
        },
      });
      setEditing(null);
      setDate("");
      setStart("");
      setEnd("");
      setCapacity("");
      setClosed(true);
      setError("");
      notifySaved("تم حفظ الموعد والسعة.");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ.");
    } finally {
      operationBusy.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="mb-5 rounded border border-line bg-surface p-4">
      <summary className="min-h-10 cursor-pointer">
        إدارة المواعيد والسعة — مغلقة ما لم تُحدد صراحة
      </summary>
      <form
        onSubmit={save}
        className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label>
          التاريخ
          <input
            type="date"
            required
            min="2026-10-31"
            max="2026-11-09"
            value={date}
            disabled={!!editing || busy}
            onChange={(e) => setDate(e.target.value)}
            className="block w-full rounded border border-line bg-background p-2"
          />
        </label>
        <label>
          البداية — بغداد
          <input
            type="time"
            required
            value={start}
            disabled={!!editing || busy}
            onChange={(e) => setStart(e.target.value)}
            className="block w-full rounded border border-line bg-background p-2"
          />
        </label>
        <label>
          النهاية — بغداد
          <input
            type="time"
            required
            value={end}
            disabled={!!editing || busy}
            onChange={(e) => setEnd(e.target.value)}
            className="block w-full rounded border border-line bg-background p-2"
          />
        </label>
        <label>
          السعة — يحددها المدير
          <input
            type="number"
            min="1"
            max="100000"
            value={capacity}
            disabled={busy || blocked}
            onChange={(e) => setCapacity(e.target.value)}
            className="block w-full rounded border border-line bg-background p-2"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={closed}
            onChange={(e) => setClosed(e.target.checked)}
            disabled={busy || blocked}
          />
          مغلق للحجوزات الجديدة
        </label>
        <button
          disabled={busy || blocked || (!closed && !capacity)}
          className="min-h-11 rounded bg-foreground px-4 text-surface disabled:opacity-40"
        >
          {busy ? (
            <>
              <Spinner /> جارٍ الحفظ…
            </>
          ) : editing ? (
            "حفظ تعديل الموعد"
          ) : (
            "إضافة موعد"
          )}
        </button>
        {editing && (
          <button
            type="button"
            disabled={busy || blocked}
            onClick={() => {
              setEditing(null);
              setDate("");
              setStart("");
              setEnd("");
              setCapacity("");
              setClosed(true);
            }}
          >
            إلغاء التعديل
          </button>
        )}
      </form>
      <SaveFeedback pending={busy} />
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      <ul className="space-y-2 text-sm">
        {!slots.length && <li>لا توجد مواعيد. لن يفتح الحجز تلقائياً.</li>}
        {slots.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2"
          >
            <span>
              {s.visit_date} · {s.start_time.slice(0, 5)} –{" "}
              {s.end_time.slice(0, 5)} · السعة {s.capacity ?? "غير محددة"} ·
              محجوز {s.reserved_count} · متبقٍ{" "}
              {s.capacity === null ? "—" : s.capacity - s.reserved_count} ·{" "}
              {s.is_closed ? "مغلق" : "متاح"}
            </span>
            <button
              type="button"
              disabled={busy || blocked}
              onClick={() => {
                setEditing(s);
                setDate(s.visit_date);
                setStart(s.start_time.slice(0, 5));
                setEnd(s.end_time.slice(0, 5));
                setCapacity(s.capacity === null ? "" : String(s.capacity));
                setClosed(s.is_closed);
              }}
              className="min-h-11 rounded border border-line px-3"
            >
              تعديل السعة / الحالة
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
