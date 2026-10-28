"use client";
import { useEffect, useRef, useState } from "react";
export default function QrReader({ onRead, onClose }: { onRead: (raw: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  useEffect(() => {
    let stopped = false, decoded = false;
    let scanner: import("qr-scanner").default | undefined;
    void import("qr-scanner").then(async ({ default: QrScanner }) => {
      if (stopped || !video.current) return;
      scanner = new QrScanner(video.current, result => {
        if (stopped || decoded) return;
        decoded = true;
        scanner?.stop();
        onRead(result.data);
      }, { returnDetailedScanResult: true, preferredCamera: "environment", maxScansPerSecond: 6 });
      await scanner.start();
      if (!stopped) setStarting(false);
    }).catch(() => {
      if (!stopped) { setStarting(false); setError("تعذر فتح الكاميرا. اسمح باستخدام الكاميرا من إعدادات المتصفح ثم أعد المحاولة."); }
    });
    return () => { stopped = true; scanner?.destroy(); };
  }, [onRead]);
  return <div className="absolute inset-0 bg-black text-white">
    <video ref={video} autoPlay muted playsInline disablePictureInPicture aria-label="كاميرا مسح رمز الحجز" className="absolute inset-0 h-full w-full object-cover" />
    <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <p className="text-sm">مسح رمز الحجز</p>
      <button type="button" autoFocus onClick={onClose} aria-label="إغلاق الكاميرا" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-2xl">×</button>
    </div>
    {!error && <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="h-[min(65vw,280px)] w-[min(65vw,280px)] rounded-2xl border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.25)]" />
    </div>}
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-12 text-center text-sm leading-7">
      {error ? <p role="alert">{error}</p> : <p role="status">{starting ? "جارٍ فتح الكاميرا…" : "وجّه الكاميرا نحو رمز الحجز"}</p>}
    </div>
  </div>;
}
