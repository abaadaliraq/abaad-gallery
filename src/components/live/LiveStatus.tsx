"use client";
import { useEffect, useState } from "react";
import LoadingIndicator from "@/components/ui/LoadingIndicator";
export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}
export default function LiveStatus({
  loading = false,
  updating = false,
  error = "",
  slow = false,
  limited = false,
  onRetry,
}: {
  loading?: boolean;
  updating?: boolean;
  error?: string;
  slow?: boolean;
  limited?: boolean;
  onRetry?: () => void;
}) {
  if (loading) return <LoadingIndicator />;
  return (
    <div aria-live="polite" className="my-2 text-xs leading-7 text-muted">
      {error ? (
        <div
          role="alert"
          className="rounded border border-line bg-surface px-4 py-2"
        >
          <p>{error} المحتوى المعروض للقراءة فقط إلى حين التحقق.</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-10 underline"
            >
              إعادة المحاولة
            </button>
          )}
        </div>
      ) : updating ? (
        <div>
          <LoadingIndicator compact />
          {slow && <p className="text-center">ما زلنا نحاول إكمال العملية…</p>}
        </div>
      ) : null}
      {limited && !error && (
        <p>
          التحديث المباشر غير متاح حالياً؛ نعيد التحقق دورياً ويمكنك التحديث
          يدوياً.
        </p>
      )}
    </div>
  );
}
export function SaveFeedback({ pending }: { pending: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), 3500);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [pending]);
  return pending ? (
    <p
      role="status"
      className="mt-2 flex items-center gap-2 text-xs leading-6 text-muted"
    >
      <Spinner />
      {slow ? "ما زلنا نحاول إكمال العملية…" : "جارٍ تأكيد الحفظ…"}
    </p>
  ) : null;
}
export function notifySaved(message: string) {
  window.dispatchEvent(new CustomEvent("abaad:saved", { detail: message }));
}
export function SaveNotice() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const saved = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(""), 6000);
    };
    window.addEventListener("abaad:saved", saved);
    return () => {
      window.removeEventListener("abaad:saved", saved);
      clearTimeout(timer);
    };
  }, []);
  return message ? (
    <p
      role="status"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded border border-accent bg-surface p-3 text-center text-sm shadow-sm"
    >
      {message}
    </p>
  ) : null;
}
