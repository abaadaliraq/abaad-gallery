"use client";
import Link from "next/link";
import type { DataState } from "@/types/admin";
import type { SalesSnapshot } from "@/types/sales";
import { useAdminData } from "@/lib/admin/useAdminData";
import AdminStatus from "../AdminStatus";
export default function ArtworkSummary() {
  const { data, error, loading, updating, slow, limited, refresh } =
    useAdminData<DataState<SalesSnapshot>>("/api/admin/artwork-summary");
  const snapshot = data?.state === "ready" ? data.data : null;
  return (
    <>
      <p className="mb-5 text-sm leading-7 text-muted">
        عرض مجموعات الفنانين وحالة الأعمال فقط. إدخال الأعمال والأسعار والصور
        مؤجل إلى المرحلة اللاحقة.
      </p>
      <AdminStatus
        error={error}
        loading={!data && loading}
        updating={updating}
        slow={slow}
        limited={limited}
        onRetry={() => void refresh()}
      />
      {data && data.state !== "ready" && (
        <p
          role="status"
          className="rounded border border-line bg-surface p-5 text-sm"
        >
          {data.message}
        </p>
      )}
      {snapshot && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {snapshot.artists.map((artist) => (
              <section
                key={artist.id}
                className="rounded border border-line bg-surface p-5"
              >
                <h2 className="text-lg font-medium">{artist.name_ar}</h2>
                {artist.name_en && (
                  <p lang="en" className="mt-1 text-xs text-muted">
                    {artist.name_en}
                  </p>
                )}
                <dl className="mt-4 grid grid-cols-3 gap-3 text-xs text-muted">
                  {[
                    ["الأعمال", artist.total],
                    ["المتاحة", artist.available],
                    ["المباعة", artist.sold],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd className="mt-1 text-xl tabular-nums text-foreground">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                {artist.total === 0 && (
                  <p className="mt-4 text-xs text-muted">
                    لم تتم إضافة أعمال فنية لهذا الفنان بعد.
                  </p>
                )}
              </section>
            ))}
          </div>
          <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-surface p-4 text-sm">
            <p>
              الإجمالي: {snapshot.total} · متاحة: {snapshot.available} · محجوزة:{" "}
              {snapshot.reserved} · مباعة: {snapshot.sold}
            </p>
            <Link
              href="/admin/artworks/preview"
              className="min-h-11 rounded border border-line px-4 py-2 text-sm"
            >
              فتح العرض الإداري للمبيعات ←
            </Link>
          </section>
        </>
      )}
    </>
  );
}
