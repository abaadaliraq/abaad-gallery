import {artworkStatuses,type Artist} from "@/types/sales";
import {statusLabels} from "@/lib/sales/domain";
export default function ArtworkFilters({artists,artist,status,onChange}:{artists:Artist[];artist:string;status:string;onChange:(value:{artist?:string;status?:string})=>void}) {
  const style="mt-1 block min-h-11 w-full rounded border border-line bg-surface px-3 text-sm text-foreground sm:min-w-48";
  const controls=<>
    <label className="text-xs text-muted">الفنان<select value={artist} onChange={event=>onChange({artist:event.target.value})} className={style}><option value="">الجميع</option>{artists.map(a=><option key={a.id} value={a.id}>{a.name_ar}</option>)}</select></label>
    <label className="text-xs text-muted">حالة العمل<select value={status} onChange={event=>onChange({status:event.target.value})} className={style}><option value="all">جميع الأعمال</option>{artworkStatuses.map(value=><option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>
  </>;
  return <>
    <details className="mb-3 rounded border border-line bg-surface px-3 sm:hidden"><summary className="flex min-h-11 cursor-pointer items-center justify-between text-xs text-muted"><span>تصفية النتائج</span><span>{status==='all'?'جميع الحالات':statusLabels[status as keyof typeof statusLabels]} ⌄</span></summary><div className="grid grid-cols-2 gap-2 pb-3">{controls}</div></details>
    <div className="mb-5 hidden gap-3 sm:flex">{controls}</div>
  </>;
}
