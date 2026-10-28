"use client";
import LiveStatus from "@/components/live/LiveStatus";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useBookings } from "@/lib/bookings/useBookings";
import BookingDetails from "./BookingDetails";
import ScanScreen from "./ScanScreen";
import type { ExhibitionBooking } from "@/types/bookings";
import SlotManagement from "./SlotManagement";
import GuestList from "@/components/protocol/GuestList";
import GuestDetails from "@/components/protocol/GuestDetails";
import type { Guest } from "@/types/protocol";
import { useProtocolSounds } from "@/lib/audio/useProtocolSounds";
import { verifyBookingCode, ScanGate, currentScannedBooking, type ScanResult } from "@/lib/bookings/scan";
import SoundControl from "./SoundControl";
export type BookingToolbarActions = {
  unread: number;
  notificationsOpen: boolean;
  scannerOpen: boolean;
  onNotifications: () => void;
  onScan: () => void;
  closePanels: () => void;
};
function ToolbarSlot({ render, actions }: { render: (actions: BookingToolbarActions) => ReactNode; actions: BookingToolbarActions }) {
  return <>{render(actions)}</>;
}
export default function BookingDashboard({
  admin = false,
  collapsed = false,
  onExpand,
  renderToolbar,
  soundUserId,
}: {
  soundUserId?: string;
  admin?: boolean;
  collapsed?: boolean;
  onExpand?: () => void;
  renderToolbar?: (actions: BookingToolbarActions) => ReactNode;
}) {
  const h = useBookings(admin);
  const [selected, setSelected] = useState<string | null>(null),
    [camera, setCamera] = useState(false),
    [bell, setBell] = useState(false),
    [guest, setGuest] = useState<Guest | null>(null);
  const sounds = useProtocolSounds(soundUserId);
  const [scanResult, setScanResult] = useState<ScanResult | "pending" | null>(null);
  const [scanBooking, setScanBooking] = useState<ExhibitionBooking | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState("");
  const scanGate = useRef(new ScanGate());
  const scanRequest = useRef<AbortController | null>(null);
  const scanSequence = useRef(0);
  const latestNotice = h.notices.at(-1);
  const { play, unlock } = sounds;
  useEffect(() => {
    if (!soundUserId) return;
    for (const notice of h.notices) play("new_booking", "booking:" + notice.id);
  }, [h.notices, play, soundUserId]);
  useEffect(() => {
    if (!latestNotice) return;
    const timer = setTimeout(() => setDismissedNotice(latestNotice.id), 9000);
    return () => clearTimeout(timer);
  }, [latestNotice]);
  useEffect(() => () => scanRequest.current?.abort(), []);
  const openScan = useCallback(() => {
    unlock();
    scanGate.current.reset();
    setSelected(null); setGuest(null); setScanBooking(null);
    setScanResult(null); setBell(false); setCamera(true);
  }, [unlock]);
  const closeScan = useCallback(() => {
    scanRequest.current?.abort();
    setCamera(false); setScanResult(null);
  }, []);
  const matched = useCallback((booking: ExhibitionBooking) => {
    setScanResult(null); setScanBooking(booking);
  }, []);
  const booking = h.data?.bookings.find((b) => b.id === selected);
  const { setToken, setQ, setDate, setStatus, setPage } = h;
  const onRead = useCallback(async (raw: string) => {
    if (!scanGate.current.enter(raw)) return;
    setCamera(false);
    setScanResult("pending");
    const request = new AbortController();
    scanRequest.current = request;
    const eventId = "scan:" + ++scanSequence.current;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; request.abort(); }, 12000);
    try {
      const result = await verifyBookingCode(raw, admin ? "/api/admin/bookings" : "/api/protocol/bookings", request.signal);
      if (request.signal.aborted) return;
      setScanResult(result);
      play(result.kind === "success" ? "scan_success" : "scan_error", eventId);
      onExpand?.();
      if (result.kind === "success") {
        setToken(raw.slice("ABAAD-BOOKING:".length));
        setQ(""); setDate(""); setStatus("all"); setPage(1);
        setSelected(null);
      }
    } catch {
      if (timedOut) {
        setScanResult({ kind: "connection", message: "انتهت مهلة الاتصال للتحقق. أعد المحاولة؛ لم يُحكم على صلاحية الرمز." });
        play("scan_error", eventId);
      }
    } finally { clearTimeout(timeout); scanGate.current.leave(); }
  }, [admin, play, onExpand, setToken, setQ, setDate, setStatus, setPage]);
  function search(q: string) {
    const match = /^ABAAD-BOOKING:([a-f0-9]{64})$/.exec(q);
    if (match) void onRead(q);
    else {
      h.setQ(q);
      h.setToken("");
      h.setPage(1);
    }
    setSelected(null);
  }
  return (
    <section aria-label="حجوزات المعرض" className={renderToolbar ? "contents" : "space-y-4"}>
      {renderToolbar ? <ToolbarSlot render={renderToolbar} actions={{
        unread: h.unread, notificationsOpen: bell, scannerOpen: camera,
        onNotifications: () => { unlock(); setBell(!bell); setCamera(false); h.setUnread(0); },
        onScan: openScan,
        closePanels: () => { setBell(false); setCamera(false); },
      }} /> : (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div hidden={collapsed}>
          <h2 className="text-xl">حجوزات المعرض</h2>
          <p className="mt-1 text-sm text-muted">
            31 أكتوبر – 9 نوفمبر 2026 · الدخول مجاني بالحجز المسبق
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setBell(!bell);
              h.setUnread(0);
            }}
            className="min-h-11 rounded border border-line bg-surface px-4"
            aria-expanded={bell}
          >
            🔔 إشعارات {h.unread > 0 ? "(" + h.unread + ")" : ""}
          </button>
          <button
            type="button"
            onClick={openScan}
            className="min-h-11 rounded border border-line bg-surface px-4"
          >
            مسح QR
          </button>
        </div>
      </div>
      )}
      {soundUserId && <SoundControl status={sounds.status} enable={sounds.enable} mute={sounds.mute} testSound={sounds.testSound} />}
      {h.noticeError && <p role="status" className="mb-3 text-xs text-muted">{h.noticeError}</p>}
      {soundUserId && latestNotice && dismissedNotice !== latestNotice.id && <aside role="status" aria-live="polite" className="fixed bottom-4 right-3 left-3 z-30 mx-auto max-w-sm rounded border border-line bg-surface p-3 text-xs shadow-lg">
        <div className="flex items-center justify-between gap-2"><p>حجز جديد · {latestNotice.full_name}</p><button type="button" aria-label="إغلاق إشعار الحجز" onClick={() => setDismissedNotice(latestNotice.id)} className="min-h-11 min-w-11">×</button></div>
        <p>{latestNotice.visit_date} · {latestNotice.start_time.slice(0, 5)} · {latestNotice.guest_count} أشخاص{h.notices.length > 1 ? " · المزيد في الجرس" : ""}</p>
      </aside>}
      {bell && (
        <aside
          className="mb-3 max-h-[50dvh] overflow-y-auto rounded border border-line bg-surface p-4 text-sm"
          aria-label="آخر تحديثات الحجوزات"
        >
          <p className="mb-2 text-muted">الحجوزات الجديدة أثناء جلستك</p>
          {h.notices.length === 0 && <p>لا توجد حجوزات جديدة أثناء هذه الجلسة.</p>}
          {[...h.notices].reverse().map(r => <p key={r.id} className="border-t border-line py-2">حجز جديد · {r.full_name} · {r.visit_date} · {r.start_time.slice(0, 5)} · {r.guest_count} أشخاص</p>)}
          <p className="my-2 text-muted">آخر تحديثات الحجوزات</p>
          {h.data && h.data.recent.length === 0 && <p>لا توجد إشعارات حالياً.</p>}
          {h.data?.recent.map((r) => (
            <p key={r.booking_reference} className="border-t border-line py-2">
              {r.status === "cancelled" ? "حجز ملغى" : "حجز جديد / محدث"} ·{" "}
              {r.full_name} · {r.visit_date} · {r.start_time.slice(0, 5)} ·{" "}
              {r.guest_count} أشخاص ·{" "}
              <span dir="ltr">{r.booking_reference}</span>
            </p>
          ))}
        </aside>
      )}
      {(camera || scanResult) && <ScanScreen camera={camera} result={scanResult} onRead={onRead} onClose={closeScan} onRetry={openScan} onMatched={matched} />}
      {scanBooking && <BookingDetails fullScreen
        booking={currentScannedBooking(scanBooking, h.data?.bookings || [])}
        slots={h.data?.slots || []} admin={admin} disabled={!!h.error}
        send={h.send} onSaved={h.refresh} onClose={() => setScanBooking(null)} />}
      <div id={renderToolbar ? "bookings-panel" : undefined} hidden={collapsed} className="space-y-4">
        <div className="compact-stats grid grid-cols-3 gap-1.5 sm:gap-3 lg:grid-cols-5">
          {[
            ["إجمالي الحجوزات", "total"],
            ["المؤكدة", "confirmed"],
            ["الملغاة", "cancelled"],
            ["الزوار المتوقعون", "expected"],
            ["الذين وصلوا", "arrived"],
          ].map(([label, key]) => (
            <div
              key={key}
              className="rounded border border-line bg-surface px-2 py-2 sm:p-4"
            >
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 text-lg tabular-nums sm:mt-2 sm:text-2xl">
                {h.data ? h.data.stats[key as keyof typeof h.data.stats] : "—"}
              </p>
            </div>
          ))}
        </div>
        {admin && h.data && (
          <SlotManagement
            slots={h.data.slots}
            send={h.send}
            onSaved={h.refresh}
          />
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <label className="col-span-2">
            <span className="text-xs text-muted">
              البحث الموحد — ضيف افتتاح أو حجز معرض
            </span>
            <input
              type="search"
              value={h.q}
              maxLength={200}
              placeholder="الاسم أو الهاتف أو رقم الحجز أو رمز QR"
              onChange={(e) => search(e.target.value)}
              className="mt-1 min-h-12 w-full rounded border border-line bg-surface px-3"
            />
          </label>
          <label>
            <span className="text-xs text-muted">تاريخ الزيارة</span>
            <input
              type="date"
              min="2026-10-31"
              max="2026-11-09"
              value={h.date}
              onChange={(e) => {
                h.setDate(e.target.value);
                h.setPage(1);
                h.setToken("");
                setSelected(null);
              }}
              className="mt-1 min-h-12 w-full rounded border border-line bg-surface px-3"
            />
          </label>
          <label>
            <span className="text-xs text-muted">حالة الحجز</span>
            <select
              value={h.status}
              onChange={(e) => {
                h.setStatus(e.target.value);
                h.setPage(1);
                h.setToken("");
                setSelected(null);
              }}
              className="mt-1 min-h-12 w-full rounded border border-line bg-surface px-3"
            >
              <option value="all">الجميع</option>
              <option value="confirmed">مؤكد</option>
              <option value="cancelled">ملغى</option>
            </select>
          </label>
        </div>
        <div className="flex justify-between text-xs text-muted">
          <p aria-live="polite">
            {h.loading
              ? "جارٍ التحقق…"
              : h.data
                ? "نتائج الحجوزات: " + h.data.total_matches
                : "البيانات غير متاحة"}
            {h.token ? " · نتيجة رمز QR" : ""}
          </p>
          <button
            type="button"
            onClick={() => void h.refresh()}
            disabled={h.loading || !!h.error}
            className="min-h-10 underline"
          >
            تحديث
          </button>
        </div>
        <LiveStatus
          loading={h.loading}
          updating={h.updating}
          slow={h.slow}
          limited={h.limited}
          error={h.error}
          onRetry={() => void h.refresh()}
        />
        {h.error && !h.data ? (
          <p
            role="alert"
            className="rounded border border-line bg-surface p-5 text-error"
          >
            {h.error}
          </p>
        ) : (
          h.data && (
            <>
              {h.q && (
                <section className="space-y-3">
                  <h3 className="text-sm">
                    ضيوف الافتتاح — سجلات مستقلة (
                    {h.data.opening?.total_matches ?? "—"})
                  </h3>
                  {h.data.opening_error ? (
                    <p role="alert">{h.data.opening_error}</p>
                  ) : (
                    <GuestList
                      guests={h.data.opening?.guests || []}
                      mode={admin ? "admin" : "protocol"}
                      disabled={h.loading || !!h.error}
                      onOpen={setGuest}
                      onSaved={h.refresh}
                    />
                  )}
                </section>
              )}
              <div className="overflow-x-auto rounded border border-line bg-surface">
                <table className="w-full min-w-[880px] text-right text-sm">
                  <caption className="sr-only">حجوزات جمهور المعرض</caption>
                  <thead>
                    <tr className="border-b border-line text-xs text-muted">
                      {[
                        "رقم الحجز",
                        "الاسم",
                        "الهاتف",
                        "التاريخ والوقت",
                        "عدد الأشخاص",
                        "الحالة",
                        "وصل / متبقٍ",
                        "الإجراءات",
                      ].map((x) => (
                        <th key={x} scope="col" className="p-3 font-normal">
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {h.data.bookings.map((b) => (
                      <tr key={b.id} className="border-b border-line">
                        <td className="max-w-36 break-all p-3" dir="ltr">
                          {b.booking_reference}
                        </td>
                        <td className="p-3">
                          {b.full_name}
                          <small className="block text-muted">حجز معرض</small>
                        </td>
                        <td className="p-3" dir="ltr">
                          {b.phone}
                        </td>
                        <td className="p-3">
                          {b.visit_date}
                          <br />
                          {b.start_time.slice(0, 5)} – {b.end_time.slice(0, 5)}
                        </td>
                        <td className="p-3">{b.guest_count}</td>
                        <td className="p-3">
                          {b.status === "confirmed" ? "مؤكد" : "ملغى"}
                        </td>
                        <td className="p-3">
                          {b.checked_in_guest_count} /{" "}
                          {b.guest_count - b.checked_in_guest_count}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            disabled={h.loading || !!h.error}
                            onClick={() => setSelected(b.id)}
                            className="min-h-11 rounded border border-line px-3"
                          >
                            عرض / تسجيل الوصول
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!h.data.bookings.length && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted">
                          لا توجد حجوزات تطابق البحث. لا تظهر حجوزات الزيارات
                          الاعتيادية هنا.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {Math.max(
                h.data.total_matches,
                h.data.opening?.total_matches || 0,
              ) > 20 && (
                <nav
                  className="flex items-center justify-center gap-4"
                  aria-label="صفحات نتائج البحث"
                >
                  <button
                    type="button"
                    disabled={h.page <= 1 || h.loading}
                    onClick={() => {
                      h.setPage(h.page - 1);
                      setSelected(null);
                    }}
                    className="min-h-11 rounded border border-line px-4 disabled:opacity-40"
                  >
                    السابق
                  </button>
                  <span>{h.page}</span>
                  <button
                    type="button"
                    disabled={
                      h.loading ||
                      h.page * 20 >=
                        Math.max(
                          h.data.total_matches,
                          h.data.opening?.total_matches || 0,
                        )
                    }
                    onClick={() => {
                      h.setPage(h.page + 1);
                      setSelected(null);
                    }}
                    className="min-h-11 rounded border border-line px-4 disabled:opacity-40"
                  >
                    التالي
                  </button>
                </nav>
              )}
              <p className="text-xs text-muted">
                آخر تحقق:{" "}
                {new Date(h.data.observed_at).toLocaleTimeString("ar-IQ", {
                  timeZone: "Asia/Baghdad",
                })}
                . قراءة QR لا تسجّل الوصول تلقائياً.
              </p>
            </>
          )
        )}
        {booking && h.data && (
          <BookingDetails
            disabled={!!h.error}
            booking={booking}
            slots={h.data.slots}
            admin={admin}
            send={h.send}
            onClose={() => setSelected(null)}
            onSaved={h.refresh}
          />
        )}{" "}
        {guest && (
          <GuestDetails
            guest={guest}
            mode={admin ? "admin" : "protocol"}
            disabled={h.loading || !!h.error}
            onEdit={() => {}}
            onClose={() => setGuest(null)}
            onSaved={async () => {
              setGuest(null);
              await h.refresh();
            }}
          />
        )}
      </div>
    </section>
  );
}
