"use client";
import {
  SaveFeedback,
  Spinner,
  notifySaved,
} from "@/components/live/LiveStatus";
import { useLiveSafety } from "@/lib/live/useLiveSafety";
import { useRef, useState, type FormEvent } from "react";
import type { AdminExhibition, StaffMember } from "@/types/admin";
import type { Role } from "@/types/auth";
import { updateStaff } from "@/lib/admin/actions";
import { roleLabels } from "@/lib/admin/domain";
import SalesDialog from "@/components/sales/SalesDialog";
export default function StaffEditor({
  staff,
  currentUserId,
  exhibitions,
  lastAdmin,
  onClose,
  onSaved,
}: {
  staff: StaffMember;
  currentUserId: string;
  exhibitions: AdminExhibition[];
  lastAdmin: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(staff.full_name),
    [role, setRole] = useState<Role>(staff.role),
    [active, setActive] = useState(staff.is_active),
    [ids, setIds] = useState(staff.exhibitions.map((e) => e.id)),
    [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const blocked = useLiveSafety("staff");
  const busy = useRef(false);
  const own = staff.user_id === currentUserId,
    protectedAdmin =
      staff.role === "admin" && staff.is_active && (own || lastAdmin);
  const permissionsChanged =
    role !== staff.role ||
    active !== staff.is_active ||
    [...ids].sort().join(",") !==
      staff.exhibitions
        .map((e) => e.id)
        .sort()
        .join(",");
  const style =
    "mt-1 min-h-11 w-full rounded border border-line bg-background/30 px-3 text-base";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || busy.current || (permissionsChanged && !confirmed)) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await updateStaff({
        user_id: staff.user_id,
        full_name: name,
        role,
        is_active: active,
        exhibition_ids: role === "admin" ? [] : ids,
        expected_updated_at: staff.updated_at,
      });
      if (!result.ok) {
        setError(result.error || "تعذر الحفظ.");
        return;
      }
      notifySaved("تم حفظ بيانات الموظف.");
      await onSaved();
      onClose();
    } catch {
      setError("لم يتم تأكيد حفظ الموظف. حدّث القائمة.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <SalesDialog
      title="تعديل الموظف والصلاحيات"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form onSubmit={save}>
        <fieldset
          disabled={blocked || pending || blocked}
          className="space-y-4"
        >
          <label className="block text-sm">
            الاسم
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              className={style}
            />
          </label>
          <label className="block text-sm">
            البريد الإلكتروني
            <input
              value={staff.email || ""}
              readOnly
              dir="ltr"
              className={style + " text-muted"}
            />
          </label>
          <label className="block text-sm">
            الدور
            <select
              value={role}
              disabled={own || protectedAdmin}
              onChange={(e) => {
                setRole(e.target.value as Role);
                setConfirmed(false);
              }}
              className={style}
            >
              {(["admin", "protocol", "sales"] as const).map((value) => (
                <option key={value} value={value}>
                  {roleLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              disabled={own || protectedAdmin}
              onChange={(e) => {
                setActive(e.target.checked);
                setConfirmed(false);
              }}
            />
            الحساب نشط
          </label>
          {protectedAdmin && (
            <p className="text-xs leading-6 text-muted">
              {own
                ? "لا يمكنك تعطيل حسابك أو تغيير دورك بنفسك."
                : "لا يمكن تعطيل آخر مدير نشط أو تغيير دوره."}
            </p>
          )}
          <fieldset className="rounded border border-line p-3">
            <legend className="px-1 text-sm">ربط المعارض</legend>
            {role === "admin" ? (
              <p className="text-xs leading-6 text-muted">
                وصول الإدارة تحكمه سياسات النظام، دون الحاجة إلى ربط تشريفات أو
                مبيعات.
              </p>
            ) : (
              exhibitions.map((e) => (
                <label
                  key={e.id}
                  className="flex min-h-11 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={ids.includes(e.id)}
                    onChange={(event) => {
                      setIds((v) =>
                        event.target.checked
                          ? [...v, e.id]
                          : v.filter((id) => id !== e.id),
                      );
                      setConfirmed(false);
                    }}
                  />
                  {e.name}
                </label>
              ))
            )}
          </fieldset>
          {permissionsChanged && (
            <label className="flex items-start gap-2 text-sm leading-7">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-2 h-4 w-4"
              />
              أؤكد تغيير صلاحيات هذا الموظف وربطه بالمعارض المحددة.
            </label>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="mt-3 text-sm leading-7 text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={blocked || pending || (permissionsChanged && !confirmed)}
          className="mt-5 min-h-12 w-full rounded bg-foreground text-sm text-surface disabled:opacity-50"
        >
          {pending ? (
            <>
              <Spinner /> جارٍ الحفظ…
            </>
          ) : (
            "حفظ التغييرات"
          )}
        </button>
        <SaveFeedback pending={pending} />
      </form>
    </SalesDialog>
  );
}
