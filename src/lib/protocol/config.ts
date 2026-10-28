import "server-only";
export function protocolSlug() {
  return process.env.SUPABASE_EXHIBITION_SLUG?.trim() || "naima-baghdad-2026";
}
export function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || "";
  const mode = process.env.CLOUDINARY_DELIVERY_MODE || "public";
  if (
    !/^[A-Za-z0-9_-]+$/.test(cloudName) ||
    !["public", "authenticated"].includes(mode)
  )
    return null;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (mode === "authenticated" && !secret) return null;
  return { cloudName, mode, secret };
}
