import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers/load-ts.mjs";
const {
  validateStaff,
  staffMatches,
  saleEventKind,
  filterActivities,
  baghdadDateRange,
} = load("src/lib/admin/domain.ts");
const id = "10000000-0000-4000-8000-000000000001",
  ex = "10000000-0000-4000-8000-000000000002",
  stamp = "2026-10-27T09:00:00.123456+00:00";
const input = {
  user_id: id,
  full_name: "موظف اختبار",
  role: "protocol",
  is_active: true,
  exhibition_ids: [ex],
  expected_updated_at: stamp,
};
test("staff validation preserves precise expected version and explicit memberships", () => {
  const value = validateStaff(input).value;
  assert.equal(value.expected_updated_at, stamp);
  assert.equal(value.exhibition_ids[0], ex);
});
for (const change of [
  { role: "owner" },
  { is_active: "yes" },
  { exhibition_ids: ["invalid"] },
  { user_id: "invalid" },
  { expected_updated_at: "invalid" },
  { full_name: "x" },
])
  test("invalid staff payload " + Object.keys(change)[0], () =>
    assert.ok(validateStaff({ ...input, ...change }).error),
  );
test("Arabic name and email staff search normalize", () => {
  assert.equal(
    staffMatches("أَمين اختبار", "AMIN@example.invalid", "امين"),
    true,
  );
  assert.equal(
    staffMatches("أَمين اختبار", "AMIN@example.invalid", "amin@"),
    true,
  );
  assert.equal(staffMatches("أمين", null, "مختلف"), false);
});
test("activity kinds derive only from stored prior and next states", () => {
  assert.equal(saleEventKind(null, "available"), "artwork_added");
  assert.equal(saleEventKind("available", "reserved"), "reserve");
  assert.equal(saleEventKind("reserved", "sold"), "sell");
  assert.equal(saleEventKind("reserved", "available"), "cancel_reservation");
  assert.equal(saleEventKind("sold", "available"), "correct_status");
});
test("Baghdad dates use inclusive local start and exclusive next-day end", () => {
  const range = baghdadDateRange("2026-10-27", "2026-10-27");
  assert.equal(range.from, "2026-10-26T21:00:00.000Z");
  assert.equal(range.to, "2026-10-27T21:00:00.000Z");
});
for (const pair of [
  ["2026-02-31", ""],
  ["bad", ""],
  ["2026-10-28", "2026-10-27"],
])
  test("invalid activity date range " + pair.join("/"), () =>
    assert.throws(() => baghdadDateRange(...pair)),
  );
test("activity filtering uses event time and responsible employee", () => {
  const events = [
    {
      id: "1",
      department: "protocol",
      kind: "check_in",
      actor_id: id,
      created_at: "2026-10-27T08:00:00Z",
    },
    {
      id: "2",
      department: "sales",
      kind: "sell",
      actor_id: ex,
      created_at: "2026-10-27T09:00:00Z",
    },
  ];
  const rows = filterActivities(events, {
    department: "protocol",
    actor: id,
    from: "2026-10-27T07:00:00Z",
    to: "2026-10-27T09:00:00Z",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].created_at, events[0].created_at);
});
function actions(
  role = "admin",
  response = { data: { ok: true }, error: null },
) {
  const calls = [];
  const api = load("src/lib/admin/actions.ts", {
    "./access": {
      adminClient: async () => {
        if (role !== "admin") throw Error("DENIED");
        return {
          staff: { user_id: ex, role: "admin" },
          client: {
            rpc: async (name, args) => {
              calls.push({ name, args });
              return response;
            },
          },
        };
      },
    },
  });
  return { api, calls };
}
for (const role of ["protocol", "sales"])
  test(role + " cannot invoke staff or review actions", async () => {
    const f = actions(role);
    await assert.rejects(f.api.updateStaff(input));
    await assert.rejects(f.api.approveGuest(id, stamp, stamp));
    assert.equal(f.calls.length, 0);
  });
test("server action cannot disable or demote current administrator", async () => {
  const f = actions();
  assert.equal(
    (await f.api.updateStaff({ ...input, user_id: ex, role: "sales" })).ok,
    false,
  );
  assert.equal(f.calls.length, 0);
});
test("explicit guest approval sends only identity and expected versions", async () => {
  const f = actions();
  assert.equal((await f.api.approveGuest(id, stamp, stamp)).ok, true);
  assert.equal(
    Object.keys(f.calls[0].args).sort().join(","),
    "p_guest_updated_at,p_invitation_id,p_invitation_updated_at",
  );
});
test("stale approval never reports success", async () => {
  const f = actions("admin", {
    data: { ok: false, code: "stale" },
    error: null,
  });
  assert.equal((await f.api.approveGuest(id, stamp, stamp)).ok, false);
});
test("missing SQL remains a pending error rather than simulated approval", async () => {
  const f = actions("admin", { data: null, error: { code: "PGRST202" } });
  const result = await f.api.approveGuest(id, stamp, stamp);
  assert.equal(result.ok, false);
  assert.match(result.error, /admin.sql/);
});
function builder(result) {
  const b = {};
  for (const key of ["select", "eq", "in", "order", "limit", "gte", "lt"])
    b[key] = () => b;
  b.then = (ok, bad) => Promise.resolve(result).then(ok, bad);
  return b;
}
const exhibit = { id: ex, slug: "test", name: "معرض اختبار", is_active: true };
function queryApi({ role = "admin", salesError = false, pending = true } = {}) {
  let calls = 0;
  const client = {
    from: (table) => {
      if (table === "protocol_exhibitions")
        return builder({ data: [exhibit], error: null });
      if (table === "protocol_invitations")
        return builder({ data: [], error: null, count: 11 });
      return builder({ data: [], error: null });
    },
    rpc: async (name) => {
      calls++;
      if (name === "admin_staff_directory")
        return pending
          ? { data: null, error: { code: "PGRST202" } }
          : {
              data: {
                staff: [],
                exhibitions: [exhibit],
                total: 0,
                active_count: 0,
                capabilities: { guest_review: true },
              },
              error: null,
            };
      if (name === "protocol_snapshot")
        return { data: { total: 34, checked_in: 0, pending: 34 }, error: null };
      if (name === "sales_snapshot")
        return salesError
          ? { data: null, error: { code: "offline" } }
          : {
              data: { total: 0, available: 0, reserved: 0, sold: 0 },
              error: null,
            };
    },
  };
  const api = load("src/lib/admin/queries.ts", {
    "./access": {
      adminClient: async () => {
        if (role !== "admin") throw Error("DENIED");
        return { client, staff: { user_id: id, full_name: "مدير اختبار" } };
      },
    },
    "@/lib/protocol/config": { protocolSlug: () => "test" },
    "@/lib/protocol/queries": {
      privateHeaders: { "Cache-Control": "private, no-store" },
    },
  });
  return { api, count: () => calls };
}
test("overview distinguishes confirmed zero from missing staff RPC", async () => {
  const f = queryApi();
  const response = await f.api.adminResponse(
    new Request("https://local.invalid/api/admin/overview"),
    "overview",
  );
  const data = await response.json();
  assert.equal(data.protocol.data.review_required, 11);
  assert.equal(data.sales.data.total, 0);
  assert.equal(data.staff.state, "pending");
  assert.equal("data" in data.staff, false);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});
test("failed sales query never becomes a zero statistic", async () => {
  const f = queryApi({ salesError: true });
  const data = await (
    await f.api.adminResponse(
      new Request("https://local.invalid/api/admin/overview"),
      "overview",
    )
  ).json();
  assert.equal(data.sales.state, "error");
  assert.equal("data" in data.sales, false);
});
for (const role of ["protocol", "sales"])
  test(role + " is denied before admin reads", async () => {
    const f = queryApi({ role });
    await assert.rejects(
      f.api.adminResponse(
        new Request("https://local.invalid/api/admin/overview"),
        "overview",
      ),
    );
    assert.equal(f.count(), 0);
  });
test("generic guest edit cannot clear an existing review flag or accept arrival fields", async () => {
  const calls = [];
  const api = load("src/lib/protocol/actions.ts", {
    "@/lib/auth/authorization": {
      requireRole: async (r) => {
        assert.equal(r, "admin");
      },
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { review_required: true },
                error: null,
              }),
            }),
          }),
        }),
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { error: null };
        },
      }),
    },
    "./config": {
      cloudinaryConfig: () => ({ cloudName: "dyqdfbaln" }),
      protocolSlug: () => "test",
    },
  });
  const result = await api.saveGuest(
    id,
    {
      full_name_ar: "ضيف اختبار",
      review_required: false,
      checked_in_at: "FAKE",
      checked_in_by: "FAKE",
    },
    "selected-exhibition",
  );
  assert.equal(result.ok, true);
  assert.equal(calls[0].args.p_data.review_required, true);
  assert.equal(calls[0].args.p_slug, "selected-exhibition");
  assert.equal("checked_in_at" in calls[0].args.p_data, false);
  assert.equal("checked_in_by" in calls[0].args.p_data, false);
});

test("administrative API refreshes a writable cookie client before the role guard", async () => {
  const order = [];
  const client = {
    auth: {
      getUser: async () => {
        order.push("refresh");
      },
    },
  };
  const api = load("src/lib/admin/access.ts", {
    "@/lib/supabase/server": {
      createClient: async (options) => {
        assert.equal(options.writable, true);
        order.push("client");
        return client;
      },
    },
    "@/lib/auth/authorization": {
      requireRole: async (role) => {
        assert.equal(role, "admin");
        order.push("guard");
        return { user_id: id };
      },
    },
  });
  await api.adminClient();
  assert.equal(order.join(","), "client,refresh,guard");
});
test("review filter includes records beyond the first snapshot page", async () => {
  const rows = Array.from({ length: 34 }, (_, i) => ({
    id: "10000000-0000-4000-8000-" + String(i + 100).padStart(12, "0"),
    guest_id: "20000000-0000-4000-8000-" + String(i + 100).padStart(12, "0"),
    full_name_ar: "ضيف اختبار " + i,
    review_required: i >= 23,
  }));
  const snapshot = {
    exhibition_id: ex,
    observed_at: stamp,
    total: 34,
    checked_in: 0,
    pending: 34,
    total_matches: 34,
    page: 1,
    page_size: 24,
    categories: [],
  };
  const client = {
    rpc: async (name, args) =>
      ["admin_staff_directory", "admin_guest_page"].includes(name)
        ? { data: null, error: { code: "PGRST202" } }
        : {
            data: {
              ...snapshot,
              guests: rows.slice((args.p_page - 1) * 24, args.p_page * 24),
            },
            error: null,
          },
    from: (table) =>
      builder(
        table === "protocol_exhibitions"
          ? { data: [exhibit], error: null }
          : table === "protocol_invitations"
            ? {
                data: rows.map((g) => ({
                  id: g.id,
                  guest_id: g.guest_id,
                  updated_at: stamp,
                })),
                error: null,
                count: 11,
              }
            : {
                data: rows.map((g) => ({ id: g.guest_id, updated_at: stamp })),
                error: null,
              },
      ),
  };
  const api = load("src/lib/admin/queries.ts", {
    "./access": {
      adminClient: async () => ({
        client,
        staff: { user_id: id, full_name: "مدير اختبار" },
      }),
    },
    "@/lib/protocol/config": { protocolSlug: () => "test" },
    "@/lib/protocol/queries": { privateHeaders: {} },
  });
  const response = await api.adminResponse(
    new Request(
      "https://local.invalid/api/admin/guest-management?review=pending",
    ),
    "guests",
  );
  const data = await response.json();
  assert.equal(data.review_total, 11);
  assert.equal(data.total_matches, 11);
  assert.equal(data.guests.length, 11);
  assert.equal(data.review_ready, false);
  assert.ok(data.guests.every((g) => g.review_required));
});

const jsxOverrides = {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "next/link": { default: (props) => React.createElement("a", props) },
};
test("pending statistics render dashes rather than zero counters", () => {
  const Component = load(
    "src/components/admin/AdminStats.tsx",
    jsxOverrides,
  ).default;
  const html = renderToStaticMarkup(
    React.createElement(Component, {
      title: "اختبار",
      state: { state: "pending", message: "بانتظار SQL" },
      items: [["إجمالي", "total"]],
    }),
  );
  assert.match(html, /—/);
  assert.match(html, /بانتظار SQL/);
});
test("empty activity is confirmed separately from a failed activity query", () => {
  const Component = load(
    "src/components/admin/RecentActivity.tsx",
    jsxOverrides,
  ).default;
  const empty = renderToStaticMarkup(
    React.createElement(Component, {
      result: { events: [], total: 0, truncated: false, errors: [] },
      full: true,
    }),
  );
  assert.match(empty, /لا توجد عمليات مسجلة حتى الآن/);
  const failed = renderToStaticMarkup(
    React.createElement(Component, {
      result: {
        events: [],
        total: 0,
        truncated: false,
        errors: ["READ FAILED"],
      },
      full: true,
    }),
  );
  assert.doesNotMatch(failed, /لا توجد عمليات مسجلة حتى الآن/);
  assert.match(failed, /تعذر تأكيد/);
});
test("activity displays stored event timestamp without page refresh timestamps", () => {
  const Component = load(
    "src/components/admin/RecentActivity.tsx",
    jsxOverrides,
  ).default;
  const time = "2020-01-02T03:04:05Z";
  const html = renderToStaticMarkup(
    React.createElement(Component, {
      result: {
        events: [
          {
            id: "1",
            department: "protocol",
            kind: "check_in",
            subject: "اختبار",
            actor_id: id,
            actor_name: "موظف اختبار",
            created_at: time,
            reason: null,
          },
        ],
        total: 1,
        truncated: false,
        errors: [],
      },
    }),
  );
  assert.ok(html.includes(time));
});

function newGuestAction(report) {
  const calls = [];
  const api = load("src/lib/protocol/actions.ts", {
    "@/lib/auth/authorization": {
      requireRole: async (required) => assert.equal(required, "admin"),
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: report, error: null };
        },
      }),
    },
    "./config": {
      protocolSlug: () => "test",
      cloudinaryConfig: () => ({ cloudName: "dyqdfbaln" }),
    },
  });
  return { api, calls };
}
test("manual guest creation uses existing locked deduplication and cannot adopt a CSV identity", async () => {
  const f = newGuestAction({
    succeeded: 1,
    updated: 0,
    duplicated: 0,
    failed: 0,
  });
  assert.equal(
    (
      await f.api.saveGuest(null, {
        full_name_ar: "ضيف اختبار جديد",
        source_key: "forged-source",
        source_record_key: "1",
      })
    ).ok,
    true,
  );
  assert.equal(f.calls[0].name, "protocol_merge_import");
  assert.equal(f.calls[0].args.p_rows[0].source_key, "");
  assert.equal(f.calls[0].args.p_rows[0].source_record_key, "");
});
test("an existing guest is not reported as a successful new addition", async () => {
  for (const report of [
    { succeeded: 0, updated: 0, duplicated: 1, failed: 0 },
    { succeeded: 0, updated: 1, duplicated: 0, failed: 0 },
  ]) {
    const f = newGuestAction(report);
    assert.equal(
      (await f.api.saveGuest(null, { full_name_ar: "ضيف اختبار" })).ok,
      false,
    );
  }
});
