"use client";
import { useMemo, useRef, useState } from "react";
import { previewCsv, csvHeader } from "@/lib/protocol/csv";
import { importGuests, planGuestImport } from "@/lib/protocol/actions";
import type { GuestCategory, ImportReport, GuestImportPlan } from "@/types/protocol";
import ProtocolDialog from "./ProtocolDialog";
export default function GuestImport({
  categories,
  cloudName,
  sourceKey,
  onClose,
  onSaved,
}: {
  categories: GuestCategory[];
  cloudName: string;
  sourceKey: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<ImportReport>();
  const busy = useRef(false);
  const [plan,setPlan]=useState<GuestImportPlan>();
  const preview = useMemo(
    () =>
      text
        ? previewCsv(
            text,
            categories.map((c) => c.label),
            cloudName,
            sourceKey,
          )
        : null,
    [text, categories, cloudName, sourceKey],
  );
  async function execute() {
    if (busy.current || !preview || preview.errors.length) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      if(!plan){
        const result=await planGuestImport(text);
        if(!result.ok||!result.plan){setError(result.error||"تعذر الفحص.");return;}
        setPlan(result.plan);return;
      }
      if(plan.conflict_count) return;
      const result = await importGuests(text);
      if (!result.ok) {
        setError(result.error || "تعذر الاستيراد.");
        return;
      }
      setReport(result.report);
      await onSaved();
    } catch {
      setError(
        "تعذر تأكيد الاستيراد. أعد تحميل القائمة قبل إعادة المحاولة؛ يمنع النظام إضافة الصف نفسه مرتين.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <ProtocolDialog title="استيراد قائمة الضيوف" onClose={onClose}>
      <p className="mb-4 text-sm leading-7 text-muted">
        CSV بترميز UTF-8، حتى 200 ضيف و256 كيلوبايت في الدفعة. التصنيفات
        المقبولة: {categories.map((c) => c.label).join("، ")}.
      </p>
      <details className="mb-4 rounded border border-line p-3 text-xs">
        <summary className="cursor-pointer py-1">
          عناوين الأعمدة المطلوبة
        </summary>
        <code dir="ltr" className="mt-3 block break-all font-latin leading-6">
          {csvHeader}
        </code>
        <p className="mt-2 leading-6">
          الاسم العربي مطلوب. الحقول الأخرى اختيارية. ضع النصوص المحتوية على
          فاصلة بين علامتي اقتباس.
        </p>
      </details>
      <label className="block text-sm">
        اختر الملف
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          className="mt-2 block min-h-12 w-full rounded border border-line p-2 text-sm"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            setError("");
            setText("");
            setReport(undefined);
            setPlan(undefined);
            if (!file) return;
            if (file.size > 262144) {
              setError("حجم الملف أكبر من 256 كيلوبايت.");
              return;
            }
            try {
              setText(await file.text());
            } catch {
              setError("تعذر قراءة الملف.");
            }
          }}
        />
      </label>
      {preview && (
        <section className="mt-5">
          <h3 className="text-sm font-medium">
            معاينة قبل الحفظ · {preview.values.length} سجل صالح
          </h3>
          {preview.errors.length > 0 && (
            <div
              role="alert"
              className="mt-3 border-r-2 border-danger pr-3 text-xs leading-6 text-danger"
            >
              {preview.errors.slice(0, 20).map((item, index) => (
                <p key={index}>
                  السطر {item.row}: {item.message}
                </p>
              ))}
              <p>لن يتم الاستيراد قبل تصحيح جميع الأخطاء.</p>
            </div>
          )}
          <ol className="mt-3 divide-y divide-line">
            {preview.values.slice(0, 10).map((item, index) => (
              <li key={index} className="py-2 text-sm">
                <span className="font-medium">{item.full_name_ar}</span>
                <span className="mt-1 block text-xs leading-6 text-muted">
                  {item.official_title}{" "}
                  {item.organization ? "· " + item.organization : ""}
                </span>
              </li>
            ))}
          </ol>
          {preview.values.length > 10 && (
            <p className="text-xs text-muted">
              تُعرض أول عشرة سجلات فقط في المعاينة.
            </p>
          )}
          {plan && <div role="status" className="mt-4 rounded border border-line p-3 text-sm leading-7"><p>فحص قاعدة البيانات دون كتابة: جديد {plan.new_count} · موجود {plan.existing_count} · تحديث {plan.update_count} · دون تغيير {plan.unchanged_count} · تعارض {plan.conflict_count}</p>{plan.rows.filter(row=>row.action==="conflict").map(row=><p key={row.row}>السطر {row.row+1}: {row.message}</p>)}</div>}
          <button
            type="button"
            onClick={execute}
            disabled={
              pending ||
              !!report ||
              !!plan?.conflict_count ||
              preview.errors.length > 0 ||
              preview.values.length === 0
            }
            className="mt-4 min-h-12 w-full rounded bg-foreground px-4 text-sm text-surface disabled:opacity-50"
          >
            {pending
              ? "جارٍ معالجة الملف…"
              : report
                ? "انتهت معالجة الملف"
                : plan ? "تأكيد الحفظ بعد الفحص" : "فحص قاعدة البيانات دون كتابة (Dry Run)"}
          </button>
        </section>
      )}
      {report && (
        <section
          role="status"
          className="mt-4 rounded border border-line p-4 text-sm leading-7"
        >
          <p>تمت الإضافة: {report.succeeded}</p>
          <p>تم التحديث: {report.updated||0}</p>
          <p>دون تغيير: {report.duplicated}</p>
          <p>تعذر حفظه: {report.failed}</p>
          {report.errors.slice(0, 20).map((item, index) => (
            <p key={index} className="mt-1 text-xs text-muted">
              السجل {item.row}: {item.message}
            </p>
          ))}
        </section>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm leading-7 text-danger">
          {error}
        </p>
      )}
    </ProtocolDialog>
  );
}
