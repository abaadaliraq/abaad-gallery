"use client";
import { useEffect, useRef, useState } from "react";
export default function QrReader({
  onRead,
  onClose,
}: {
  onRead: (raw: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let decoded = false;
    let scanner: import("qr-scanner").default | undefined;
    void import("qr-scanner")
      .then(({ default: QrScanner }) => {
        if (stopped || !video.current) return;
        scanner = new QrScanner(
          video.current,
          (result) => {
            if (stopped || decoded) return;
            decoded = true;
            scanner?.stop();
            onRead(result.data);
          },
          {
            returnDetailedScanResult: true,
            preferredCamera: "environment",
            highlightScanRegion: true,
          },
        );
        void scanner
          .start()
          .catch(() =>
            setError(
              "تعذر فتح الكاميرا. اسمح بالكاميرا عبر HTTPS أو ابحث برقم الحجز.",
            ),
          );
      })
      .catch(() => setError("تعذر تشغيل القارئ؛ استخدم البحث اليدوي."));
    return () => {
      stopped = true;
      scanner?.destroy();
    };
  }, [onRead]);
  return (
    <div className="mb-4 rounded border border-line bg-surface p-4">
      <div className="flex justify-between">
        <p>مسح رمز الحجز — يفتح السجل فقط</p>
        <button type="button" onClick={onClose} className="min-h-11 px-3">
          إغلاق الكاميرا
        </button>
      </div>
      <video
        ref={video}
        className="mx-auto max-h-64 w-full max-w-sm"
        muted
        playsInline
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
