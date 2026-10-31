"use client";
import type { OverviewData } from "@/types/admin";
import { useAdminData } from "@/lib/admin/useAdminData";
import AdminStats from "./AdminStats";
import RecentActivity from "./RecentActivity";
import AdminStatus from "./AdminStatus";
import Link from 'next/link';
export default function AdminOverview() {
  const { data, error, loading, updating, slow, limited, refresh } =
    useAdminData<OverviewData>("/api/admin/overview");
  return (
    <>
      <div className="mb-4 flex items-center justify-between text-xs text-muted">
        <span>بيانات المعرض من Supabase</span>
        <button
          type="button"
          disabled={loading || !!error}
          onClick={() => void refresh()}
          className="min-h-10 px-2 underline underline-offset-4 disabled:opacity-50"
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
      <AdminStats
        title="حجوزات وزوار المعرض"
        state={data?.bookings||null}
        items={[["إجمالي الحجوزات","total"],["الزوار المتوقعون","expected"],["الذين وصلوا","arrived"],["واصلون من الباب","walk_in"]]}
      />
      <Link href="/admin/bookings" className="mb-5 inline-flex min-h-11 items-center text-sm underline">عرض أسماء زوار المعرض وحجوزات الباب ←</Link>
      <AdminStats
        title="ضيوف الافتتاح"
        state={data?.protocol || null}
        items={[
          ["إجمالي الضيوف", "total"],
          ["الحاضرون", "checked_in"],
          ["بانتظار الوصول", "pending"],
          ["تحتاج مراجعة", "review_required"],
        ]}
      />
      <AdminStats
        title="الأعمال الفنية"
        state={data?.sales || null}
        items={[
          ["إجمالي الأعمال", "total"],
          ["المتاحة", "available"],
          ["المحجوزة", "reserved"],
          ["المباعة", "sold"],
        ]}
      />
      <AdminStats
        title="الموظفون"
        state={data?.staff || null}
        items={[
          ["إجمالي الموظفين", "total"],
          ["الموظفون النشطون", "active_count"],
        ]}
      />
      {data && <RecentActivity result={data.activity} />}
    </>
  );
}
