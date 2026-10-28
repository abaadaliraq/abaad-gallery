"use client";
import Image, { type ImageLoaderProps } from "next/image";
import { useState } from "react";
import type { Artwork, SalesMode } from "@/types/sales";

function loader({src, width}: ImageLoaderProps) {
  return src + "?w=" + ([160,320,640,1280].find(n => n >= width) || 1280);
}
export default function ArtworkImage({artwork, mode, large = false}: {
  artwork: Artwork; mode: SalesMode; large?: boolean;
}) {
  const reference = artwork.photo_local_path || artwork.photo_public_id || artwork.photo_url || "";
  const [failedReference, setFailedReference] = useState<string | null>(null);
  return <span className={"relative flex w-full items-center justify-center overflow-hidden bg-background/45 " + (large ? "min-h-40 sm:min-h-64" : "h-28 sm:aspect-[4/5] sm:h-auto")}>
    {reference && failedReference !== reference ? <Image
      src={(mode === "admin" ? "/api/admin/artworks/photo/" : "/api/sales/photo/") + artwork.id}
      loader={loader} alt={artwork.title_ar || artwork.artwork_code}
      width={large ? 1280 : 640} height={large ? 1280 : 800}
      sizes={large ? "(min-width: 1024px) 600px, 95vw" : "(min-width: 1280px) 300px, (min-width: 640px) 40vw, 72px"}
      loading="lazy" onError={() => setFailedReference(reference)}
      className={"h-full w-full object-contain " + (large ? "max-h-[42dvh] sm:max-h-[65dvh]" : "p-1.5 sm:p-3")}
    /> : <span className="px-1.5 py-3 text-center text-[10px] text-muted sm:px-4 sm:py-12 sm:text-xs">الصورة غير متوفرة بعد</span>}
  </span>;
}
