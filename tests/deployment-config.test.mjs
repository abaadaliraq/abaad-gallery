import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { load } from "./helpers/load-ts.mjs";
function deployment(env = {}) {
  return load("next.config.ts", { __env: env }).default.env;
}
function connection(env) {
  return load("src/lib/supabase/config.ts", { __env: env, "node:buffer": { Buffer } }).getSupabaseConfig();
}
test("a clean deployment without ignored .env.local has the verified public exhibition connection", () => {
  const env = deployment();
  const config = connection(env);
  assert.equal(config.url, "https://pwlwelxnrrignapdsyiw.supabase.co");
  assert.match(config.key, /^sb_publishable_/);
  assert.equal(config.cookieName, "sb-pwlwelxnrrignapdsyiw-auth-token");
  assert.deepEqual(Object.keys(env).sort(), ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_EXPECTED_PROJECT_REF"]);
});
test("deployment defaults never copy explicitly supplied administrative secrets into next.config env", () => {
  const explicit = { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_do_not_publish" };
  const defaults = deployment(explicit);
  assert.equal(defaults.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, undefined);
  assert.equal(connection({ ...defaults, ...explicit }), null);
});
test("an explicit blank public key remains a configuration error rather than silently overriding it", () => {
  const explicit = { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" };
  assert.equal(connection({ ...deployment(explicit), ...explicit }), null);
});
test("a deployment with a different project URL is still rejected by the expected project guard", () => {
  const explicit = { NEXT_PUBLIC_SUPABASE_URL: "https://another-project.supabase.co" };
  assert.equal(connection({ ...deployment(explicit), ...explicit }), null);
});
test("existing public environment configuration remains authoritative", () => {
  const explicit = { NEXT_PUBLIC_SUPABASE_URL: "https://pwlwelxnrrignapdsyiw.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_existing", SUPABASE_EXPECTED_PROJECT_REF: "pwlwelxnrrignapdsyiw" };
  assert.equal(Object.keys(deployment(explicit)).length, 0);
  assert.equal(connection(explicit).key, "sb_publishable_existing");
});
