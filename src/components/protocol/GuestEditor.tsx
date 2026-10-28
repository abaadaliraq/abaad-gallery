"use client";
import {
  SaveFeedback,
  Spinner,
  notifySaved,
} from "@/components/live/LiveStatus";
import { useLiveSafety } from "@/lib/live/useLiveSafety";
import { useRef, useState, type FormEvent } from "react";
import { saveGuest } from "@/lib/protocol/actions";
import { validateGuest } from "@/lib/protocol/validation";
import type { Guest, GuestCategory } from "@/types/protocol";
import {
  priorities,
  priorityLabels,
  photoGravities,
} from "@/lib/protocol/priority";
import ProtocolDialog from "./ProtocolDialog";
export default function GuestEditor({
  guest,
  categories,
  cloudName,
  exhibitionSlug,
  exhibitionLabel,
  onClose,
  onSaved,
}: {
  guest: Guest | null;
  categories: GuestCategory[];
  cloudName: string;
  exhibitionSlug?: string;
  exhibitionLabel?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const blocked = useLiveSafety("protocol");
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || blocked) return;
    const form = new FormData(event.currentTarget);
    const data = {
      ...Object.fromEntries(form),
      review_required:
        guest?.review_required || form.get("review_required") === "on",
    };
    const checked = validateGuest(data, null, cloudName);
    if (!checked.value) {
      setError(checked.errors.join(" "));
      return;
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await saveGuest(
        guest?.id || null,
        checked.value,
        exhibitionSlug,
      );
      if (!result.ok) {
        setError(result.error || "تعذر الحفظ.");
        return;
      }
      notifySaved("تم حفظ بيانات الضيف.");
      await onSaved();
      onClose();
    } catch {
      setError("تعذر الحفظ. يرجى إعادة المحاولة.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const style =
    "mt-1 block min-h-11 w-full rounded border border-line bg-background/30 px-3 text-base";
  const fields = [
    { name: "full_name_ar", label: "الاسم العربي", max: 160, required: true },
    { name: "full_name_en", label: "الاسم الإنكليزي", max: 160 },
    { name: "official_title", label: "المنصب أو الصفة الرسمية", max: 240 },
    { name: "organization", label: "الجهة أو المؤسسة", max: 240 },
    {
      name: "photo_public_id",
      label: "Cloudinary Public ID أو رابط معتمد",
      max: 1000,
    },
    { name: "photo_url", label: "رابط الصورة المعتمد", max: 1000 },
    { name: "seating_location", label: "مكان الجلوس", max: 160 },
  ] as const;
  return (
    <ProtocolDialog
      title={guest ? "تعديل بيانات الضيف" : "إضافة ضيف"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        {exhibitionLabel && (
          <p className="text-sm text-muted">المعرض: {exhibitionLabel}</p>
        )}
        <fieldset
          disabled={blocked || pending || blocked}
          className="space-y-4"
        >
          {fields.map((field) => (
            <label key={field.name} className="block text-sm">
              {field.label}
              <input
                name={field.name}
                defaultValue={guest?.[field.name] || ""}
                required={"required" in field}
                maxLength={field.max}
                className={style}
                dir={
                  field.name === "full_name_en" ||
                  field.name === "photo_public_id"
                    ? "ltr"
                    : "rtl"
                }
              />
            </label>
          ))}
          <label className="block text-sm">
            الأولوية
            <select
              name="priority_level"
              defaultValue={guest?.priority_level || "regular"}
              className={style}
            >
              {priorities.map((value) => (
                <option key={value} value={value}>
                  {priorityLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            موضع قص الصورة
            <select
              name="photo_gravity"
              defaultValue={guest?.photo_gravity || "face"}
              className={style}
            >
              {photoGravities.map((value) => (
                <option key={value} value={value}>
                  {
                    {
                      face: "الوجه",
                      auto: "تلقائي",
                      north: "أعلى الصورة",
                      center: "منتصف الصورة",
                    }[value]
                  }
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="review_required"
              disabled={guest?.review_required === true}
              defaultChecked={guest?.review_required || false}
            />{" "}
            البيانات تحتاج مراجعة إدارية
          </label>
          {guest?.review_required && (
            <p className="text-xs text-muted">
              رفع علامة المراجعة يتم من إجراء «اعتماد البيانات» بعد التأكيد.
            </p>
          )}
          <label className="block text-sm">
            ملاحظات المراجعة
            <textarea
              name="review_note"
              defaultValue={guest?.review_note || ""}
              maxLength={2000}
              className={style + " min-h-24 py-2"}
            />
          </label>
          {["source_key", "source_record_key", "source_description"].map(
            (key) => (
              <input
                key={key}
                type="hidden"
                name={key}
                value={guest?.[key as "source_key"] || ""}
              />
            ),
          )}
          <label className="block text-sm">
            التصنيف
            <select
              name="category_id"
              defaultValue={guest?.category_id || ""}
              className={style}
            >
              <option value="">دون تصنيف</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            ملاحظات داخلية
            <textarea
              name="internal_notes"
              defaultValue={guest?.internal_notes || ""}
              maxLength={2000}
              className={style + " min-h-24 py-2"}
            />
          </label>
          <input
            name="display_order"
            type="hidden"
            value={guest?.display_order || 0}
          />
        </fieldset>
        {error && (
          <p role="alert" className="text-sm leading-7 text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={blocked || pending || blocked}
          className="min-h-12 w-full rounded bg-foreground px-4 text-sm text-surface disabled:opacity-50"
        >
          {pending ? (
            <>
              <Spinner /> جارٍ الحفظ…
            </>
          ) : (
            "حفظ بيانات الضيف"
          )}
        </button>
        <SaveFeedback pending={pending} />
      </form>
    </ProtocolDialog>
  );
}
