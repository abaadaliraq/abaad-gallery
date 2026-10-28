"use client";
import { useEffect, useRef, useState } from "react";
import type { ExhibitionBooking } from "@/types/bookings";
import type { ScanResult } from "@/lib/bookings/scan";
import LoadingIndicator from "@/components/ui/LoadingIndicator";
import QrReader from "./QrReader";
export function scanResultTitle(result: ScanResult) {
  if (result.kind === "success") return "تم التحقق بنجاح";
  if (result.kind === "connection") return "تعذر الاتصال";
  if (!result.reason || result.reason === "format" || result.reason === "unknown") return "الباركود غير مطابق";
  return "لا يمكن قبول الحجز";
}
export default function ScanScreen({ camera, result, onRead, onClose, onRetry, onMatched }: {
  camera: boolean; result: ScanResult | "pending" | null;
  onRead: (raw: string) => void; onClose: () => void; onRetry: () => void;
  onMatched: (booking: ExhibitionBooking) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  const [settled, setSettled] = useState<ScanResult | null>(null);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    if (!result || result === "pending") return;
    const timer = setTimeout(() => {
      if (result.kind === "success") onMatched(result.booking);
      else setSettled(result);
    }, 650);
    return () => clearTimeout(timer);
  }, [result, onMatched]);
  const feedback = result && result !== "pending" ? result : null;
  const details = feedback && settled === feedback;
  return <dialog ref={dialog} aria-label="مسح الحجز ونتيجة التحقق" onCancel={event => { event.preventDefault(); close.current(); }} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-background p-0 text-foreground backdrop:bg-black">
    {camera ? <QrReader onRead={onRead} onClose={onClose} /> : <div className="flex h-full flex-col items-center justify-center px-6 pb-[env(safe-area-inset-bottom)] text-center">
      {result === "pending" ? <><LoadingIndicator /><p className="text-sm text-muted">جارٍ التحقق من الحجز…</p></> : feedback && <>
        <span aria-hidden="true" className={"mb-6 flex h-24 w-24 items-center justify-center rounded-full border text-6xl " + (feedback.kind === "success" ? "border-green-600/25 bg-green-600/10 text-green-600" : feedback.kind === "connection" ? "border-line text-muted" : "border-red-600/25 bg-red-600/10 text-red-600")}>
          {feedback.kind === "success" ? "✓" : feedback.kind === "connection" ? "!" : "×"}
        </span>
        <h2 role={feedback.kind === "success" ? "status" : "alert"} className="text-xl font-normal">{scanResultTitle(feedback)}</h2>
        {details && feedback.kind !== "success" && <>
          {feedback.reason !== "format" && feedback.reason !== "unknown" && <p className="mt-3 max-w-sm text-sm leading-7 text-muted">{feedback.message}</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" autoFocus onClick={onRetry} className="min-h-11 rounded border border-line bg-surface px-5 text-sm">مسح جديد</button>
            <button type="button" onClick={onClose} className="min-h-11 px-5 text-sm text-muted">العودة للتشريفات</button>
          </div>
        </>}
      </>}
      {result === "pending" && <button type="button" onClick={onClose} className="mt-5 min-h-11 px-4 text-sm text-muted">إلغاء</button>}
    </div>}
  </dialog>;
}
