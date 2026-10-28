import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { isRole, type Role, type StaffProfile } from "@/types/auth";

export function isStaffIdentity(user: User | null): user is User {
  return !!user && user.is_anonymous !== true && !!user.email && !!user.email_confirmed_at;
}

export async function readStaff(client: SupabaseClient<Database>, userId: string): Promise<StaffProfile | null> {
  // RLS also verifies ownership, active status and a live auth.sessions row.
  const { data, error } = await client.from("staff_roles")
    .select("user_id, full_name, role, is_active").eq("user_id", userId).maybeSingle();
  if (error || !data || data.user_id !== userId || !isRole(data.role) || data.is_active !== true) return null;
  return data;
}

/** Call again inside every future sensitive Server Action, not only while rendering. */
export async function requireRole(role: Role): Promise<StaffProfile> {
  const client = await createClient();
  if (!client) redirect("/?notice=setup");
  let staff: StaffProfile | null = null;
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (!error && isStaffIdentity(user)) staff = await readStaff(client, user.id);
  } catch { redirect("/?notice=unavailable"); }
  if (!staff) redirect("/?notice=session");
  if (staff.role !== role) redirect("/?notice=forbidden");
  return staff;
}
