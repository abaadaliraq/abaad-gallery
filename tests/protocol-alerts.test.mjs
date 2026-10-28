import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./helpers/load-ts.mjs";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
const { NewBookingTracker } = load("src/lib/bookings/notifications.ts");
const { verifyBookingCode, ScanGate } = load("src/lib/bookings/scan.ts");
const { SoundController } = load("src/lib/audio/controller.ts");
const { default: SoundControl } = load("src/components/bookings/SoundControl.tsx", { "react/jsx-runtime": jsx });
const signal = () => new AbortController().signal;
const at = n => `2026-10-31T12:00:${String(n).padStart(2, "0")}.000Z`;
const row = (id = "b1", created = 1, extra = {}) => ({ id, booking_reference: id, full_name: "ضيف معزول", visit_date: "2026-10-31", start_time: "18:00", end_time: "21:00", guest_count: 3, checked_in_guest_count: 0, status: "confirmed", created_at: at(created), updated_at: at(created), ...extra });
const snapshot = (rows = [], observed = 10, extra = {}) => ({ bookings: rows, total_matches: rows.length, observed_at: at(observed), page: 1, page_size: 20, recent: [], ...extra });
const noPage = () => assert.fail("unexpected backfill");
test("initial bookings are a silent baseline; updates and historical unseen rows are not creations", async () => {
  const tracker = new NewBookingTracker();
  assert.equal((await tracker.collect(snapshot([row()]), noPage, signal())).length, 0);
  assert.equal((await tracker.collect(snapshot([row("old-unseen", 0), row("b1", 1, { updated_at: at(15) })], 20), noPage, signal())).length, 0);
});
test("a real new creation is emitted once; update, reconnect and replay never repeat it", async () => {
  const tracker = new NewBookingTracker();
  await tracker.collect(snapshot([row()]), noPage, signal());
  const result = await tracker.collect(snapshot([row("new", 11), row()], 20), noPage, signal());
  assert.equal(result.length, 1); assert.equal(result[0].id, "new");
  assert.equal((await tracker.collect(snapshot([row("new", 11, { updated_at: at(25) })], 30), noPage, signal())).length, 0);
  assert.equal((await tracker.collect(snapshot([row("new", 11)], 20), noPage, signal())).length, 0);
});
test("creation catchup paginates even when more than 20 arrive while filtered/offline", async () => {
  const tracker = new NewBookingTracker(); await tracker.collect(snapshot([], 1), noPage, signal());
  let reads = 0;
  const result = await tracker.collect(snapshot(Array.from({ length: 20 }, (_, n) => row("n" + n, 40 - n)), 50, { total_matches: 26 }), async page => {
    reads++; assert.equal(page, 2);
    return snapshot(Array.from({ length: 6 }, (_, n) => row("tail" + n, 20 - n)), 50, { page: 2, total_matches: 26 });
  }, signal());
  assert.equal(reads, 1); assert.equal(result.length, 26);
});
test("failed catchup does not commit a cursor or lose new bookings on retry", async () => {
  const tracker = new NewBookingTracker(); await tracker.collect(snapshot([], 1), noPage, signal());
  const first = snapshot([row("new", 11)], 20, { page_size: 1, total_matches: 2 });
  await assert.rejects(tracker.collect(first, async () => { throw Error("offline"); }, signal()));
  const result = await tracker.collect(first, async () => snapshot([row("next", 9)], 20), signal());
  assert.equal(result.length, 2);
});
test("missing creation evidence never produces a booking alert", async () => {
  const tracker = new NewBookingTracker(); await tracker.collect(snapshot([]), noPage, signal());
  await assert.rejects(tracker.collect(snapshot([row("bad", 11, { created_at: undefined })], 20), noPage, signal()));
});
const raw = "ABAAD-BOOKING:" + "a".repeat(64);
const lookup = (data, options = {}) => verifyBookingCode(raw, "/api/protocol/bookings", signal(), async (url, init) => {
  assert.equal(init.cache, "no-store"); assert.equal(init.method, undefined); assert.match(url, /token=a{64}/);
  return Response.json(data, options);
});
test("scan cannot report success before the fresh verification response; no checkin mutation", async () => {
  let resolve; const pending = new Promise(r => { resolve = r; });
  let settled = false;
  const work = verifyBookingCode(raw, "/api/protocol/bookings", signal(), async () => pending).then(x => { settled = true; return x; });
  await Promise.resolve(); assert.equal(settled, false);
  resolve(Response.json(snapshot([row()])));
  const result = await work;
  assert.equal(result.kind, "success"); assert.equal(result.booking.full_name, "ضيف معزول");
  assert.match(result.message, /تسجيل الوصول/);
});
test("malformed and unknown QR codes are rejected on distinct evidence", async () => {
  assert.equal((await verifyBookingCode("bad", "/api/protocol/bookings", signal(), () => assert.fail())).kind, "rejected");
  assert.match((await lookup(snapshot([]))).message, /غير معروف/);
});
test("cancelled, fully used and wrong-date bookings cannot play success; partial party is allowed", async () => {
  assert.match((await lookup(snapshot([row("x", 1, { status: "cancelled" })]))).message, /ملغى/);
  assert.match((await lookup(snapshot([row("x", 1, { checked_in_guest_count: 3 })]))).message, /سبق تسجيل/);
  assert.match((await lookup(snapshot([row("x", 1, { visit_date: "2026-11-01" })]))).message, /ليس لتاريخ اليوم/);
  assert.equal((await lookup(snapshot([row("x", 1, { checked_in_guest_count: 1 })]))).kind, "success");
});
test("offline, failed server and malformed response are connection errors, never invalid QR claims", async () => {
  assert.equal((await verifyBookingCode(raw, "/api/protocol/bookings", signal(), async () => { throw Error("offline"); })).kind, "connection");
  assert.equal((await lookup({}, { status: 503 })).kind, "connection");
  assert.equal((await lookup({ bookings: [] })).kind, "connection");
  assert.equal((await lookup(snapshot([row("x", 1, { guest_count: -1 })]))).kind, "connection");
  assert.equal((await lookup(snapshot([row()], 10, { observed_at: "bad" }))).kind, "connection");
});
test("access denial is a clear refusal rather than a nonexistent booking", async () => {
  const result = await lookup({}, { status: 403 });
  assert.equal(result.kind, "rejected"); assert.match(result.message, /صلاحية/);
});
test("repeat frames, concurrent scans and rapid retry emit one verification; intentional retry is allowed later", () => {
  let time = 0; const gate = new ScanGate(() => time);
  assert.equal(gate.enter(raw), true); assert.equal(gate.enter(raw), false); assert.equal(gate.enter("other"), false);
  gate.leave(); assert.equal(gate.enter(raw), false); time = 2501;
  assert.equal(gate.enter(raw), true);
});
function audioFixture({ stored = null, blocked = false, unsupported = false } = {}) {
  const nodes = [], values = new Map([["key", stored]]), states = [];
  let resumes = 0;
  const ctx = { state: "suspended", currentTime: 0, destination: {}, onstatechange: null,
    resume: async () => { resumes++; if (blocked) throw Error("blocked"); ctx.state = "running"; ctx.onstatechange?.(); },
    close: async () => { ctx.state = "closed"; },
    createOscillator: () => { const node = { frequency: {}, connect() {}, disconnect() {}, start(at) { this.startAt = at; }, stop(at) { this.stopAt = at; } }; nodes.push(node); return node; },
    createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }),
  };
  const controller = new SoundController(() => { if (unsupported) throw Error("unsupported"); return ctx; }, { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) }, "key", s => states.push(s));
  return { controller, nodes, ctx, values, states, resumes: () => resumes };
}
test("no autoplay; muted/locked events are not queued for later replay and IDs deduplicate", async () => {
  const f = audioFixture(); assert.equal(f.controller.status, "locked");
  assert.equal(f.controller.play("new_booking", "old"), false); assert.equal(f.resumes(), 0);
  await f.controller.enable(); assert.equal(f.controller.status, "ready");
  assert.equal(f.controller.play("new_booking", "old"), false);
  assert.equal(f.controller.play("new_booking", "fresh"), true);
  const count = f.nodes.length; assert.equal(f.controller.play("new_booking", "fresh"), false); assert.equal(f.nodes.length, count);
  f.controller.dispose();
});
test("autoplay refusal and interrupted Safari-like context never claim ready", async () => {
  const blocked = audioFixture({ blocked: true }); await blocked.controller.enable(); assert.equal(blocked.controller.status, "locked"); blocked.controller.dispose();
  const f = audioFixture(); await f.controller.enable();
  f.ctx.state = "suspended"; f.ctx.onstatechange();
  assert.equal(f.controller.status, "locked"); assert.equal(f.controller.play("scan_success", "s"), false); f.controller.dispose();
});
test("mute stops queued tones and persists employee preference; reactivation only sounds future events", async () => {
  const f = audioFixture({ stored: "off" }); assert.equal(f.controller.status, "muted");
  await f.controller.enable(); f.controller.play("scan_success", "first"); f.controller.mute();
  assert.equal(f.values.get("key"), "off"); assert.equal(f.controller.status, "muted");
  assert.ok(f.nodes.every(n => n.stopAt === undefined));
  assert.equal(f.controller.play("scan_error", "muted"), false);
  await f.controller.enable(); assert.equal(f.values.get("key"), "on");
  assert.equal(f.controller.play("scan_error", "muted"), false); assert.equal(f.controller.play("scan_error", "next"), true); f.controller.dispose();
});
test("three distinct tones use one non-overlapping bounded timeline", async () => {
  const f = audioFixture(); await f.controller.enable();
  f.controller.play("new_booking", "b"); f.controller.play("scan_success", "s"); f.controller.play("scan_error", "e");
  assert.ok(f.nodes[3].startAt > f.nodes[2].stopAt);
  assert.ok(f.nodes[5].startAt > f.nodes[4].stopAt);
  assert.equal(f.nodes[0].frequency.value, 660); assert.equal(f.nodes[3].frequency.value, 740); assert.equal(f.nodes[5].frequency.value, 330);
  for (let n = 0; n < 20; n++) f.controller.play("new_booking", "burst" + n);
  assert.ok(f.nodes.length < 30); f.controller.dispose();
});
test("sound controls reflect actual capability, retain clear touch labels and handle unsupported audio", async () => {
  const f = audioFixture({ unsupported: true }); await f.controller.enable(); assert.equal(f.controller.status, "unavailable"); f.controller.dispose();
  for (const status of ["locked", "muted", "unavailable"]) {
    const html = renderToStaticMarkup(SoundControl({ status, enable() {}, mute() {} }));
    assert.doesNotMatch(html, /الصوت مفعّل/); assert.match(html, /تفعيل التنبيهات الصوتية/);
  }
  assert.match(renderToStaticMarkup(SoundControl({ status: "ready", enable() {}, mute() {} })), /كتم الصوت/);
});
test("microsecond creation immediately after baseline is not truncated away", async () => {
  const tracker = new NewBookingTracker();
  await tracker.collect(snapshot([], 1, { observed_at: "2026-10-31T12:00:01.000123Z" }), noPage, signal());
  const result = await tracker.collect(snapshot([row("fast", 1, { created_at: "2026-10-31T12:00:01.000124Z" })], 2), noPage, signal());
  assert.equal(result.length, 1);
});
test("an insert committed after a prior read cannot fall behind a moving observation cursor", async () => {
  const tracker = new NewBookingTracker();
  await tracker.collect(snapshot([], 1), noPage, signal());
  await tracker.collect(snapshot([row("first", 15)], 20), noPage, signal());
  const result = await tracker.collect(snapshot([row("first", 15), row("late-commit", 14)], 30), noPage, signal());
  assert.equal(result.length, 1); assert.equal(result[0].id, "late-commit");
});
test("scan feedback takes priority when a rapid booking burst saturates the sound queue", async () => {
  const f = audioFixture(); await f.controller.enable();
  for (let n = 0; n < 10; n++) f.controller.play("new_booking", "batch" + n);
  assert.equal(f.controller.play("scan_error", "urgent-scan"), true);
  assert.equal(f.nodes.at(-2).frequency.value, 330);
  assert.equal(f.nodes.at(-2).startAt, 0);
  f.controller.dispose();
});
test("scan gesture reactivates an interrupted audio context without overriding a saved mute", async () => {
  const muted = audioFixture({ stored: "off" }); await muted.controller.unlock();
  assert.equal(muted.resumes(), 0); assert.equal(muted.controller.status, "muted"); muted.controller.dispose();
  const f = audioFixture(); await f.controller.enable(); f.ctx.state = "suspended"; f.ctx.onstatechange();
  await f.controller.unlock(); assert.equal(f.resumes(), 2); assert.equal(f.controller.status, "ready");
  assert.equal(f.nodes.length, 0); // Opening the camera must not play a false verification sound.
  assert.equal(f.controller.play("scan_success", "verified"), true); f.controller.dispose();
});
test("explicit sound test really schedules audible source nodes after activation", async () => {
  const f = audioFixture(); await f.controller.test();
  assert.equal(f.controller.status, "ready"); assert.equal(f.nodes.length, 2);
  assert.ok(f.nodes.every(node => node.type === "triangle"));
  await f.controller.test(); assert.equal(f.nodes.length, 4); f.controller.dispose();
});
test("a deliberate new camera session permits the same QR while repeated frames remain gated", () => {
  const gate = new ScanGate(() => 0);
  assert.equal(gate.enter(raw), true); gate.reset(); assert.equal(gate.enter(raw), false);
  gate.leave(); gate.reset(); assert.equal(gate.enter(raw), true); assert.equal(gate.enter(raw), false);
});
test("fresh scan details cannot regress to an older list cache after verification", () => {
  const { currentScannedBooking } = load("src/lib/bookings/scan.ts");
  const verified = row("checked", 1, { updated_at: at(20), checked_in_guest_count: 1 });
  assert.equal(currentScannedBooking(verified, [row("checked", 1, { updated_at: at(10) })]), verified);
  const updated = row("checked", 1, { updated_at: at(30), checked_in_guest_count: 2 });
  assert.equal(currentScannedBooking(verified, [updated]), updated);
});
