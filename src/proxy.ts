import type { Database } from "@/types/database";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, getSupabaseConfig } from "@/lib/supabase/config";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  if (config) {
    const client = createServerClient<Database>(config.url, config.key, {
      cookieOptions: { ...cookieOptions, name: config.cookieName },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values, headers) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          const previous = response;
          response = NextResponse.next({ request });
          previous.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
          for (const name of ["Cache-Control", "Expires", "Pragma"]) {
            const value = previous.headers.get(name);
            if (value) response.headers.set(name, value);
          }
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          if (headers) Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    });
    try { await client.auth.getUser(); } catch { /* Each protected page fails closed via requireRole. */ }
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
export const config = { matcher: ["/", "/protocol/:path*", "/sales/:path*", "/admin/:path*"] };
