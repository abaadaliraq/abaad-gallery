// Separate from Cloudinary IDs and URLs. No traversal, encoding, queries or SVG.
export function isLocalArtworkPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 500 &&
    /^\/images\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|avif|gif)$/.test(value);
}
