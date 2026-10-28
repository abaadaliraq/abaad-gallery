import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  require = createRequire(root + "/package.json"),
  ts = require("typescript");
function load(name, overrides = {}) {
  const file = path.resolve(root, name),
    exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext("(function(require,exports){" + code + "})", {
    console,
    fetch: overrides.fetch || fetch,
    Response,
    Request,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    queueMicrotask,
  })((id) => {
    if (id in overrides) return overrides[id];
    if (id === "server-only") return {};
    return require(id);
  }, exports);
  return exports;
}
const { LiveStore, signature } = load("src/lib/live/store.ts");
const key = "/api/protocol?q=guest";
test("unchanged probes never re-fetch full data every five seconds", async () => {
  let full = 0,
    probe = 0,
    time = 100000;
  const store = new LiveStore(
    "protocol",
    () => assert.fail("denied"),
    async (url) => {
      if (String(url).startsWith("/api/ui/changes")) {
        probe++;
        return Response.json({ revisions: { protocol: "1" } });
      }
      full++;
      return Response.json({
        guests: [{ id: "1" }],
        observed_at: String(full),
      });
    },
    () => time,
  );
  store.subscribe(key, "protocol", () => {});
  await store.load(key, "protocol");
  await store.check(true);
  const baseline = full;
  for (let n = 0; n < 12; n++) {
    time += 15000;
    await store.check(true);
  }
  assert.equal(full, baseline);
  assert.equal(probe, 13);
  store.dispose();
});
test("changed counter refreshes only its affected resources", async () => {
  let full = { protocol: 0, bookings: 0 },
    revision = 0,
    time = 100000;
  const store = new LiveStore(
    "protocol",
    () => {},
    async (url) => {
      if (String(url).includes("/api/ui/changes"))
        return Response.json({
          revisions: { protocol: "0", bookings: String(revision) },
        });
      const scope = String(url).includes("bookings") ? "bookings" : "protocol";
      full[scope]++;
      return Response.json({ scope, value: full[scope] });
    },
    () => time,
  );
  for (const scope of ["protocol", "bookings"]) {
    const url = "/api/" + scope;
    store.subscribe(url, scope, () => {});
    await store.load(url, scope);
  }
  await store.check(true);
  const p = full.protocol,
    b = full.bookings;
  revision++;
  time += 15000;
  await store.check(true);
  assert.equal(full.protocol, p);
  assert.equal(full.bookings, b + 1);
  store.dispose();
});
test("requests for the same payload deduplicate in flight", async () => {
  let count = 0,
    resolve;
  const store = new LiveStore(
    "protocol",
    () => {},
    async () => {
      count++;
      return new Promise((done) => (resolve = done));
    },
  );
  const a = store.load(key, "protocol"),
    b = store.load(key, "protocol");
  assert.equal(count, 1);
  resolve(Response.json({ guests: [] }));
  await Promise.all([a, b]);
  assert.equal(count, 1);
  store.dispose();
});
test("normal background update retains the loaded content", async () => {
  let resolve,
    count = 0;
  const store = new LiveStore(
    "protocol",
    () => {},
    async () =>
      ++count === 1
        ? Response.json({ guests: [{ id: "old" }] })
        : new Promise((done) => (resolve = done)),
  );
  await store.load(key, "protocol");
  const a = store.entry(key, "protocol").state.data;
  const pending = store.load(key, "protocol", true);
  assert.equal(store.entry(key, "protocol").state.data, a);
  assert.equal(store.entry(key, "protocol").state.fetching, true);
  assert.equal(store.entry(key, "protocol").state.error, "");
  resolve(Response.json({ guests: [{ id: "updated" }] }));
  await pending;
  assert.equal(store.entry(key, "protocol").state.data.guests[0].id, "updated");
  store.dispose();
});
test("observed timestamps alone do not replace the row/image references", async () => {
  let count = 0;
  const store = new LiveStore(
    "protocol",
    () => {},
    async () =>
      Response.json({
        guests: [{ id: "1", photo_url: "same" }],
        observed_at: String(++count),
      }),
  );
  await store.load(key, "protocol");
  const old = store.entry(key, "protocol").state.data;
  await store.load(key, "protocol", true);
  assert.equal(store.entry(key, "protocol").state.data, old);
  assert.equal(signature(old), signature({ ...old, observed_at: "different" }));
  store.dispose();
});
test("failed background fetch retains an explicitly stale snapshot and its last confirmed time", async () => {
  let failed = false,
    time = 100;
  const store = new LiveStore(
    "protocol",
    () => {},
    async () => {
      if (failed) throw Error("network");
      return Response.json({ guests: [{ id: "1" }] });
    },
    () => time,
  );
  await store.load(key, "protocol");
  const confirmed = store.entry(key, "protocol").state.checkedAt;
  failed = true;
  time = 200;
  await store.load(key, "protocol", true);
  const state = store.entry(key, "protocol").state;
  assert.equal(state.data.guests.length, 1);
  assert.ok(state.error);
  assert.equal(state.checkedAt, confirmed);
  store.offline();
  assert.ok(store.entry(key, "protocol").state.error.includes("الاتصال"));
  store.dispose();
});
test("access denial purges every cached personal payload and calls redirect once", async () => {
  let denied = 0,
    allowed = true;
  const store = new LiveStore(
    "protocol",
    () => denied++,
    async () =>
      allowed
        ? Response.json({ full_name: "SYNTHETIC ONLY" })
        : new Response("", { status: 403 }),
  );
  await store.load(key, "protocol");
  allowed = false;
  await store.load(key, "protocol", true);
  assert.equal(denied, 1);
  assert.equal(store.entry(key, "protocol").state.data, null);
  assert.equal(store.entry(key, "protocol").state.denied, true);
  store.dispose();
});
test("late responses cannot repopulate data after revoked session", async () => {
  let resolve;
  const store = new LiveStore(
    "protocol",
    () => {},
    async () => new Promise((done) => (resolve = done)),
  );
  const pending = store.load(key, "protocol");
  store.deny();
  resolve(Response.json({ full_name: "must not reappear" }));
  await pending;
  assert.equal(store.entry(key, "protocol").state.data, null);
  store.dispose();
});
test("memory cache is bounded and isolated between employees", async () => {
  const one = new LiveStore(
    "protocol",
    () => {},
    async () => Response.json({ name: "employee one" }),
  );
  for (let n = 0; n < 40; n++) await one.load("/api/" + n, "protocol");
  assert.ok(one.entries.size <= 24);
  const two = new LiveStore("protocol", () => {});
  assert.equal(two.entry("/api/39", "protocol").state.data, null);
  one.dispose();
  two.dispose();
});
test("missing revision SQL uses bounded fallback instead of five-second full polling", async () => {
  let time = 100000,
    full = 0;
  const store = new LiveStore(
    "protocol",
    () => {},
    async (url) =>
      String(url).includes("/api/ui/changes")
        ? Response.json({ limited: true })
        : (full++, Response.json({ guests: [] })),
    () => time,
  );
  store.subscribe(key, "protocol", () => {});
  await store.load(key, "protocol");
  await store.check(true);
  const baseline = full;
  for (let n = 0; n < 3; n++) {
    time += 15000;
    await store.check(true);
  }
  assert.equal(full, baseline);
  time += 15000;
  await store.check(true);
  assert.equal(full, baseline + 1);
  assert.equal(store.entry(key, "protocol").state.limited, true);
  store.dispose();
});
test("focus probes deduplicate and do not call page/route reload APIs", async () => {
  let resolve,
    count = 0;
  const store = new LiveStore(
    "protocol",
    () => {},
    async () => {
      count++;
      return new Promise((done) => (resolve = done));
    },
  );
  const a = store.check(true),
    b = store.check(true);
  resolve(Response.json({ revisions: {} }));
  await Promise.all([a, b]);
  assert.equal(count, 1);
  for (const file of [
    "src/components/access/SessionRevalidation.tsx",
    "src/lib/live/LiveProvider.tsx",
    "src/lib/live/useLiveData.ts",
    "src/lib/bookings/useBookings.ts",
  ])
    assert.doesNotMatch(
      fs.readFileSync(root + "/" + file, "utf8"),
      /router\.refresh\(|location\.reload\(/,
    );
  store.dispose();
});
test("disposal clears cached PII and supports StrictMode effect reactivation", async () => {
  const store = new LiveStore(
    "protocol",
    () => {},
    async () => Response.json({ name: "test" }),
  );
  await store.load(key, "protocol");
  store.dispose();
  assert.equal(store.entries.size, 0);
  store.activate();
  await store.load(key, "protocol");
  assert.equal(store.entry(key, "protocol").state.data.name, "test");
  store.dispose();
});
const id = "10000000-0000-4000-8000-000000000001";
test("reopening unchanged details reuses the session cache, while versions and invalidation refetch", async () => {
  const store = new LiveStore("admin", () => {});
  let count = 0;
  const read = async () => ({ events: [{ id: String(++count) }] });
  await store.detail("bookings", "booking", "1", read);
  await store.detail("bookings", "booking", "1", read);
  assert.equal(count, 1);
  await store.detail("bookings", "booking", "2", read);
  assert.equal(count, 2);
  await store.invalidate(["bookings"]);
  await store.detail("bookings", "booking", "2", read);
  assert.equal(count, 3);
  store.offline();
  await store.detail("bookings", "booking", "2", read);
  assert.equal(count, 4);
  store.dispose();
});
test("unified booking search also follows invitation changes", async () => {
  let revision = 0,
    full = 0;
  const store = new LiveStore(
    "protocol",
    () => {},
    async (url) =>
      String(url).includes("/api/ui/changes")
        ? Response.json({
            revisions: { protocol: String(revision), bookings: "0" },
          })
        : (full++, Response.json({ bookings: [], opening: { guests: [] } })),
  );
  const url = "/api/protocol/bookings?q=guest";
  store.subscribe(url, "bookings", () => {});
  await store.load(url, "bookings");
  await store.check(true);
  const initial = full;
  revision++;
  await store.check(true);
  assert.equal(full, initial + 1);
  store.dispose();
});
test("inactive cached pages are marked dirty and revalidated on return", async () => {
  let full = 0;
  const store = new LiveStore(
    "protocol",
    () => {},
    async () => Response.json({ value: ++full }),
  );
  await store.load(key, "protocol");
  await store.invalidate(["protocol"]);
  await store.load(key, "protocol");
  assert.equal(full, 2);
  store.dispose();
});
test("a mutation during an in-flight read cannot be lost behind its revision token", async () => {
  let resolve,
    count = 0;
  const store = new LiveStore(
    "protocol",
    () => {},
    async () =>
      ++count === 1
        ? new Promise((done) => (resolve = done))
        : Response.json({ value: "new" }),
  );
  store.subscribe(key, "protocol", () => {});
  const load = store.load(key, "protocol");
  const changed = store.invalidate(["protocol"]);
  resolve(Response.json({ value: "old" }));
  await Promise.all([load, changed]);
  assert.equal(store.entry(key, "protocol").state.data.value, "new");
  assert.equal(count, 2);
  store.dispose();
});
test("non-admin archive action is denied before RPC", async () => {
  let calls = 0;
  const { archiveInvitation } = load("src/lib/admin/archive-actions.ts", {
    "./access": {
      adminClient: async () => {
        throw Error("forbidden");
      },
    },
    "@/lib/protocol/search": { isUuid: () => true },
  });
  await assert.rejects(archiveInvitation({ id }), /forbidden/);
  assert.equal(calls, 0);
});
test("archive action validates inputs and forwards only reviewed identity/version data", async () => {
  let sent;
  const { archiveInvitation } = load("src/lib/admin/archive-actions.ts", {
    "./access": {
      adminClient: async () => ({
        client: {
          rpc: async (name, data) => {
            sent = { name, data };
            return { data: { ok: true }, error: null };
          },
        },
      }),
    },
    "@/lib/protocol/search": {
      isUuid: (v) => typeof v === "string" && v === id,
    },
  });
  const value = {
    id,
    operation: id,
    archived: true,
    reason: "اعتذار",
    expected: "2026-10-27T15:00:00Z",
    reviewed: false,
    checked_in_at: "FORGED",
  };
  assert.equal((await archiveInvitation(value)).ok, true);
  assert.equal(sent.name, "admin_archive_invitation");
  assert.equal("checked_in_at" in sent.data, false);
  assert.equal(
    (await archiveInvitation({ ...value, archived: "yes" })).ok,
    false,
  );
});
test("missing SQL and stale versions never report archive success", async () => {
  for (const reply of [
    { error: { code: "PGRST202" }, data: null },
    { error: null, data: { ok: false, code: "stale" } },
  ]) {
    const api = load("src/lib/admin/archive-actions.ts", {
      "./access": {
        adminClient: async () => ({ client: { rpc: async () => reply } }),
      },
      "@/lib/protocol/search": { isUuid: () => true },
    });
    assert.equal(
      (
        await api.archiveInvitation({
          id,
          operation: id,
          archived: true,
          reason: "",
          expected: "2026-10-27T15:00:00Z",
          reviewed: false,
        })
      ).ok,
      false,
    );
  }
});
test("protected photo ETag avoids unchanged Cloudinary download but still authorizes every request", async () => {
  let upstream = 0,
    authorized = true,
    guards = 0;
  const api = load("src/lib/protocol/photos.ts", {
    "node:crypto": crypto,
    "./access": {
      protocolClient: async () => {
        guards++;
        if (!authorized) throw Error("forbidden");
        return {
          rpc: async () => ({
            data: {
              photo_public_id: "test-only",
              photo_url: null,
              photo_gravity: "face",
            },
            error: null,
          }),
        };
      },
    },
    cloudinary: {
      v2: {
        url: () => "https://res.cloudinary.com/isolated/image/upload/test",
      },
    },
    "./config": {
      cloudinaryConfig: () => ({ cloudName: "isolated", mode: "public" }),
    },
    "./validation": { photoReference: (v) => v },
    "./search": { isUuid: () => true },
    "./queries": { privateHeaders: { "Cache-Control": "private,no-store" } },
    fetch: async () => {
      upstream++;
      return new Response(new Uint8Array([1, 2]), {
        headers: { "Content-Type": "image/webp" },
      });
    },
  });
  const first = await api.photoResponse(
    new Request("http://localhost/photo?w=96"),
    id,
    "protocol",
  );
  assert.equal(first.status, 200);
  assert.match(first.headers.get("cache-control"), /private.*no-cache/);
  const headers = { "If-None-Match": first.headers.get("etag") };
  const second = await api.photoResponse(
    new Request("http://localhost/photo?w=96", { headers }),
    id,
    "protocol",
  );
  assert.equal(second.status, 304);
  assert.equal(upstream, 1);
  assert.equal(guards, 2);
  authorized = false;
  await assert.rejects(
    api.photoResponse(
      new Request("http://localhost/photo?w=96", { headers }),
      id,
      "protocol",
    ),
    /forbidden/,
  );
});
function changesApi({
  role = "protocol",
  user = {
    id,
    email: "test@example.invalid",
    email_confirmed_at: "2026-01-01",
    is_anonymous: false,
  },
  rpcError = null,
  rpcData = { revisions: { protocol: "1" } },
} = {}) {
  let calls = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: async () => ({
        data: { user_id: id, role, is_active: true },
        error: null,
      }),
    }),
    rpc: async () => {
      calls++;
      return { data: rpcData, error: rpcError };
    },
  };
  const api = load("src/app/api/ui/changes/route.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/auth/authorization": {
      isStaffIdentity: (u) => !!u && !u.is_anonymous && !!u.email_confirmed_at,
    },
    "@/types/auth": {
      isRole: (r) => ["protocol", "sales", "admin"].includes(r),
    },
    "@/lib/protocol/queries": {
      privateHeaders: { "Cache-Control": "private,no-store" },
    },
    "@/lib/protocol/config": { protocolSlug: () => "naima-baghdad-2026" },
  });
  return { ...api, calls: () => calls };
}
test("lightweight endpoint verifies identity and rejects forged role/scope before RPC", async () => {
  const api = changesApi();
  for (const url of [
    "?role=admin&scopes=overview",
    "?role=protocol&scopes=staff",
  ])
    assert.equal(
      (await api.GET(new Request("http://localhost/api/ui/changes" + url)))
        .status,
      403,
    );
  assert.equal(api.calls(), 0);
});
test("anonymous identities cannot use the live session probe", async () => {
  const api = changesApi({
    user: {
      id,
      email: "test@example.invalid",
      email_confirmed_at: "2026-01-01",
      is_anonymous: true,
    },
  });
  assert.equal(
    (
      await api.GET(
        new Request(
          "http://localhost/api/ui/changes?role=protocol&scopes=protocol",
        ),
      )
    ).status,
    401,
  );
  assert.equal(api.calls(), 0);
});
test("missing reviewed SQL is explicitly limited rather than a fake fresh revision", async () => {
  const api = changesApi({ rpcError: { code: "PGRST202" } });
  const response = await api.GET(
    new Request(
      "http://localhost/api/ui/changes?role=protocol&scopes=protocol",
    ),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).limited, true);
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
});
test("probe returns only its authorized counter without visitor data", async () => {
  const api = changesApi();
  const response = await api.GET(
    new Request(
      "http://localhost/api/ui/changes?role=protocol&scopes=protocol",
    ),
  );
  assert.deepEqual(await response.json(), { revisions: { protocol: "1" } });
  assert.equal(api.calls(), 1);
});
test("default transport keeps the browser fetch receiver for guest lists and probes", async () => {
  let calls=0;
  const {LiveStore:BrowserStore}=load("src/lib/live/store.ts",{fetch:async function(url){
    if(this?.role)throw new TypeError("Illegal invocation");
    calls++;
    return Response.json(String(url).includes('/api/ui/changes')?{revisions:{protocol:'1'}}:{guests:[{id:'existing-guest'}]});
  }});
  const store=new BrowserStore('protocol',()=>assert.fail('unexpected access denial'));
  store.subscribe('/api/protocol','protocol',()=>{});
  await store.load('/api/protocol','protocol');
  assert.equal(store.entry('/api/protocol','protocol').state.data?.guests[0]?.id,'existing-guest');
  await store.check(true);
  assert.equal(store.entry('/api/protocol','protocol').state.error,'');
  assert.ok(calls>=2);
  store.dispose();
});

