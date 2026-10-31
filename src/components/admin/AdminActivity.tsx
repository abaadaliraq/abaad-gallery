"use client";
import { useState } from "react";
import type { ActivityResult } from "@/types/admin";
import { useAdminData } from "@/lib/admin/useAdminData";
import { activityLabels } from "@/lib/admin/domain";
import RecentActivity from "./RecentActivity";
import AdminStatus from "./AdminStatus";
export default function AdminActivity() {
  const [filters, setFilters] = useState({
    department: "all",
    kind: "all",
    actor: "",
    from: "",
    to: "",
  });
  const { data, error, loading, updating, slow, limited, refresh } =
    useAdminData<ActivityResult>(
      "/api/admin/activity",
      new URLSearchParams(filters).toString(),
    );
  const actors = new Map(
    (data?.events || [])
      .filter((e) => e.actor_id)
      .map((e) => [
        e.actor_id!,
        e.actor_name || "موظف " + e.actor_id!.slice(0, 8),
      ]),
  );
  if (filters.actor && !actors.has(filters.actor))
    actors.set(filters.actor, "الموظف المحدد");
  const style =
    "mt-1 min-h-11 w-full rounded border border-line bg-surface px-3 text-sm text-foreground";
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <label className="text-xs text-muted">
          القسم
          <select
            value={filters.department}
            onChange={(e) =>
              setFilters((v) => ({ ...v, department: e.target.value }))
            }
            className={style}
          >
            <option value="all">الجميع</option>
            <option value="protocol">التشريفات</option>
            <option value="sales">المبيعات</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          نوع العملية
          <select
            value={filters.kind}
            onChange={(e) =>
              setFilters((v) => ({ ...v, kind: e.target.value }))
            }
            className={style}
          >
            <option value="all">الجميع</option>
            {Object.entries(activityLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          الموظف
          <select
            value={filters.actor}
            onChange={(e) =>
              setFilters((v) => ({ ...v, actor: e.target.value }))
            }
            className={style}
          >
            <option value="">الجميع</option>
            {[...actors].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          من تاريخ
          <input
            type="date"
            value={filters.from}
            onChange={(e) =>
              setFilters((v) => ({ ...v, from: e.target.value }))
            }
            className={style}
          />
        </label>
        <label className="text-xs text-muted">
          إلى تاريخ
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((v) => ({ ...v, to: e.target.value }))}
            className={style}
          />
        </label>
      </div>
      <div className="mb-4 flex justify-between gap-3 text-xs text-muted">
        <p>تعتمد التواريخ على توقيت بغداد.</p>
        <button
          type="button"
          disabled={loading || !!error}
          onClick={() => void refresh()}
          className="min-h-10 px-2 underline"
        >
          تحديث
        </button>
      </div>
      <AdminStatus
        error={error}
        loading={!data && loading}
        updating={updating}
        slow={slow}
        limited={limited}
        onRetry={() => void refresh()}
      />
      {data && (
        <RecentActivity
          result={data}
          full
          filtered={
            filters.department !== "all" ||
            filters.kind !== "all" ||
            !!filters.actor ||
            !!filters.from ||
            !!filters.to
          }
        />
      )}
      <p className="mt-4 text-xs leading-6 text-muted">
        يغطي هذا السجل وصول زوار الباب وحجوزات المعرض وضيوف الافتتاح وتصحيحات الوصول وتغيّر حالات الأعمال. تعديل بيانات الضيوف
        واعتماد مراجعاتهم وتعديل الموظفين لا تسجلها جداول العمليات الحالية.
      </p>
    </>
  );
}
