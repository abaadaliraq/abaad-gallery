import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { cookieOptions, getSupabaseConfig } from "./config";

export async function createClient(options: { writable?: boolean } = {}) {
  const store = await cookies();
  const config = getSupabaseConfig();
  if (!config) return null;
  return createServerClient<Database>(config.url, config.key, {
    cookieOptions: { ...cookieOptions, name: config.cookieName },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        // Proxy handles refresh for Server Components. Server Actions must persist
        // cookies successfully: do not swallow a write failure and report success.
        if (!options.writable) return;
        values.forEach(({ name, value, options: settings }) => store.set(name, value, settings));
      },
    },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export async function clearSessionCookies() {
  const config = getSupabaseConfig();
  if (!config) return;
  const store = await cookies();
  const prefix = config.cookieName;
  for (const { name } of store.getAll()) {
    const chunk = name.startsWith(prefix + ".") && /^\d+$/.test(name.slice(prefix.length + 1));
    if (name === prefix || chunk || name === prefix + "-code-verifier") {
      store.set(name, "", { ...cookieOptions, maxAge: 0 });
    }
  }
}
