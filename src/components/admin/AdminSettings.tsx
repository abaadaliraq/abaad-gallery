"use client";
import { branding } from "@/config/branding";
import { exhibition } from "@/config/exhibition";
import type { AdminExhibition } from "@/types/admin";
import { useAdminData } from "@/lib/admin/useAdminData";
import AdminStatus from "./AdminStatus";
export default function AdminSettings() {
  const { data, error, loading, updating, slow, limited, refresh } =
    useAdminData<{ exhibition: AdminExhibition }>("/api/admin/settings");
  return (
    <>
      <section className="max-w-3xl rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-medium">إعدادات المعرض الحالية</h2>
        <p className="mt-2 text-xs leading-6 text-muted">
          الاسم والجهة والموقع والهوية تُقرأ من ملفات Config الحالية، وهي
          للقراءة فقط.
        </p>
        <dl className="mt-5 divide-y divide-line text-sm">
          {[
            ["اسم المعرض", exhibition.name],
            ["الجهة المستضيفة", exhibition.venueName],
            [
              "الموقع",
              exhibition.location.city + " · " + exhibition.location.district,
            ],
            ["المنتج", branding.productName],
            [
              "المطور",
              branding.developerName + " — " + branding.developerNameAr,
            ],
            ["الخط العربي", "Alexandria"],
            ["الخط الإنكليزي", "Montserrat"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex flex-wrap justify-between gap-2 py-3"
            >
              <dt className="text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-5 text-sm font-medium">حالة المعرض في Supabase</h3>
        <AdminStatus
          error={error}
          loading={!data && loading}
          updating={updating}
          slow={slow}
          limited={limited}
          onRetry={() => void refresh()}
        />
        {data && (
          <p className="mt-2 text-sm">
            {data.exhibition.is_active ? "نشط" : "غير نشط"}
          </p>
        )}
        {data && data.exhibition.name !== exhibition.name && (
          <p role="alert" className="mt-3 text-xs leading-6 text-danger">
            اسم سجل المعرض في Supabase يختلف عن Config. لم نعدّل أي مصدر
            تلقائياً؛ يلزم توحيد المصدر إدارياً.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2" aria-label="ألوان الهوية">
          {Object.entries(exhibition.themeColors).map(([key, value]) => (
            <span
              key={key}
              className="flex items-center gap-2 rounded border border-line px-3 py-2 text-[11px] text-muted"
            >
              <span
                style={{ backgroundColor: value }}
                className="h-4 w-4 rounded-sm border border-line"
              />
              <span lang="en">{value}</span>
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
