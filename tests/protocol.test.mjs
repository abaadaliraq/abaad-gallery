import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers/load-ts.mjs";
const { normalizeSearch, matchesGuest, guestKey, initials } = load(
  "src/lib/protocol/search.ts",
);
const { previewCsv, parseCsv } = load("src/lib/protocol/csv.ts");
const { photoReference, validateGuest } = load(
  "src/lib/protocol/validation.ts",
);
const guest = {
  full_name_ar: "أَمين   اختبار",
  full_name_en: "Amin Test",
  official_title: "وزير اختبار",
  organization: "مؤسسة الاختبار",
};
test("Arabic hamza, diacritics, tatweel and repeated spaces normalize", () => {
  assert.equal(normalizeSearch("  أَميــن  إختبار "), "امين اختبار");
});
for (const query of ["امين", "AMIN", "وزير", "مؤسسة"])
  test("search matches " + query, () => {
    assert.equal(matchesGuest(guest, query), true);
  });
test("a nonmatching search is empty", () =>
  assert.equal(matchesGuest(guest, "غير موجود"), false));
test("initials use at most two names", () =>
  assert.equal(initials("ضيف اختبار ثالث"), "ض ا"));
test("dedupe ignores only normalization differences", () =>
  assert.equal(
    guestKey(guest),
    guestKey({ ...guest, full_name_ar: "امين اختبار" }),
  ));
test("CSV supports BOM, quotes, CRLF and embedded newlines", () => {
  const rows = parseCsv(
    '\ufefffull_name_ar,internal_notes\r\n"ضيف اختبار","سطر 1\nسطر 2"',
  );
  assert.equal(rows[1][1], "سطر 1\nسطر 2");
});
test("CSV supports semicolon separated Excel files", () =>
  assert.equal(
    parseCsv("full_name_ar;official_title\nضيف اختبار;صفة اختبار")[1].length,
    2,
  ));
test("CSV supports escaped quote characters", () =>
  assert.equal(
    parseCsv('full_name_ar,internal_notes\nضيف اختبار,"قال ""نعم"""')[1][1],
    'قال "نعم"',
  ));
test("CSV rejects unclosed quotes", () =>
  assert.throws(() => parseCsv('name\n"bad')));
test("CSV rejects missing required name header", () =>
  assert.ok(previewCsv("organization\nTest").errors.length));
test("CSV rejects duplicate headers", () =>
  assert.ok(
    previewCsv("full_name_ar,full_name_ar\nضيف اختبار,ضيف اختبار").errors
      .length,
  ));
test("CSV preview flags duplicates before import", () => {
  const result = previewCsv(
    "full_name_ar,official_title\nأمين اختبار,وزير اختبار\nأَمين اختبار,وزير اختبار",
  );
  assert.ok(result.errors.some((e) => e.message.includes("مكرر")));
});
test("CSV preview validates dynamic category labels", () => {
  const result = previewCsv("الاسم,التصنيف\nضيف اختبار,غير معروف", [
    "شخصيات رسمية",
  ]);
  assert.ok(result.errors.length);
});
test("CSV refuses more than 200 guests", () =>
  assert.throws(() =>
    parseCsv("full_name_ar\n" + Array(201).fill("ضيف اختبار").join("\n")),
  ));
test("CSV refuses oversized files before parsing", () =>
  assert.throws(() => parseCsv("full_name_ar\n" + "x".repeat(262145))));
test("guest names and field sizes are validated on the server domain layer", () => {
  assert.ok(validateGuest({ full_name_ar: "x" }).errors.length);
  assert.ok(
    validateGuest({ ...guest, internal_notes: "x".repeat(2001) }).errors.length,
  );
});
test("photo references accept plain Cloudinary IDs", () =>
  assert.equal(photoReference("guests/example-photo"), "guests/example-photo"));
test("photo URLs must belong to the configured cloud", () => {
  assert.equal(
    photoReference(
      "https://res.cloudinary.com/approved/image/upload/v123/folder/photo.jpg",
      "approved",
    ),
    "folder/photo.jpg",
  );
  assert.throws(() =>
    photoReference(
      "https://res.cloudinary.com/other/image/upload/photo.jpg",
      "approved",
    ),
  );
});
for (const photo of [
  "https://evil.example/photo.jpg",
  "../secret",
  "folder/../secret",
  "folder//file",
  "folder/test.svg",
  "folder/f_auto,q_auto/test",
])
  test("untrusted image reference is rejected: " + photo, () =>
    assert.throws(() => photoReference(photo, "approved")),
  );
function actions(
  role = "protocol",
  rpcResult = {
    data: { checked_in_at: "2026-01-01T10:00:00Z", already_checked_in: false },
    error: null,
  },
) {
  const called = [];
  const overrides = {
    "@/lib/auth/authorization": {
      requireRole: async (required) => {
        if (required !== role) throw new Error("DENIED");
        return { role };
      },
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        rpc: async (name, args) => {
          called.push({ name, args });
          return rpcResult;
        },
      }),
    },
    "./config": {
      protocolSlug: () => "test-only",
      cloudinaryConfig: () => null,
    },
  };
  return { api: load("src/lib/protocol/actions.ts", overrides), called };
}
const id = "30000000-0000-4000-8000-000000000001";
test("check-in sends no client supplied actor or timestamp", async () => {
  const f = actions();
  assert.equal((await f.api.recordArrival(id)).ok, true);
  assert.equal(Object.keys(f.called[0].args).join(","), "p_invitation_id");
});
test("invalid guest id causes no database write", async () => {
  const f = actions();
  assert.equal((await f.api.recordArrival("bad")).ok, false);
  assert.equal(f.called.length, 0);
});
test("failed database save never reports successful attendance", async () => {
  const f = actions("protocol", { data: null, error: { code: "offline" } });
  assert.equal((await f.api.recordArrival(id)).ok, false);
});
test("sales cannot invoke protocol check-in", async () => {
  const f = actions("sales");
  await assert.rejects(f.api.recordArrival(id), /DENIED/);
  assert.equal(f.called.length, 0);
});
test("protocol cannot import, edit or undo attendance", async () => {
  const f = actions();
  await assert.rejects(f.api.importGuests(""), /DENIED/);
  await assert.rejects(f.api.saveGuest(null, guest), /DENIED/);
  await assert.rejects(f.api.undoArrival(id, "reason"), /DENIED/);
});
test("admin correction requires a meaningful reason", async () => {
  const f = actions("admin");
  assert.equal((await f.api.undoArrival(id, "x")).ok, false);
  assert.equal(f.called.length, 0);
});
test("already checked-in response is propagated without fabricating an arrival", async () => {
  const f = actions("protocol", {
    data: { checked_in_at: "2026-01-01T10:00:00Z", already_checked_in: true },
    error: null,
  });
  assert.equal((await f.api.recordArrival(id)).already, true);
});

const {compareGuests,officialTitle}=load("src/lib/protocol/priority.ts");
test("priorities sort explicitly and never infer priority from category",()=>{const rows=["regular","vip","vvip","priority"].map(priority_level=>({...guest,priority_level,display_order:1}));assert.deepEqual(rows.sort(compareGuests).map(g=>g.priority_level),["vvip","vip","priority","regular"]);assert.equal(validateGuest({...guest,category:"official"}).value.priority_level,"regular");});
test("reviewed CSV fields and stable order-based source identity survive validation",()=>{const p=previewCsv("order,full_name_ar,category,priority_level,review_required,review_note\n32,ضيف اختبار,official,VVIP,YES,تأكيد الصفة",["شخصيات رسمية"],"dyqdfbaln","test-guests");assert.equal(p.errors.length,0);assert.equal(p.values[0].priority_level,"vvip");assert.equal(p.values[0].review_required,true);assert.equal(p.values[0].source_record_key,"32");assert.equal(p.values[0].category,"شخصيات رسمية");});
test("legacy CSV without order remains accepted without fabricated source ID",()=>{const p=previewCsv("full_name_ar\nضيف اختبار",null,"","test-guests");assert.equal(p.errors.length,0);assert.equal(p.values[0].source_key,"");});
test("invalid priority and review markers fail before import",()=>{assert.ok(validateGuest({...guest,priority_level:"gold"}).errors.length);assert.ok(validateGuest({...guest,review_required:"maybe"}).errors.length);});
test("photo ID must match approved Cloudinary URL",()=>{assert.ok(validateGuest({...guest,photo_public_id:"wrong",photo_url:"https://res.cloudinary.com/dyqdfbaln/image/upload/v123/right.jpg"},null,"dyqdfbaln").errors.length);assert.equal(validateGuest({...guest,photo_public_id:"right",photo_url:"https://res.cloudinary.com/dyqdfbaln/image/upload/v123/right.jpg"},null,"dyqdfbaln").errors.length,0);});
test("unconfirmed title is visibly pending for protocol and retained for administration",()=>{const row={official_title:"صفة مقدمة",review_required:true};assert.equal(officialTitle(row,"protocol"),"الصفة قيد المراجعة الإدارية");assert.equal(officialTitle(row,"admin"),row.official_title);});
