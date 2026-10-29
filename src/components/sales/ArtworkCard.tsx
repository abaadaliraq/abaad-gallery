import type {Artwork,SalesMode} from "@/types/sales";
import {dimensions,priceText} from "@/lib/sales/domain";
import ArtworkImage from "./ArtworkImage";
import ArtworkStatusBadge from "./ArtworkStatusBadge";
export default function ArtworkCard({artwork,mode,onOpen}:{artwork:Artwork;mode:SalesMode;onOpen:()=>void}) {
  if (artwork.collection_kind === "miniature") return <article className="sales-mobile-card overflow-hidden rounded border border-line bg-surface">
    <button type="button" onClick={onOpen} aria-label={'تفاصيل المصغرة '+artwork.artwork_code} className="flex h-full w-full flex-col text-right">
      {(artwork.photo_local_path || artwork.photo_public_id || artwork.photo_url) && <ArtworkImage key={artwork.photo_local_path || artwork.photo_public_id || artwork.photo_url} artwork={artwork} mode={mode}/>}
      <span className="flex min-h-14 w-full flex-col gap-1 p-2.5 sm:p-4">
        <span dir="ltr" className="font-latin text-xs text-muted">{artwork.artwork_code}</span>
        <span className="text-xs tabular-nums sm:text-sm">{priceText(artwork.price,artwork.currency)}</span>
      </span>
    </button>
  </article>;
  return <article className="sales-mobile-card overflow-hidden rounded border border-line bg-surface">
    <button type="button" onClick={onOpen} aria-label={'تفاصيل '+(artwork.title_ar||artwork.artwork_code)} className="sales-mobile-card-open grid w-full grid-cols-[72px_minmax(0,1fr)] items-center text-right sm:block">
      <ArtworkImage key={artwork.photo_local_path || artwork.photo_public_id || artwork.photo_url} artwork={artwork} mode={mode}/>
      <span className="sales-mobile-card-text block min-w-0 border-line p-2.5 sm:border-t sm:p-4">
        <span className="sales-mobile-code mb-0.5 block font-latin text-[10px] text-muted sm:mb-2 sm:text-[11px]" dir="ltr">{artwork.artwork_code}</span>
        <span className="sales-mobile-title block text-sm font-normal leading-6 sm:text-base sm:leading-7">{artwork.title_ar || "الاسم الفني غير مكتمل"}</span>
        <span className="sales-mobile-artist block text-[11px] text-muted sm:text-xs">{artwork.artist_name_ar}</span>
        {dimensions(artwork)&&<span className="sales-mobile-dimensions mt-0.5 block text-[11px] text-muted sm:mt-2 sm:text-xs"><span className="sm:hidden">{dimensions(artwork)?.replace(/\.00(?=\s|$)/g, "")}</span><span className="hidden sm:inline">{dimensions(artwork)}</span></span>}
        <span className="sales-mobile-price-row mt-1.5 flex flex-wrap items-center justify-between gap-1 sm:mt-3 sm:gap-2"><span className="sales-mobile-price text-xs tabular-nums sm:text-sm">{priceText(artwork.price,artwork.currency)}</span><ArtworkStatusBadge status={artwork.status}/></span>
      </span>
    </button>
  </article>;
}
