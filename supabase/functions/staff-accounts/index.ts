import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createStaffAccountHandler } from "./handler.mjs";
const defaultKey = (name: string) => {
  try { const keys=JSON.parse(Deno.env.get(name)||"{}");return keys.default||Object.values(keys)[0]||""; } catch { return ""; }
};
Deno.serve(createStaffAccountHandler({
  makeClient:createClient,
  url:Deno.env.get("SUPABASE_URL")||"",
  publicKey:Deno.env.get("SUPABASE_ANON_KEY")||defaultKey("SUPABASE_PUBLISHABLE_KEYS"),
  secretKey:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||defaultKey("SUPABASE_SECRET_KEYS"),
}));
