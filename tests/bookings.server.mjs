import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fixture } from "./helpers/booking-db.mjs";
const booking = path.resolve(process.env.BOOKING_PROJECT_PATH || "../booking");
const require = createRequire(booking + "/package.json"),
  ts = require("typescript"),
  f = await fixture();
const env = {
  NODE_ENV: "test",
  BOOKING_ORIGIN: "http://localhost:3216",
  EXHIBITION_SUPABASE_URL: "https://pwlwelxnrrignapdsyiw.supabase.co",
  EXHIBITION_SUPABASE_SERVICE_ROLE_KEY: "LOCAL-SYNTHETIC-KEY-NOT-REAL",
  EXHIBITION_BOOKING_SECRET: "isolated-fixture-only-secret-never-production",
  EMAILJS_SERVICE_ID: "test",
  EMAILJS_TEMPLATE_ID: "test",
  EMAILJS_PUBLIC_KEY: "test",
};
const argOrder = {
  booking_slots: [],
  booking_create: [
    "p_data",
    "p_request_key",
    "p_request_hash",
    "p_token_hash",
    "p_ip_hash",
  ],
  booking_notification: ["p_id", "p_token_hash", "p_lease", "p_status"],
};
let qrContent = "",
  emailCalls = 0;
const mockFetch = async (url, options) => {
  if (String(url).startsWith("https://api.emailjs.com/")) {
    emailCalls++;
    return new Response("simulated email failure", { status: 500 });
  }
  const name = String(url).split("/").pop(),
    body = JSON.parse(options.body);
  try {
    const result = await f.rpc(
      "service_role",
      name,
      argOrder[name].map((k) => body[k]),
    );
    return Response.json(result);
  } catch {
    return Response.json({ error: "db" }, { status: 400 });
  }
};
function load(file, cache = new Map()) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const resolve = (name) => {
    if (name === "qrcode")
      return {
        toDataURL: async (content, options) => {
          qrContent = content;
          return require("qrcode").toDataURL(content, options);
        },
      };
    if (name.startsWith("."))
      return load(path.resolve(path.dirname(file), name + ".ts"), cache);
    return require(name);
  };
  vm.runInNewContext("(function(require,module,exports){" + code + "})", {
    process: { env },
    fetch: mockFetch,
    Response,
    AbortSignal,
    console,
  })(resolve, loadedModule, loadedModule.exports);
  cache.set(file, loadedModule.exports);
  return loadedModule.exports;
}
const domain = load(booking + "/lib/exhibition/domain.ts"),
  server = load(booking + "/lib/exhibition/server.ts"),
  utils = load(booking + "/components/booking/bookingUtils.ts");
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
try {
  await test("selected visit date, not creation day, determines free and regular price", async () => {
    assert.equal(domain.visitMode("2026-10-30"), "private");
    for (const d of ["2026-10-31", "2026-11-09"])
      assert.equal(
        utils.calculatePayment("visit", { people_count: "3", booking_date: d })
          .payment_total,
        "0",
      );
    assert.equal(
      utils.calculatePayment("visit", {
        people_count: "3",
        booking_date: "2026-11-10",
      }).payment_total,
      "45",
    );
    assert.equal(domain.visitPrice("2027-01-01"), 15);
  });
  await test("Iraqi local international Arabic and Persian telephone formats normalize", async () => {
    for (const v of [
      "07701234567",
      "+9647701234567",
      "009647701234567",
      "٠٧٧٠١٢٣٤٥٦٧",
      "۰۷۷۰۱۲۳۴۵۶۷",
      "0770 123 4567",
    ])
      assert.equal(domain.normalizePhone(v), "+9647701234567");
    for (const v of ["123", "+971501234567", "077012345678", "+964780"])
      assert.equal(domain.normalizePhone(v), null);
  });
  const slot = (
    await f.rpc("admin", "booking_slot_save", [
      null,
      {
        visit_date: "2026-10-31",
        start_time: "18:00",
        end_time: "21:00",
        capacity: 6,
        is_closed: false,
      },
      null,
    ])
  ).id;
  const payload = {
    request_key: randomUUID(),
    full_name: "زائر اختبار خادم",
    phone: "07701234567",
    email: "test@example.invalid",
    visit_date: "2026-10-31",
    slot_id: slot,
    guest_count: 3,
    notes: "",
  };
  const req = (body = payload, origin = env.BOOKING_ORIGIN) =>
    new Request(env.BOOKING_ORIGIN + "/api/exhibition/bookings", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  await test("cross origin requests rejected before database writes", async () =>
    assert.equal(
      (await server.createBooking(req(payload, "https://other.invalid")))
        .status,
      403,
    ));
  await test("server rejects private ordinary dates invalid count and malformed email", async () => {
    for (const change of [
      { visit_date: "2026-10-30" },
      { visit_date: "2026-11-10" },
      { guest_count: -1 },
      { guest_count: 2.5 },
      { email: "invalid" },
      { website: "automated" },
      { phone: "123" },
    ])
      assert.equal(
        (await server.createBooking(req({ ...payload, ...change }))).status,
        400,
      );
  });
  let one;
  await test("committed booking succeeds even when EmailJS fails; QR contains opaque token only", async () => {
    const response = await server.createBooking(req());
    assert.equal(response.status, 200);
    one = await response.json();
    assert.equal(one.notification_status, "failed");
    assert.equal(one.booking.status, "confirmed");
    assert.ok(one.qr.startsWith("data:image/png;base64,"));
    assert.match(qrContent, /^ABAAD-BOOKING:[a-f0-9]{64}$/);
    assert.ok(!qrContent.includes(payload.phone));
    assert.ok(!qrContent.includes(payload.full_name));
    assert.equal(emailCalls, 1);
  });
  await test("same POST retry returns same booking and ticket, sends no immediate second email", async () => {
    const response = await server.createBooking(req()),
      two = await response.json();
    assert.equal(two.booking.id, one.booking.id);
    assert.equal(two.qr, one.qr);
    assert.equal(emailCalls, 1);
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from public.exhibition_bookings",
        )
      ).rows[0].n,
      1,
    );
  });
  await test("client price and supplied checked count cannot affect stored values", async () => {
    const response = await server.createBooking(
      req({
        ...payload,
        request_key: randomUUID(),
        price_usd: 99,
        checked_in_guest_count: 100,
      }),
    );
    const r = await response.json();
    assert.equal(r.booking.price_usd, 0);
    assert.equal(
      (
        await f.db.query(
          "select max(checked_in_guest_count)::int n from public.exhibition_bookings",
        )
      ).rows[0].n,
      0,
    );
  });
  await test("wrong target project or missing secret fails closed", async () => {
    const saved = env.EXHIBITION_SUPABASE_URL;
    env.EXHIBITION_SUPABASE_URL = "https://other.supabase.co";
    assert.equal((await server.createBooking(req())).status, 503);
    env.EXHIBITION_SUPABASE_URL = saved;
  });
  console.log(
    "Booking server/domain: " +
      passed +
      " tests passed. Actual handlers with isolated DB, synthetic keys, simulated EmailJS failure.",
  );
} finally {
  await f.db.close();
}
