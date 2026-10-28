import "server-only";
import { requireRole } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import type { ProtocolMode } from "@/types/protocol";
/** API handlers can persist refreshed cookies without changing the existing Auth proxy. */
export async function protocolClient(mode: ProtocolMode) {
  const client = await createClient({ writable: true });
  if (client) {
    try {
      await client.auth.getUser();
    } catch {
      /* Existing guard handles unavailable/invalid sessions. */
    }
  }
  await requireRole(mode);
  return client;
}
