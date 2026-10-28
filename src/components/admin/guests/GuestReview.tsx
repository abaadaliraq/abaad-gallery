"use client";
import {
  SaveFeedback,
  Spinner,
  notifySaved,
} from "@/components/live/LiveStatus";
import { useLiveSafety } from "@/lib/live/useLiveSafety";
import { useRef, useState } from "react";
import type { AdminGuest } from "@/types/admin";
import { approveGuest } from "@/lib/admin/actions";
import ProtocolDialog from "@/components/protocol/ProtocolDialog";
import GuestPhoto from "@/components/protocol/GuestPhoto";
import { priorityLabels } from "@/lib/protocol/priority";
export default function GuestReview({
  guest,
  ready,
  message,
  onClose,
  onEdit,
  onSaved,
}: {
  guest: AdminGuest;
  ready: boolean;
  message?: string;
  onClose: () => void;
  onEdit: () => void;
  onSaved: () => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const blocked = useLiveSafety("protocol");
  const busy = useRef(false);
  async function approve() {
    if (
      blocked ||
      busy.current ||
      !confirmed ||
      !ready ||
      !guest.guest_updated_at ||
      !guest.invitation_updated_at
    )
      return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await approveGuest(
        guest.id,
        guest.guest_updated_at,
        guest.invitation_updated_at,
      );
      if (!result.ok) {
        setError(result.error || "تعذر الاعتماد.");
        return;
      }
      notifySaved("تم اعتماد بيانات الضيف.");
      await onSaved();
      onClose();
    } catch {
      setError("لم يتم تأكيد الاعتماد. حدّث القائمة.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <ProtocolDialog
      title="مراجعة بيانات الضيف"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div className="flex items-start gap-4">
        <GuestPhoto guest={guest} mode="admin" />
        <div>
          <h3 className="text-lg font-medium">{guest.full_name_ar}</h3>
          {guest.full_name_en && (
            <p lang="en" className="text-xs text-muted">
              {guest.full_name_en}
            </p>
          )}
          <p className="mt-2 text-sm leading-7">
            المنصب المقدّم: {guest.official_title || "غير محدد"}
          </p>
          <p className="text-xs text-muted">{guest.organization}</p>
          <p className="mt-2 font-latin text-xs text-accent">
            {priorityLabels[guest.priority_level]}
          </p>
        </div>
      </div>
      <dl className="my-5 space-y-4 border-y border-line py-4 text-sm">
        <div>
          <dt className="text-xs text-muted">سبب المراجعة</dt>
          <dd className="mt-1 whitespace-pre-wrap leading-7">
            {guest.review_note || "لم تُضف ملاحظة للمراجعة."}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">مصدر البيانات</dt>
          <dd className="mt-1 break-words leading-7">
            {guest.source_description || guest.source_key || "المصدر غير مسجل"}
            {guest.source_record_key
              ? " · السجل " + guest.source_record_key
              : ""}
          </dd>
        </div>
        {guest.internal_notes && (
          <div>
            <dt className="text-xs text-muted">ملاحظات داخلية</dt>
            <dd className="mt-1 whitespace-pre-wrap leading-7">
              {guest.internal_notes}
            </dd>
          </div>
        )}
      </dl>
      <button
        type="button"
        onClick={onEdit}
        disabled={blocked || pending || blocked}
        className="min-h-11 rounded border border-line px-4 text-sm"
      >
        تعديل المعلومات أولاً
      </button>
      <label className="mt-4 flex items-start gap-2 text-sm leading-7">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={blocked || pending || !ready}
          className="mt-2 h-4 w-4"
        />
        راجعت المعلومات ومصدرها وأؤكد اعتمادها. ستبقى الأولوية وبيانات الوصول
        كما هي.
      </label>
      {!ready && (
        <p className="mt-3 text-xs leading-6 text-muted">
          {message || "اعتماد البيانات بانتظار الموافقة على admin.sql."}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={approve}
        disabled={
          blocked ||
          pending ||
          !confirmed ||
          !ready ||
          !guest.guest_updated_at ||
          !guest.invitation_updated_at
        }
        className="mt-4 min-h-12 w-full rounded bg-foreground px-4 text-sm text-surface disabled:opacity-50"
      >
        {pending ? (
          <>
            <Spinner /> جارٍ الاعتماد…
          </>
        ) : (
          "اعتماد البيانات"
        )}
      </button>
      <SaveFeedback pending={pending} />
    </ProtocolDialog>
  );
}
