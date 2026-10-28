import type { Database } from "./database";
export const roles = ["protocol", "sales", "admin"] as const;
export type Role = Database["public"]["Tables"]["staff_roles"]["Row"]["role"];
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && roles.some((role) => role === value);
}
export type StaffProfile = Pick<Database["public"]["Tables"]["staff_roles"]["Row"], "user_id" | "full_name" | "role" | "is_active">;
export type LoginResult = { error?: string; fields?: { email?: string; password?: string }; path?: string };
