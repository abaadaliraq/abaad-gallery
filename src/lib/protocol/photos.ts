import { createHash } from "node:crypto";
import { protocolClient } from "./access";
import "server-only";
import { v2 as cloudinary } from "cloudinary";

import { cloudinaryConfig } from "./config";
import { photoReference } from "./validation";
import { isUuid } from "./search";
import { privateHeaders } from "./queries";
import type { ProtocolMode } from "@/types/protocol";
export async function photoResponse(
  request: Request,
  id: string,
  mode: ProtocolMode,
) {
  const client = await protocolClient(mode);
  if (!isUuid(id))
    return new Response(null, { status: 404, headers: privateHeaders });
  const width = Number(new URL(request.url).searchParams.get("w") || 160);
  if (![64, 96, 160, 320, 640].includes(width))
    return new Response(null, { status: 400, headers: privateHeaders });
  try {
    const config = cloudinaryConfig();
    if (!config || !client)
      return new Response(null, { status: 404, headers: privateHeaders });
    const { data, error } = await client.rpc("protocol_photo_ref", {
      p_invitation_id: id,
    });
    if (
      error ||
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.photo_public_id !== "string"
    )
      return new Response(null, { status: 404, headers: privateHeaders });
    const publicId = photoReference(
      data.photo_public_id as string,
      config.cloudName,
    );
    const etag =
      '"' +
      createHash("sha256")
        .update(
          JSON.stringify([
            publicId,
            data.photo_url,
            data.photo_gravity,
            width,
            request.headers.get("Accept"),
            config.mode,
          ]),
        )
        .digest("hex") +
      '"';
    const imageHeaders = {
      ...privateHeaders,
      "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
      Vary: "Cookie, Accept",
      ETag: etag,
    };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers: imageHeaders });
    const url = cloudinary.url(publicId, {
      cloud_name: config.cloudName,
      secure: true,
      ...(typeof data.photo_url === "string" &&
      data.photo_url.match(/\/image\/upload\/v(\d+)\//)
        ? { version: data.photo_url.match(/\/image\/upload\/v(\d+)\//)![1] }
        : {}),
      type: config.mode === "authenticated" ? "authenticated" : "upload",
      sign_url: config.mode === "authenticated",
      api_secret: config.secret,
      width,
      height: width,
      crop: "fill",
      gravity: ["face", "auto", "north", "center"].includes(
        String(data.photo_gravity),
      )
        ? String(data.photo_gravity)
        : "face",
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
        ...imageHeaders,
        "Content-Type": type,
        "Content-Length": String(length),
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: privateHeaders });
  }
}
