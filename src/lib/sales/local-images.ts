import "server-only";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { isLocalArtworkPath } from "./image-reference";

const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif",
};
function matchesImage(bytes: Uint8Array, type: string) {
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") return [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n);
  if (type === "image/webp") return text(0,4) === "RIFF" && text(8,12) === "WEBP";
  if (type === "image/gif") return ["GIF87a", "GIF89a"].includes(text(0,6));
  return text(4,8) === "ftyp" && ["avif", "avis"].includes(text(8,12));
}
export async function readLocalArtworkImage(reference: unknown) {
  if (!isLocalArtworkPath(reference)) return null;
  try {
    const root = await realpath(path.join(process.cwd(), "public", "images"));
    const file = await realpath(path.join(root, reference.slice("/images/".length)));
    const relative = path.relative(root, file);
    // realpath also prevents symlinks/junctions escaping the permitted directory.
    if (!relative || path.isAbsolute(relative) || relative.startsWith(".." + path.sep) || relative === "..") return null;
    const info = await stat(file);
    if (!info.isFile() || info.size > 5242880 || info.size < 8) return null;
    const bytes = await readFile(file);
    if (bytes.length > 5242880) return null;
    // Existing .jpg assets can contain WebP bytes. Trust the verified signature.
    const type = Object.values(mimeTypes).find(type => matchesImage(bytes, type));
    if (!type || !matchesImage(bytes, type)) return null;
    return {bytes: new Uint8Array(bytes), type};
  } catch {
    return null;
  }
}
