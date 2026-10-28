"use client";
import {
  SaveFeedback,
  Spinner,
  notifySaved,
} from "@/components/live/LiveStatus";
import { useLiveSafety } from "@/lib/live/useLiveSafety";
import { useRef, useState } from "react";
import { recordArrival } from "@/lib/protocol/actions";
import { arrivalTime } from "@/lib/protocol/search";
import type { Guest } from "@/types/protocol";
export default function GuestCheckIn({
  guest,
  disabled = false,
  onSaved,
}: {
  guest: Guest;
  disabled?: boolean;
  onSaved: () => Promise<void>;
}) {
  const blocked = useLiveSafety("protocol");
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  if (guest.checked_in_at)
    return (
      <p className="text-sm font-medium text-foreground">
        حضر ✓{" "}
        <time
          dateTime={guest.checked_in_at}
          className="mr-2 text-xs font-normal tabular-nums text-muted"
        >
          {arrivalTime(guest.checked_in_at)}
        </time>
      </p>
    );
  async function checkIn() {
    if (busy.current || disabled || blocked) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await recordArrival(guest.id);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(
        result.already
          ? "سبق تسجيل وصول الضيف؛ جارٍ تحديث الحالة."
          : "تم تسجيل الوصول؛ جارٍ تحديث البيانات.",
      );
      notifySaved("تم تسجيل الوصول.");
      await onSaved();
    } catch {
      setMessage("تعذر تسجيل الوصول. أعد تحديث البيانات ثم حاول مجدداً.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        disabled={disabled || pending || blocked}
        onClick={checkIn}
        className="min-h-11 w-full rounded bg-foreground px-4 text-sm text-surface hover:bg-foreground/85 disabled:cursor-wait disabled:opacity-50"
      >
        {pending ? (
          <>
            <Spinner /> جارٍ تسجيل الوصول…
          </>
        ) : (
          "تسجيل الوصول"
        )}
      </button>
      <SaveFeedback pending={pending} />
      {message && (
        <p role="status" className="mt-2 text-xs leading-6 text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
