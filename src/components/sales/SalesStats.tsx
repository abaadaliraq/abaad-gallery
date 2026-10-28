import type { SalesSnapshot } from "@/types/sales";
export default function SalesStats({data}: {data: SalesSnapshot | null}) {
  return <dl className="compact-stats mb-3 grid grid-cols-2 gap-2 sm:mb-6 sm:grid-cols-4 sm:gap-3">
    {[["إجمالي الأعمال",data?.total],["المتاحة",data?.available],["المحجوزة",data?.reserved],["المباعة",data?.sold]].map(([label,value],index)=><div key={label} className={(index>1 ? "hidden sm:block " : "flex items-center justify-between gap-2 sm:block ")+"min-w-0 rounded border border-line bg-surface px-2.5 py-1.5 sm:px-4 sm:py-3"}>
      <dt className="text-[10px] leading-4 text-muted sm:text-xs">{index===0?<><span className="sm:hidden">الأعمال</span><span className="hidden sm:inline">{label}</span></>:label}</dt>
      <dd className="text-sm tabular-nums sm:mt-1 sm:text-2xl">{value===undefined?'—':Number(value).toLocaleString('ar-IQ')}</dd>
    </div>)}
  </dl>;
}
