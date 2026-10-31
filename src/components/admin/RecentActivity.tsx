import Link from "next/link";
import type { ActivityResult } from "@/types/admin";
import { activityLabels, adminDate } from "@/lib/admin/domain";
export default function RecentActivity({
  result,
  full = false,
  filtered = false,
}: {
  result: ActivityResult;
  full?: boolean;
  filtered?: boolean;
}) {
  const rows = full ? result.events : result.events.slice(0, 6);
  return (
    <section className="rounded border border-line bg-surface p-4 sm:p-5">
      <div className="mb-4 flex justify-between gap-3">
        <h2 className="text-sm font-medium">
          {full ? "سجل العمليات" : "آخر العمليات"}
        </h2>
        {!full && (
          <Link
            href="/admin/activity"
            className="text-xs text-accent underline underline-offset-4"
          >
            عرض السجل ←
          </Link>
        )}
      </div>
      {result.errors.map((error) => (
        <p role="alert" key={error} className="mb-3 text-xs text-danger">
          {error}
        </p>
      ))}
      {!rows.length ? (
        <p className="py-6 text-center text-sm text-muted">
          {result.errors.length
            ? "تعذر تأكيد سجل العمليات بالكامل."
            : filtered
              ? "لا توجد عمليات تطابق الفلاتر."
              : "لا توجد عمليات مسجلة حتى الآن."}
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((row) => (
            <li
              key={row.department + row.id}
              className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm"
            >
              <div>
                <p>
                  <span className="font-medium">
                    {activityLabels[row.kind]}
                  </span>{" "}
                  · {row.subject}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {row.department === "protocol" ? "التشريفات" : "المبيعات"} ·{" "}
                  {row.actor_name || "اسم الموظف غير متاح"}
                  {full && row.reason ? " · " + row.reason : ""}
                </p>
              </div>
              <time
                dateTime={row.created_at}
                className="text-xs tabular-nums text-muted"
              >
                {adminDate(row.created_at)}
              </time>
            </li>
          ))}
        </ol>
      )}
      {result.truncated && full && (
        <p className="mt-3 text-xs text-muted">
          السجل المعروض محدود بأحدث العمليات وحجوزات المعرض المحدّثة. قد لا يشمل جميع السجلات الأقدم.
        </p>
      )}
    </section>
  );
}
