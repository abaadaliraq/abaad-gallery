"use client";
import { useRef, useState } from "react";
import type { AdminGuest } from "@/types/admin";
import { archiveInvitation } from "@/lib/admin/archive-actions";
import ProtocolDialog from "@/components/protocol/ProtocolDialog";
import {
  SaveFeedback,
  Spinner,
  notifySaved,
} from "@/components/live/LiveStatus";
export default function GuestArchive({
  guest,
  disabled,
  onClose,
  onSaved,
}: {
  guest: AdminGuest;
  disabled: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const restore = guest.is_archived === true;
  const [reason, setReason] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState("");
  const busy = useRef(false),
    request = useRef<Parameters<typeof archiveInvitation>[0] | null>(null);
  async function save() {
    if (busy.current || disabled || !confirmed || !guest.invitation_updated_at)
      return;
    busy.current = true;
    setPending(true);
    setError("");
    if (!request.current)
      request.current = {
        id: guest.id,
        archived: !restore,
        reason,
        reviewed,
        expected: guest.invitation_updated_at,
        operation: crypto.randomUUID(),
      };
    try {
      const result = await archiveInvitation(request.current);
      if (!result.ok) {
        setError(result.error || "تعذر تأكيد الإجراء.");
        if (result.retryable) setUncertain(true);
        else {
          request.current = null;
          setUncertain(false);
        }
        return;
      }
      notifySaved(
        restore
          ? "تمت استعادة الضيف إلى القائمة النشطة."
          : "تمت إزالة الضيف من القوائم النشطة مع حفظ سجله.",
      );
      await onSaved();
      onClose();
    } catch {
      setUncertain(true);
      setError("تعذر التحقق من الحفظ؛ أعد المحاولة بنفس العملية.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <ProtocolDialog
      title={restore ? "استعادة الضيف" : "إزالة الضيف من القائمة"}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <p className="text-lg font-medium">{guest.full_name_ar}</p>
      <p className="my-4 text-sm leading-8">
        {restore
          ? "هل تريد استعادة هذا الضيف إلى قوائم التشريفات النشطة؟"
          : "هل تريد إزالة هذا الضيف من قوائم التشريفات؟ سيختفي من قوائم الضيوف النشطة ولن يظهر في البحث الاعتيادي."}
      </p>
      <p className="mb-4 text-xs leading-7 text-muted">
        تُحفظ هوية الضيف وأولويته وسجلات الوصول التاريخية. يمكن للإدارة استعادته
        لاحقاً.
      </p>
      <fieldset
        disabled={pending || disabled || uncertain}
        className="space-y-3"
      >
        <label className="block text-sm">
          سبب {restore ? "الاستعادة" : "الاستبعاد"} — اختياري
          <select
            value={
              ["اعتذر عن الحضور", "أضيف بالخطأ"].includes(reason)
                ? reason
                : reason
                  ? "آخر"
                  : ""
            }
            onChange={(e) =>
              setReason(e.target.value === "آخر" ? "سبب آخر" : e.target.value)
            }
            className="mt-2 min-h-11 w-full rounded border border-line bg-background px-3"
          >
            <option value="">دون سبب إضافي</option>
            <option>اعتذر عن الحضور</option>
            <option>أضيف بالخطأ</option>
            <option value="آخر">سبب آخر</option>
          </select>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="mt-2 min-h-20 w-full rounded border border-line bg-background p-3"
          />
        </label>
        {!restore && guest.checked_in_at && (
          <label className="flex gap-2 text-sm leading-7">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            راجعت وصول هذا الضيف وأؤكد استبعاده من القائمة النشطة فقط، مع إبقاء
            الوصول محفوظاً. يلزم سبب واضح.
          </label>
        )}
      </fieldset>
      <label className="my-4 flex gap-2 text-sm leading-7">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={pending || disabled}
        />
        أؤكد مراجعة الضيف والإجراء المطلوب.
      </label>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="min-h-11 rounded border border-line px-4"
        >
          إلغاء
        </button>
        <button
          type="button"
          disabled={
            pending ||
            disabled ||
            !confirmed ||
            (!restore &&
              !!guest.checked_in_at &&
              (!reviewed || reason.trim().length < 5))
          }
          onClick={() => void save()}
          className="flex min-h-11 items-center gap-2 rounded bg-foreground px-4 text-sm text-surface disabled:opacity-50"
        >
          {pending && <Spinner />}
          {pending
            ? "جارٍ تأكيد الإجراء…"
            : uncertain
              ? "إعادة التحقق من الإجراء"
              : restore
                ? "تأكيد الاستعادة"
                : "تأكيد الإزالة"}
        </button>
      </div>
      <SaveFeedback pending={pending} />
    </ProtocolDialog>
  );
}
