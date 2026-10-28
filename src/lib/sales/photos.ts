import { readLocalArtworkImage } from "./local-images";
import { salesClient } from "./access";
import "server-only";
import { v2 as cloudinary } from "cloudinary";

import { cloudinaryConfig } from "@/lib/protocol/config";
import { photoReference } from "@/lib/protocol/validation";
import { isUuid } from "@/lib/protocol/search";
import { privateHeaders } from "@/lib/protocol/queries";
import type { SalesMode } from "@/types/sales";
export async function artworkPhotoResponse(
  request: Request,
  id: string,
  mode: SalesMode,
) {
  const client = await salesClient(mode);
  if (!isUuid(id))
    return new Response(null, { status: 404, headers: privateHeaders });
  const width = Number(new URL(request.url).searchParams.get("w") || 160);
  if (![160, 320, 640, 1280].includes(width))
    return new Response(null, { status: 400, headers: privateHeaders });
  try {
    if (!client)
      return new Response(null, { status: 404, headers: privateHeaders });
    const { data, error } = await client.rpc("sales_photo_ref", {
      p_listing_id: id,
    });
    if (error || !data || typeof data!=="object" || Array.isArray(data))
      return new Response(null, { status: 404, headers: privateHeaders });
    if (data.photo_local_path) {
      const local = await readLocalArtworkImage(data.photo_local_path);
      if (!local) return new Response(null, {status:404,headers:privateHeaders});
      return new Response(local.bytes, {headers:{...privateHeaders,"Content-Type":local.type,"Content-Length":String(local.bytes.length),"X-Content-Type-Options":"nosniff"}});
    }
    const config = cloudinaryConfig();
    if (!config || typeof data.photo_public_id !== "string" || !data.photo_public_id)
      return new Response(null, {status:404,headers:privateHeaders});
    const publicId = photoReference(data.photo_public_id, config.cloudName);
    const url = cloudinary.url(publicId, {
      cloud_name: config.cloudName,
      secure: true,
      ...(typeof data.photo_url==="string" && data.photo_url.match(/\/image\/upload\/v(\d+)\//) ? {version:data.photo_url.match(/\/image\/upload\/v(\d+)\//)![1]}:{}),
      type: config.mode === "authenticated" ? "authenticated" : "upload",
      sign_url: config.mode === "authenticated",
      api_secret: config.secret,
      width,
      crop: "limit",
      quality: "auto",
      fetch_format: "auto",
    });
    const upstream = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: (request.headers.get("Accept") || "image/webp,image/*").slice(
          0,
          200,
        ),
      },
      signal: AbortSignal.timeout(12000),
    });
    const type = upstream.headers.get("Content-Type")?.split(";")[0] || "";
    if (
      !upstream.ok ||
      !/^image\/(jpeg|png|webp|avif|gif)$/.test(type) ||
      !upstream.body
    )
      return new Response(null, { status: 404, headers: privateHeaders });
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 5242880) {
        await reader.cancel();
        return new Response(null, { status: 413, headers: privateHeaders });
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new Response(bytes, {
      headers: {
        ...privateHeaders,
        "Content-Type": type,
        "Content-Length": String(length),
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: privateHeaders });
  }
}
