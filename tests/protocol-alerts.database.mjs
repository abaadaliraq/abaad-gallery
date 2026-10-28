import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import * as crypto from "node:crypto";
import { fixture, ids } from "./helpers/booking-db.mjs";
import { load } from "./helpers/load-ts.mjs";
const { NewBookingTracker } = load("src/lib/bookings/notifications.ts");
const { verifyBookingCode } = load("src/lib/bookings/scan.ts");
const f = await fixture();
const { db, rpc } = f;
let tests = 0;
const check = async (name, run) => { await run(); tests++; console.log("PASS " + name); };
const hash = value => createHash("sha256").update(value).digest("hex");
const endpoint = "http://localhost/api/protocol/bookings";
const { bookingGet } = load("src/lib/bookings/http.ts", {
  "node:crypto": crypto,
  "@/lib/protocol/access": { protocolClient: async mode => {
    assert.equal(mode, "protocol");
    return { rpc: async (name, p) => {
      try { return { data: await rpc("protocol", name, [p.p_query, p.p_date, p.p_status, p.p_page, p.p_token_hash]), error: null }; }
      catch (e) { return { data: null, error: { code: e.code } }; }
    } };
  } },
  "@/lib/protocol/queries": { privateHeaders: { "Cache-Control": "private, no-store" } },
  "@/lib/protocol/config": { protocolSlug: () => "naima-baghdad-2026" },
  "@/lib/protocol/search": { isUuid: () => false },
});
const request = async url => bookingGet(new Request(new URL(url, endpoint)), "protocol");
const snap = async () => { const response = await request(endpoint); assert.equal(response.status, 200); return response.json(); };
const verify = token => verifyBookingCode("ABAAD-BOOKING:" + token, endpoint, new AbortController().signal, request);
try {
  const slot = (await rpc("admin", "booking_slot_save", [null, { visit_date: "2026-10-31", start_time: "18:00", end_time: "21:00", capacity: 30, is_closed: false }, null])).id;
  const token = "a".repeat(64), key = randomUUID();
  const input = { slot_id: slot, visit_date: "2026-10-31", full_name: "ضيف اختبار صوت معزول", phone: "+9647701234567", email: "", notes: "", guest_count: 3 };
  const create = () => rpc("service_role", "booking_create", [input, key, hash(JSON.stringify(input)), hash(token), hash("isolated-test")]);
  const tracker = new NewBookingTracker();
  await tracker.collect(await snap(), () => assert.fail(), new AbortController().signal);
  await new Promise(resolve => setTimeout(resolve, 15));
  const created = await create();
  const s = await snap(), booking = s.bookings[0];
  await check("actual Protocol RPC exposes creation time and new booking is detected through existing HTTP handler", async () => {
    assert.ok(booking.created_at); assert.ok(created);
    const notices = await tracker.collect(s, () => assert.fail(), new AbortController().signal);
    assert.equal(notices.length, 1); assert.equal(notices[0].full_name, input.full_name);
  });
  await check("idempotent website booking replay never creates a second alert or row", async () => {
    await create(); assert.equal((await snap()).stats.total, 1);
    assert.equal((await tracker.collect(await snap(), () => assert.fail(), new AbortController().signal)).length, 0);
  });
  await check("valid QR is accepted only via current protected RPC; verification leaves arrival count untouched", async () => {
    assert.equal((await verify(token)).kind, "success"); assert.equal((await snap()).bookings[0].checked_in_guest_count, 0);
  });
  await check("unknown QR fails after an actual empty RPC lookup", async () => assert.equal((await verify("f".repeat(64))).kind, "rejected"));
  await check("partial group arrival remains valid without a new-booking alert", async () => {
    await rpc("protocol", "booking_arrival", [booking.id, 1, randomUUID(), ""]);
    assert.equal((await verify(token)).kind, "success");
    assert.equal((await tracker.collect(await snap(), () => assert.fail(), new AbortController().signal)).length, 0);
  });
  await check("fully consumed QR is rejected according to actual database arrival rules", async () => {
    await rpc("protocol", "booking_arrival", [booking.id, 2, randomUUID(), ""]);
    assert.match((await verify(token)).message, /سبق تسجيل/);
    await assert.rejects(rpc("protocol", "booking_arrival", [booking.id, 1, randomUUID(), ""]));
  });
  await check("real RLS/RPC membership rejection never returns a successful QR result", async () => {
    await db.query("delete from public.protocol_exhibition_staff where user_id=$1", [ids.protocol]);
    assert.equal((await request(endpoint)).status, 403);
    assert.equal((await verify(token)).kind, "rejected");
  });
  console.log(`${tests} isolated database integration checks passed; no production mutations.`);
} finally { await db.close(); }
