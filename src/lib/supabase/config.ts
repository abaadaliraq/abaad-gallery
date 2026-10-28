import "server-only";
import { Buffer } from "node:buffer";

// This is a configuration guard, NOT a JWT signature verifier or an auth decision.
function isPublicKey(key: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const parts = key.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.role === "anon";
  } catch { return false; }
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const expectedRef = process.env.SUPABASE_EXPECTED_PROJECT_REF?.trim();
  if (!url || !key || !isPublicKey(key)) return null;
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return null;
    if (expectedRef && parsed.hostname !== expectedRef + ".supabase.co") return null;
    return { url: parsed.origin, key, cookieName: "sb-" + parsed.hostname.split(".")[0] + "-auth-token" };
  } catch { return null; }
}

// All Supabase operations are server-side; no browser Supabase client reads these cookies.
export const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
