"use client";
import { useRef, useState } from "react";
import GuestBadges from "./GuestBadges";
import { officialTitle } from "@/lib/protocol/priority";
import type { Guest, ProtocolMode } from "@/types/protocol";
import { undoArrival } from "@/lib/protocol/actions";
import ProtocolDialog from "./ProtocolDialog";
import GuestPhoto from "./GuestPhoto";
import GuestCheckIn from "./GuestCheckIn";
export default function GuestDetails({
  guest,
  mode,
  onClose,
  onSaved,
  onEdit,
  disabled,
}: {
  guest: Guest;
  mode: ProtocolMode;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onEdit: () => void;
  disabled: boolean;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  async function undo() {
    if (busy.current || !confirmed) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await undoArrival(guest.id, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onSaved();
      onClose();
    } catch {
      setError("تعذر تصحيح الحضور. لم يتم تأكيد الحفظ؛ أعد المحاولة.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <ProtocolDialog title="تفاصيل الضيف" onClose={onClose}>
      <div className="flex flex-col items-start gap-4 sm:flex-row">
        <GuestPhoto guest={guest} mode={mode} large />
        <div>
          <h3 className="text-xl font-medium leading-8">
            {guest.full_name_ar}
          </h3>
          {guest.full_name_en && (
            <p
              lang="en"
              dir="ltr"
              className="mt-1 text-right text-sm text-muted"
            >
              {guest.full_name_en}
            </p>
          )}
          <p className="mt-2 text-base leading-7">{officialTitle(guest,mode)}</p>
          <GuestBadges guest={guest}/>
          {guest.organization && (
            <p className="mt-1 text-sm text-muted">{guest.organization}</p>
          )}
        </div>
      </div>
      {guest.review_required && <p className="mt-4 rounded border border-line p-3 text-sm leading-7">المعلومات المقدمة تحتاج تأكيد الإدارة. {guest.review_note}</p>}
      <dl className="my-5 space-y-3 border-y border-line py-5 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <dt className="text-muted">الحضور</dt>
          <dd>
            {guest.checked_in_at
              ? "حضر ✓ · " +
                new Intl.DateTimeFormat("ar-IQ", {
                  timeZone: "Asia/Baghdad",
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(guest.checked_in_at))
              : "لم يصل"}
          </dd>
        </div>
        {guest.category_label && (
          <div className="flex gap-4">
            <dt className="text-muted">التصنيف</dt>
            <dd>{guest.category_label}</dd>
          </div>
        )}
        {guest.seating_location && (
          <div>
            <dt className="mb-1 text-muted">مكان الجلوس</dt>
            <dd>{guest.seating_location}</dd>
          </div>
        )}
        {guest.internal_notes && (
          <div>
            <dt className="mb-1 text-muted">ملاحظات داخلية</dt>
            <dd className="whitespace-pre-wrap leading-7">
              {guest.internal_notes}
            </dd>
          </div>
        )}
      </dl>
      {mode === "protocol" ? (
        <GuestCheckIn guest={guest} disabled={disabled} onSaved={onSaved} />
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled || pending}
            className="min-h-11 rounded border border-line px-5 text-sm hover:border-accent"
          >
            تعديل بيانات الضيف
          </button>
          {guest.checked_in_at && (
            <button
              type="button"
              onClick={() => setCorrecting(!correcting)}
              disabled={disabled || pending}
              className="mr-3 min-h-11 px-2 text-sm text-danger underline underline-offset-4"
            >
              تصحيح تسجيل الوصول
            </button>
          )}
          {correcting && (
            <div className="rounded border border-line p-4">
              <label className="block text-sm">
                سبب التصحيح
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={5}
                  maxLength={500}
                  className="mt-2 min-h-24 w-full rounded border border-line bg-background/30 p-3"
                />
              </label>
              <label className="mt-3 flex items-start gap-2 text-sm leading-7">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-2 h-4 w-4"
                />
                أؤكد أن تسجيل الوصول تم بالخطأ، وسيُحفظ سبب التصحيح في سجل
                التدقيق.
              </label>
              <button
                type="button"
                onClick={undo}
                disabled={!confirmed || reason.trim().length < 5 || pending}
                className="mt-3 min-h-11 rounded bg-foreground px-4 text-sm text-surface disabled:opacity-50"
              >
                {pending
                  ? "جارٍ حفظ التصحيح…"
                  : "تأكيد إعادة الحالة إلى لم يصل"}
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm leading-7 text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </ProtocolDialog>
  );
}
