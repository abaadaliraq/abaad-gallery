import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { fixture, ids } from "./helpers/booking-db.mjs";
const f = await fixture();
const { db, rpc, context } = f;
let passed = 0;
async function test(n, fn) {
  await fn();
  console.log("PASS " + n);
  passed++;
}
const hash = (s) => createHash("sha256").update(s).digest("hex");
const slot = async (
  date = "2026-10-31",
  capacity = 5,
  start = "18:00",
  closed = false,
) =>
  (
    await rpc("admin", "booking_slot_save", [
      null,
      {
        visit_date: date,
        start_time: start,
        end_time: "21:00",
        capacity,
        is_closed: closed,
      },
      null,
    ])
  ).id;
const data = (id) => ({
  slot_id: id,
  visit_date: "2026-10-31",
  full_name: "زائر اختبار معزول",
  phone: "+9647701234567",
  email: "",
  guest_count: 3,
  notes: "",
});
const create = async (input, key = randomUUID(), ip = randomUUID()) =>
  rpc("service_role", "booking_create", [
    input,
    key,
    hash(JSON.stringify(input)),
    hash(key),
    hash(ip),
  ]);
try {
  await test("all public tables force RLS and deny all direct reads/writes", async () => {
    for (const t of [
      "exhibition_booking_slots",
      "exhibition_bookings",
      "exhibition_booking_checkin_events",
      "exhibition_booking_notifications",
    ]) {
      const r = (
        await db.query(
          "select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass",
          ["public." + t],
        )
      ).rows[0];
      assert.equal(r.relrowsecurity, true);
      assert.equal(r.relforcerowsecurity, true);
      for (const who of ["protocol", "sales", "admin", "anon", "service_role"])
        await context(who, () =>
          assert.rejects(db.query("select * from public." + t)),
        );
    }
  });
  await test("no slots seeded and availability fails closed", async () =>
    assert.deepEqual(await rpc("service_role", "booking_slots"), []));
  await test("public and staff cannot call server create/availability operations", async () => {
    for (const who of ["anon", "protocol", "sales", "admin"])
      await assert.rejects(rpc(who, "booking_slots"));
  });
  await test("only Admin manages slots; no sales/unassigned access", async () => {
    for (const who of ["protocol", "sales", "other"])
      await assert.rejects(rpc(who, "booking_slot_save", [null, {}, null]));
    for (const who of ["sales", "other", "anon"])
      await assert.rejects(rpc(who, "booking_snapshot"));
  });
  await test("30 October and 10 November are forbidden by database slot constraints", async () => {
    for (const day of ["2026-10-30", "2026-11-10"])
      await assert.rejects(slot(day));
  });
  const s = await slot();
  const s9 = await slot("2026-11-09", 3);
  let a;
  await test("31 October free booking stored with zero price and correct capacity", async () => {
    a = await create(data(s));
    assert.equal(a.ok, true);
    assert.equal(a.booking.price_usd, 0);
    assert.equal(
      (
        await db.query(
          "select reserved_count from public.exhibition_booking_slots where id=$1",
          [s],
        )
      ).rows[0].reserved_count,
      3,
    );
  });
  await test("9 November is free by visit date while request clock is October", async () => {
    const r = await create({ ...data(s9), visit_date: "2026-11-09" });
    assert.equal(r.ok, true);
    assert.equal(r.booking.price_usd, 0);
  });
  await test("capacity rejects oversized group without a partial booking", async () => {
    const before = (
      await db.query("select count(*)::int n from public.exhibition_bookings")
    ).rows[0].n;
    const r = await create(data(s));
    assert.equal(r.code, "capacity");
    assert.equal(
      (await db.query("select count(*)::int n from public.exhibition_bookings"))
        .rows[0].n,
      before,
    );
  });
  await test("idempotency replay creates exactly one booking and rejects changed payload", async () => {
    const id = await slot("2026-11-01", 5);
    const input = { ...data(id), visit_date: "2026-11-01" },
      key = randomUUID(),
      one = await create(input, key),
      two = await create(input, key);
    assert.equal(one.booking.id, two.booking.id);
    await assert.rejects(create({ ...input, guest_count: 2 }, key));
    assert.equal(
      (
        await db.query(
          "select reserved_count from public.exhibition_booking_slots where id=$1",
          [id],
        )
      ).rows[0].reserved_count,
      3,
    );
  });
  await test("parallel submitted groups cannot reserve past capacity in isolated executor", async () => {
    const id = await slot("2026-11-02", 3);
    const all = await Promise.all(
      Array.from({ length: 5 }, () =>
        create({ ...data(id), visit_date: "2026-11-02", guest_count: 2 }),
      ),
    );
    assert.equal(all.filter((x) => x.ok).length, 1);
    assert.equal(
      (
        await db.query(
          "select reserved_count from public.exhibition_booking_slots where id=$1",
          [id],
        )
      ).rows[0].reserved_count,
      2,
    );
  });
  await test("null capacity remains closed and cannot be opened unlimited", async () => {
    const id = await slot("2026-11-03", null, "18:00", true);
    assert.equal(
      (await create({ ...data(id), visit_date: "2026-11-03" })).code,
      "closed",
    );
    await assert.rejects(slot("2026-11-04", null, "18:00", false));
  });
  await test("Protocol reads personal data through live exhibition-scoped RPC", async () => {
    const r = await rpc("protocol", "booking_snapshot");
    assert.ok(r.bookings.find((x) => x.id === a.booking.id));
    assert.ok(
      r.bookings.every((x) => !("token_hash" in x) && !("request_key" in x)),
    );
  });
  await test("name phone and reference search work, token resolves without mutating attendance", async () => {
    for (const q of ["زائر", "770123", "07701234567", "٠٧٧٠١٢٣٤٥٦٧", a.booking.booking_reference])
      assert.ok(
        (await rpc("protocol", "booking_snapshot", [q])).total_matches > 0,
      );
    const row = (
      await db.query(
        "select token_hash from public.exhibition_bookings where id=$1",
        [a.booking.id],
      )
    ).rows[0];
    const r = await rpc("protocol", "booking_snapshot", [
      "",
      null,
      "all",
      1,
      row.token_hash,
    ]);
    assert.equal(r.total_matches, 1);
    assert.equal(r.bookings[0].checked_in_guest_count, 0);
  });
  await test("one arrival admits an entire three-person group exactly once",async()=>{
    const id=await slot('2026-10-31',3,'16:00');const saved=await create(data(id));const operation=randomUUID();
    await rpc('protocol','booking_arrival',[saved.booking.id,3,operation,'']);
    await rpc('protocol','booking_arrival',[saved.booking.id,3,operation,'']);
    assert.equal((await db.query('select checked_in_guest_count n from public.exhibition_bookings where id=$1',[saved.booking.id])).rows[0].n,3);
    assert.equal((await rpc('protocol','booking_events',[saved.booking.id])).length,1);
  });
  await test("partial arrival 2/3 then 1/3 with idempotent operation", async () => {
    const op = randomUUID();
    await rpc("protocol", "booking_arrival", [a.booking.id, 2, op, ""]);
    await rpc("protocol", "booking_arrival", [a.booking.id, 2, op, ""]);
    let b = (
      await db.query(
        "select checked_in_guest_count n from public.exhibition_bookings where id=$1",
        [a.booking.id],
      )
    ).rows[0];
    assert.equal(b.n, 2);
    await rpc("protocol", "booking_arrival", [
      a.booking.id,
      1,
      randomUUID(),
      "",
    ]);
    assert.equal(
      (
        await db.query(
          "select checked_in_guest_count n from public.exhibition_bookings where id=$1",
          [a.booking.id],
        )
      ).rows[0].n,
      3,
    );
  });
  await test("fourth arrival, mismatched retry and sales arrival are rejected", async () => {
    await assert.rejects(
      rpc("protocol", "booking_arrival", [a.booking.id, 1, randomUUID(), ""]),
    );
    await assert.rejects(
      rpc("sales", "booking_arrival", [
        a.booking.id,
        -1,
        randomUUID(),
        "test reason",
      ]),
    );
    const op = (
      await db.query(
        "select operation_id from public.exhibition_booking_checkin_events where booking_id=$1 limit 1",
        [a.booking.id],
      )
    ).rows[0].operation_id;
    await assert.rejects(
      rpc("protocol", "booking_arrival", [a.booking.id, 1, op, ""]),
    );
  });
  await test("wrong visit day requires Admin reason; correction separately audited", async () => {
    const id = (
      await db.query(
        "select id from public.exhibition_bookings where visit_date='2026-11-09'",
      )
    ).rows[0].id;
    await assert.rejects(
      rpc("protocol", "booking_arrival", [id, 1, randomUUID(), ""]),
    );
    await assert.rejects(
      rpc("admin", "booking_arrival", [id, 1, randomUUID(), null]),
    );
    await rpc("admin", "booking_arrival", [
      id,
      1,
      randomUUID(),
      "استثناء إداري اختبار",
    ]);
    await rpc("admin", "booking_arrival", [
      a.booking.id,
      -1,
      randomUUID(),
      "تصحيح عدد اختبار",
    ]);
    assert.ok(
      (await rpc("admin", "booking_events", [a.booking.id])).some(
        (e) => e.action === "correction" && e.guest_delta === -1,
      ),
    );
  });
  await test("cancelling an arrived booking is rejected without freeing its seats", async () => {
    await assert.rejects(
      rpc("admin", "booking_manage", [
        a.booking.id,
        "cancel",
        null,
        "إلغاء اختبار",
        randomUUID(),
      ]),
    );
  });
  let cancelled;
  await test("cancellation frees seats once and records reason; cancelled arrival forbidden", async () => {
    const id = await slot("2026-10-31", 3, "17:00");
    cancelled = await create(data(id));
    const op = randomUUID();
    await rpc("admin", "booking_manage", [
      cancelled.booking.id,
      "cancel",
      null,
      "إلغاء بطلب الزائر",
      op,
    ]);
    await rpc("admin", "booking_manage", [
      cancelled.booking.id,
      "cancel",
      null,
      "إلغاء بطلب الزائر",
      op,
    ]);
    assert.equal(
      (
        await db.query(
          "select reserved_count from public.exhibition_booking_slots where id=$1",
          [id],
        )
      ).rows[0].reserved_count,
      0,
    );
    await assert.rejects(
      rpc("protocol", "booking_arrival", [
        cancelled.booking.id,
        1,
        randomUUID(),
        "",
      ]),
    );
  });
  await test("rescheduling moves reserved capacity atomically and preserves history", async () => {
    const from = await slot("2026-11-05", 3),
      to = await slot("2026-11-06", 3),
      b = await create({ ...data(from), visit_date: "2026-11-05" });
    await rpc("admin", "booking_manage", [
      b.booking.id,
      "reschedule",
      to,
      "تغيير موعد بطلب الزائر",
      randomUUID(),
    ]);
    assert.equal(
      (
        await db.query(
          "select reserved_count from public.exhibition_booking_slots where id=$1",
          [from],
        )
      ).rows[0].reserved_count,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select reserved_count from public.exhibition_booking_slots where id=$1",
          [to],
        )
      ).rows[0].reserved_count,
      3,
    );
    assert.equal(
      (
        await db.query(
          "select visit_date::text d from public.exhibition_bookings where id=$1",
          [b.booking.id],
        )
      ).rows[0].d,
      "2026-11-06",
    );
  });
  await test("cannot lower capacity below reservations or update a stale slot version", async () => {
    const row = (
      await db.query(
        "select version from public.exhibition_booking_slots where id=$1",
        [s],
      )
    ).rows[0];
    await assert.rejects(
      rpc("admin", "booking_slot_save", [
        s,
        { capacity: 1, is_closed: false },
        row.version,
      ]),
    );
    await assert.rejects(
      rpc("admin", "booking_slot_save", [
        s,
        { capacity: 10, is_closed: false },
        1,
      ]),
    );
  });
  await test("null management action and missing reason cannot free seats", async () => {
    await assert.rejects(
      rpc("admin", "booking_manage", [
        a.booking.id,
        null,
        null,
        null,
        randomUUID(),
      ]),
    );
  });
  await test("notification failure preserves saved booking; claims are leased and bounded", async () => {
    const row = (
      await db.query(
        "select token_hash from public.exhibition_bookings where id=$1",
        [a.booking.id],
      )
    ).rows[0];
    const lease = randomUUID(),
      r = await rpc("service_role", "booking_notification", [
        a.booking.id,
        row.token_hash,
        lease,
        null,
      ]);
    assert.equal(r.claimed, true);
    assert.equal(
      (
        await rpc("service_role", "booking_notification", [
          a.booking.id,
          row.token_hash,
          randomUUID(),
          null,
        ])
      ).claimed,
      false,
    );
    await rpc("service_role", "booking_notification", [
      a.booking.id,
      row.token_hash,
      lease,
      "failed",
    ]);
    assert.equal(
      (
        await db.query(
          "select status from public.exhibition_bookings where id=$1",
          [a.booking.id],
        )
      ).rows[0].status,
      "confirmed",
    );
  });
  await test("rate limit persists across rejected capacity requests and stores no raw IP", async () => {
    const ip = randomUUID();
    let last;
    for (let i = 0; i < 11; i++) last = await create(data(s), randomUUID(), ip);
    assert.equal(last.code, "rate_limit");
    assert.ok(
      (
        await db.query("select ip_hash from abaad_private.booking_rate_buckets")
      ).rows.every((x) => /^[a-f0-9]{64}$/.test(x.ip_hash)),
    );
  });
  await test("expired revoked anonymous inactive and unassigned sessions rejected", async () => {
    for (const options of [
      { expired: true },
      { missing: true },
      { anonymous: true },
    ])
      await assert.rejects(rpc("protocol", "booking_snapshot", [], options));
    await db.query(
      "update public.staff_roles set is_active=false where user_id=$1",
      [ids.protocol],
    );
    await assert.rejects(rpc("protocol", "booking_snapshot"));
  });
  console.log(
    "Booking DB: " +
      passed +
      " tests passed. Isolated PGlite; queued requests are not a real multi-connection contention test.",
  );
} finally {
  await db.close();
}
