import { configuredArtists } from "@/lib/sales/domain";
import type { Artist } from "@/types/sales";
export default function ArtistSelector({artists,selected,onSelect,disabled}: {artists:Artist[]|null;selected:string;onSelect:(id:string)=>void;disabled:boolean}) {
  const rows=artists||configuredArtists.map(a=>({...a,id:a.slug,total:undefined,available:undefined,sold:undefined}));
  return <section aria-label="مجموعات الفنانين" className="sales-mobile-artists mb-3 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-3">
    {rows.map(artist=><button type="button" key={artist.id} disabled={disabled||!artists} aria-pressed={selected===artist.id} onClick={()=>onSelect(selected===artist.id?'':artist.id)} className={'min-w-0 rounded border bg-surface px-2.5 py-2 text-right disabled:cursor-default sm:p-4 '+(selected===artist.id?'border-accent':'border-line hover:border-accent')}>
      <span className="flex items-start justify-between gap-2"><span className="min-w-0">
        <span className="sales-mobile-artists-name block text-sm font-normal leading-6 sm:text-lg"><span className="hidden sm:inline">أعمال </span>{artist.name_ar}</span>
        {artist.name_en&&<span lang="en" dir="ltr" className="mt-1 hidden text-xs text-muted sm:block">{artist.name_en} Collection</span>}
      </span><span className="hidden text-accent sm:inline" aria-hidden>←</span></span>
      <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-4 text-muted sm:mt-4 sm:gap-5 sm:text-xs">
        <span><b className="text-foreground">{artist.total??'—'}</b> عمل</span>
        <span><b className="text-foreground">{artist.available??'—'}</b> متاح</span>
        <span className="hidden sm:inline"><b className="text-foreground">{artist.sold??'—'}</b> مباع</span>
      </span>
    </button>)}
  </section>;
}
