import fs from "node:fs";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { fileURLToPath } from "node:url";
import path from "node:path";
const db = new PGlite();
const root =
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") + path.sep;
const p = "10000000-0000-4000-8000-000000000001",
  s = "10000000-0000-4000-8000-000000000002",
  a = "10000000-0000-4000-8000-000000000003",
  other = "10000000-0000-4000-8000-000000000004";
const sess = (id) => id.replace(/^1/, "2");
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
async function context(id, fn, options = {}) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: id,
      session_id: options.missing ? "" : sess(id),
      is_anonymous: false,
      exp: options.expired ? 1 : Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function rpc(name, args) {
  const values = args.map((_, i) => "$" + (i + 1)).join(",");
  return (
    await db.query("select public." + name + "(" + values + ") as result", args)
  ).rows[0].result;
}
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;`);
  await db.exec(fs.readFileSync(root + "supabase/staff_roles.sql", "utf8"));
  await db.exec(fs.readFileSync(root + "supabase/protocol.sql", "utf8"));
  for (const [id, role] of [
    [p, "protocol"],
    [s, "sales"],
    [a, "admin"],
    [other, "protocol"],
  ]) {
    await db.query("insert into auth.users values($1)", [id]);
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      sess(id),
      id,
    ]);
    await db.query(
      "insert into public.staff_roles(user_id,full_name,role) values($1,$2,$3)",
      [id, "SYNTHETIC TEST ONLY", role],
    );
  }
  const ex = (
    await db.query(
      "select id from public.protocol_exhibitions where slug='naima-baghdad-2026'",
    )
  ).rows[0].id;
  await db.query("insert into public.protocol_exhibition_staff values($1,$2)", [
    ex,
    p,
  ]);
  const guest = {
    full_name_ar: "أَمين اختبار",
    full_name_en: "AMIN TEST",
    official_title: "وزير اختبار",
    organization: "مؤسسة الاختبار",
    category: "شخصيات رسمية",
    photo_public_id: "",
    seating_location: "مقعد اختبار",
    internal_notes: "LOCAL SYNTHETIC ONLY",
  };
  let id;
  await check("reviewed SQL installs in isolated PostgreSQL", async () => {
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name like 'protocol_%'",
        )
      ).rows[0].n,
      6,
    );
  });
  await check("admin creates one synthetic invitation", async () => {
    id = await context(a, () =>
      rpc("protocol_save_guest", ["naima-baghdad-2026", guest, null]),
    );
    assert.ok(id);
  });
  await check(
    "Arabic normalization, English case and organization search",
    async () => {
      for (const q of ["امين", "amin", "مؤسسة", "وزير"]) {
        const data = await context(p, () =>
          rpc("protocol_snapshot", ["naima-baghdad-2026", q, null, "all", 1]),
        );
        assert.equal(data.total_matches, 1);
      }
    },
  );
  await check("snapshot totals are real and initially pending", async () => {
    const data = await context(p, () =>
      rpc("protocol_snapshot", ["naima-baghdad-2026"]),
    );
    assert.equal(data.total, 1);
    assert.equal(data.pending, 1);
    assert.equal(data.checked_in, 0);
  });
  await check(
    "protocol cannot edit guest title or arrival columns directly",
    async () => {
      await context(p, async () => {
        await assert.rejects(
          db.query(
            "update public.protocol_guests set official_title='forbidden'",
          ),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            "update public.protocol_invitations set checked_in_at=now()",
          ),
          /permission denied/,
        );
      });
    },
  );
  await check("sales cannot read guests or call check-in", async () => {
    await context(s, async () => {
      assert.equal(
        (await db.query("select * from public.protocol_guests")).rows.length,
        0,
      );
      await assert.rejects(rpc("protocol_check_in", [id]));
    });
  });
  await check(
    "unassigned protocol staff cannot read another exhibition",
    async () => {
      await context(other, async () => {
        assert.equal(
          (await db.query("select * from public.protocol_guests")).rows.length,
          0,
        );
        await assert.rejects(rpc("protocol_check_in", [id]));
      });
    },
  );
  let stamp;
  await check("check-in stores actor/time and updates counters", async () => {
    const first = await context(p, () => rpc("protocol_check_in", [id]));
    stamp = first.checked_in_at;
    assert.equal(first.already_checked_in, false);
    const data = await context(p, () =>
      rpc("protocol_snapshot", ["naima-baghdad-2026"]),
    );
    assert.equal(data.checked_in, 1);
    assert.equal(data.guests[0].checked_in_by, p);
  });
  await check(
    "duplicate and locally queued parallel calls preserve original arrival and single audit event",
    async () => {
      const data = await context(p, () =>
        Promise.all(
          Array.from({ length: 8 }, () => rpc("protocol_check_in", [id])),
        ),
      );
      assert.ok(
        data.every((r) => r.already_checked_in && r.checked_in_at === stamp),
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from public.protocol_attendance_events where action='check_in'",
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "protocol cannot cancel attendance; admin needs a reason",
    async () => {
      await context(p, () =>
        assert.rejects(rpc("protocol_undo_check_in", [id, "valid reason"])),
      );
      await context(a, () =>
        assert.rejects(rpc("protocol_undo_check_in", [id, "x"])),
      );
    },
  );
  await check("admin correction retains an audit trail", async () => {
    await context(a, () =>
      rpc("protocol_undo_check_in", [id, "Synthetic correction reason"]),
    );
    const data = await context(p, () =>
      rpc("protocol_snapshot", ["naima-baghdad-2026"]),
    );
    assert.equal(data.pending, 1);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.protocol_attendance_events",
        )
      ).rows[0].n,
      2,
    );
  });
  await check("inactive staff denied at database level", async () => {
    await db.query(
      "update public.staff_roles set is_active=false where user_id=$1",
      [p],
    );
    await context(p, () => assert.rejects(rpc("protocol_check_in", [id])));
    await db.query(
      "update public.staff_roles set is_active=true where user_id=$1",
      [p],
    );
  });
  await check(
    "expired and missing sessions denied at database level",
    async () => {
      await context(p, () => assert.rejects(rpc("protocol_check_in", [id])), {
        expired: true,
      });
      await context(p, () => assert.rejects(rpc("protocol_check_in", [id])), {
        missing: true,
      });
    },
  );
  await check(
    "CSV RPC reports successes, duplicates and invalid rows",
    async () => {
      const next = { ...guest, full_name_ar: "ضيف اختبار ثان" };
      const result = await context(a, () =>
        rpc("protocol_import_guests", [
          "naima-baghdad-2026",
          [guest, next, { ...guest, full_name_ar: "" }],
        ]),
      );
      assert.equal(result.succeeded, 1);
      assert.equal(result.duplicated, 1);
      assert.equal(result.failed, 1);
    },
  );
  await check(
    "protocol cannot import guest data or read audit history",
    async () => {
      await context(p, async () => {
        await assert.rejects(
          rpc("protocol_import_guests", ["naima-baghdad-2026", [guest]]),
        );
        assert.equal(
          (await db.query("select * from public.protocol_attendance_events"))
            .rows.length,
          0,
        );
      });
    },
  );
  await check("anonymous database role has no guest access", async () => {
    await db.exec("set role anon");
    try {
      await assert.rejects(
        db.query("select * from public.protocol_guests"),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  });

  const batch=["vvip","vip","priority","regular"].map((priority_level,index)=>({...guest,full_name_ar:"شخص مصدر "+index,source_key:"synthetic-source",source_record_key:String(index+1),priority_level,review_required:index===0,review_note:"تأكيد إداري",photo_public_id:"synthetic_photo",photo_url:"https://res.cloudinary.com/dyqdfbaln/image/upload/v123/synthetic_photo.jpg",photo_gravity:"face",display_order:4-index}));
  let importedId;
  await check("Dry Run is read-only and reports four new source records",async()=>{const before=(await db.query("select count(*)::int n from public.protocol_invitations")).rows[0].n;const plan=await context(a,()=>rpc("protocol_import_plan",["naima-baghdad-2026",batch]));assert.equal(plan.new_count,4);assert.equal(plan.conflict_count,0);assert.equal((await db.query("select count(*)::int n from public.protocol_invitations")).rows[0].n,before);});
  await check("merge import preserves priority, review, image URL and source identity",async()=>{const report=await context(a,()=>rpc("protocol_merge_import",["naima-baghdad-2026",batch]));assert.equal(report.succeeded,4);const snap=await context(p,()=>rpc("protocol_snapshot",["naima-baghdad-2026"]));assert.deepEqual(snap.guests.slice(0,3).map(g=>g.priority_level),["vvip","vip","priority"]);const row=snap.guests[0];importedId=row.id;assert.equal(row.review_required,true);assert.equal(row.photo_url,batch[0].photo_url);assert.equal(row.checked_in_at,null);assert.equal(row.source_record_key,"1");});
  await check("unchanged import is rerunnable without inserts or metadata rewrites",async()=>{const plan=await context(a,()=>rpc("protocol_import_plan",["naima-baghdad-2026",batch]));assert.equal(plan.unchanged_count,4);const report=await context(a,()=>rpc("protocol_merge_import",["naima-baghdad-2026",batch]));assert.equal(report.succeeded,0);assert.equal(report.updated,0);assert.equal(report.duplicated,4);});
  await check("source update preserves arrival actor and time and never deletes records",async()=>{await context(p,()=>rpc("protocol_check_in",[importedId]));const before=(await db.query("select * from public.protocol_invitations where id=$1",[importedId])).rows[0];batch[0]={...batch[0],official_title:"صفة مصححة",priority_level:"vip",photo_gravity:"north"};const report=await context(a,()=>rpc("protocol_merge_import",["naima-baghdad-2026",batch]));assert.equal(report.updated,1);const after=(await db.query("select * from public.protocol_invitations where id=$1",[importedId])).rows[0];assert.deepEqual(after.checked_in_at,before.checked_in_at);assert.equal(after.checked_in_by,before.checked_in_by);const photo=await context(p,()=>rpc("protocol_photo_ref",[importedId]));assert.equal(photo.photo_gravity,"north");assert.equal((await db.query("select count(*)::int n from public.protocol_invitations where source_key='synthetic-source'")).rows[0].n,4);});
  await check("different name for same source key aborts every write",async()=>{const conflict=[{...batch[0],full_name_ar:"شخص آخر"},{...batch[1],official_title:"تغيير يجب ألا يحفظ"}];const plan=await context(a,()=>rpc("protocol_import_plan",["naima-baghdad-2026",conflict]));assert.equal(plan.conflict_count,1);const report=await context(a,()=>rpc("protocol_merge_import",["naima-baghdad-2026",conflict]));assert.equal(report.aborted,true);assert.equal(report.updated,0);const snap=await context(a,()=>rpc("protocol_snapshot",["naima-baghdad-2026"]));assert.equal(snap.guests.find(g=>g.source_record_key==="2").official_title,batch[1].official_title);});
  await check("same name with different title and source ID remains separate",async()=>{const rows=[1,2].map(n=>({...batch[0],full_name_ar:"اسم مشترك",official_title:"صفة مختلفة "+n,source_record_key:"same-name-"+n}));const report=await context(a,()=>rpc("protocol_merge_import",["naima-baghdad-2026",rows]));assert.equal(report.succeeded,2);});
  await check("priority filtering retains search across name title and organization",async()=>{for(const q of ["شخص","وزير","مؤسسة"]){const snap=await context(p,()=>rpc("protocol_snapshot",["naima-baghdad-2026",q,null,"all",1,"priority"]));assert.equal(snap.total_matches,1);assert.equal(snap.guests[0].priority_level,"priority");}});
  await check("protocol and sales cannot call administrator import plan or merge",async()=>{for(const role of [p,s])await context(role,async()=>{for(const fn of ["protocol_import_plan","protocol_merge_import"])await assert.rejects(rpc(fn,["naima-baghdad-2026",batch]));});});


  await check("renumbering an identical source identity reports conflict rather than duplication",async()=>{const changed=[{...batch[1],source_record_key:"999"}];const plan=await context(a,()=>rpc("protocol_import_plan",["naima-baghdad-2026",changed]));assert.equal(plan.conflict_count,1);const report=await context(a,()=>rpc("protocol_merge_import",["naima-baghdad-2026",changed]));assert.equal(report.aborted,true);assert.equal(report.succeeded,0);});
  const summary = {
    passed,
    engine: "isolated local PGlite PostgreSQL",
    external_sql_executed: false,
    concurrency_limit:
      "PGlite serializes one connection. True simultaneous multi-session locking is NOT verified here.",
  };
  console.log(JSON.stringify(summary));
} finally {
  await db.close();
}
