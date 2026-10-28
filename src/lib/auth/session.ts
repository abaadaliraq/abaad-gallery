import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { clearSessionCookies } from "@/lib/supabase/server";

/** Revoke the current refresh session AND clear local cookies even on a remote failure. */
export async function endSession(client: SupabaseClient<Database> | null): Promise<boolean> {
  let revoked = false;
  try {
    if (client) {
      const { error } = await client.auth.signOut({ scope: "local" });
      revoked = !error;
    }
  } catch { /* The UI can report that remote revocation could not be confirmed. */ }
  finally { await clearSessionCookies(); }
  return revoked;
}
