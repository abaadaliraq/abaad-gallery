import type { AdminGuest } from "@/types/admin";
import GuestPhoto from "@/components/protocol/GuestPhoto";
import { priorityLabels } from "@/lib/protocol/priority";
import { arrivalTime } from "@/lib/protocol/search";
export default function GuestTable({
  guests,
  onDetails,
  onEdit,
  onReview,
  onArchive,
  archiveReady,
  disabled,
}: {
  guests: AdminGuest[];
  onDetails: (row: AdminGuest) => void;
  onEdit: (row: AdminGuest) => void;
  onReview: (row: AdminGuest) => void;
  disabled: boolean;
  onArchive: (row: AdminGuest) => void;
  archiveReady: boolean;
}) {
  return (
    <div
      role="region"
      aria-label="جدول إدارة الضيوف"
      tabIndex={0}
      className="overflow-x-auto rounded border border-line bg-surface"
    >
      <table className="w-full min-w-[860px] border-collapse text-right text-sm">
        <thead className="border-b border-line bg-background/40 text-xs text-muted">
          <tr>
            {[
              "الصورة",
              "الاسم",
              "المنصب",
              "التصنيف",
              "الأولوية",
              "الوصول",
              "المراجعة",
              "الإجراءات",
            ].map((label) => (
              <th key={label} scope="col" className="px-3 py-3 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {guests.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="px-3 py-3">
                <GuestPhoto
                  key={row.photo_public_id}
                  guest={row}
                  mode="admin"
                  compact
                />
              </td>
              <th
                scope="row"
                className="max-w-48 px-3 py-3 font-medium leading-7"
              >
                {row.full_name_ar}
                {row.is_archived && (
                  <span className="mt-1 block text-xs font-normal text-muted">
                    مستبعد ·{" "}
                    {row.archived_at
                      ? new Date(row.archived_at).toLocaleDateString("ar-IQ", {
                          timeZone: "Asia/Baghdad",
                        })
                      : "—"}{" "}
                    · {row.archived_by_name || "اسم الموظف غير متاح"}
                    {row.archive_reason && (
                      <span className="block">{row.archive_reason}</span>
                    )}
                  </span>
                )}
                {row.organization && (
                  <span className="block text-[11px] font-normal leading-5 text-muted">
                    {row.organization}
                  </span>
                )}
              </th>
              <td className="max-w-48 px-3 py-3 text-xs leading-6">
                {row.official_title || "غير محدد"}
              </td>
              <td className="px-3 py-3 text-xs leading-6 text-muted">
                {row.category_label || "دون تصنيف"}
              </td>
              <td className="px-3 py-3 font-latin text-xs text-accent">
                {priorityLabels[row.priority_level]}
              </td>
              <td className="px-3 py-3 text-xs leading-6">
                {row.checked_in_at ? (
                  <>
                    <span>حضر ✓</span>
                    <time
                      dateTime={row.checked_in_at}
                      className="block text-muted"
                    >
                      {arrivalTime(row.checked_in_at)}
                    </time>
                  </>
                ) : (
                  "لم يصل"
                )}
              </td>
              <td className="px-3 py-3 text-[11px] text-muted">
                {row.review_required ? (
                  <span className="rounded border border-line px-2 py-1">
                    تحتاج مراجعة
                  </span>
                ) : (
                  "لا تحتاج مراجعة"
                )}
              </td>
              <td className="px-2 py-2">
                <div className="flex max-w-40 flex-wrap gap-1">
                  {[
                    ["تفاصيل", onDetails],
                    ["تعديل", onEdit],
                    ["مراجعة", onReview],
                  ]
                    .filter(([label]) => !row.is_archived || label === "تفاصيل")
                    .filter(
                      ([label]) => label !== "مراجعة" || row.review_required,
                    )
                    .map(([label, action]) => (
                      <button
                        key={String(label)}
                        type="button"
                        disabled={disabled}
                        onClick={() => (action as (r: AdminGuest) => void)(row)}
                        aria-label={String(label) + " " + row.full_name_ar}
                        className="min-h-10 rounded border border-line px-2 text-xs hover:border-accent disabled:opacity-50"
                      >
                        {String(label)}
                      </button>
                    ))}
                  <button
                    type="button"
                    disabled={disabled || !archiveReady}
                    onClick={() => onArchive(row)}
                    className="min-h-10 rounded border border-line px-2 text-[11px] text-muted disabled:opacity-40"
                  >
                    {row.is_archived ? "استعادة الضيف" : "حذف الضيف"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
