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

  await db.exec('alter table auth.users add column email text');
  await db.query("update auth.users set email='synthetic@example.invalid'");
  await db.exec(fs.readFileSync(root+'supabase/sales.sql','utf8'));
  const tableCount=(await db.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n;
  await db.exec(fs.readFileSync(root+'supabase/admin.sql','utf8'));
  await check('admin SQL creates no tables and keeps direct staff writes denied',async()=>{assert.equal((await db.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n,tableCount);await context(a,()=>assert.rejects(db.query("update public.staff_roles set role='admin'where user_id=$1",[p])));});
  await check('only a live active administrator can read directory and email',async()=>{const result=await context(a,()=>rpc('admin_staff_directory',[]));assert.equal(result.total,4);assert.equal(result.active_count,4);assert.equal(result.staff.find(row=>row.user_id===p).email,'synthetic@example.invalid');assert.equal(result.capabilities.account_creation,false);for(const who of [p,s])await context(who,()=>assert.rejects(rpc('admin_staff_directory',[])));});
  const stamp=async id=>{const result=await db.query('select updated_at::text as updated_at from public.staff_roles where user_id=$1',[id]);if(result.rows[0])return result.rows[0].updated_at;const directory=await rpc('admin_staff_directory',[]);return directory.staff.find(row=>row.user_id===id).updated_at;};
  await check('an administrator cannot disable or demote their own account',async()=>{for(const change of [['admin',false],['sales',true]])await context(a,async()=>assert.rejects(rpc('admin_update_staff',[a,'ADMIN TEST',change[0],change[1],[],await stamp(a)])));});
  await check('administrator edits another employee name without creating Auth users',async()=>{const users=(await db.query('select count(*)::int n from auth.users')).rows[0].n;const result=await context(a,async()=>rpc('admin_update_staff',[p,'اسم موظف اختبار مصحح','protocol',true,[ex],await stamp(p)]));assert.equal(result.ok,true);assert.equal((await db.query('select full_name from public.staff_roles where user_id=$1',[p])).rows[0].full_name,'اسم موظف اختبار مصحح');assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,users);});
  await check('stale staff update cannot overwrite later changes',async()=>{const old=await stamp(p);await context(a,()=>rpc('admin_update_staff',[p,'تعديل أول','protocol',true,[ex],old]));const result=await context(a,()=>rpc('admin_update_staff',[p,'تعديل قديم','protocol',true,[ex],old]));assert.equal(result.ok,false);assert.equal(result.code,'stale');});
  await check('role and exhibition assignments change atomically and obey role RLS',async()=>{await context(a,async()=>rpc('admin_update_staff',[p,'موظف مبيعات اختبار','sales',true,[ex],await stamp(p)]));assert.equal((await db.query('select count(*)::int n from public.protocol_exhibition_staff where user_id=$1',[p])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from public.sales_exhibition_staff where user_id=$1',[p])).rows[0].n,1);await context(p,()=>assert.rejects(rpc('protocol_snapshot',['naima-baghdad-2026'])));assert.equal((await context(p,()=>rpc('sales_snapshot',['naima-baghdad-2026']))).total,0);await context(a,async()=>rpc('admin_update_staff',[p,'موظف تشريفات اختبار','protocol',true,[ex],await stamp(p)]));});
  await check('unassignment immediately removes exhibition access',async()=>{await context(a,async()=>rpc('admin_update_staff',[p,'موظف غير مرتبط','protocol',true,[],await stamp(p)]));await context(p,()=>assert.rejects(rpc('protocol_snapshot',['naima-baghdad-2026'])));await context(a,async()=>rpc('admin_update_staff',[p,'موظف تشريفات اختبار','protocol',true,[ex],await stamp(p)]));});
  await check('invalid exhibition assignment rolls back every staff modification',async()=>{await context(a,async()=>assert.rejects(rpc('admin_update_staff',[p,'MUST NOT CHANGE','sales',false,['90000000-0000-4000-8000-000000000001'],await stamp(p)])));const row=(await db.query('select * from public.staff_roles where user_id=$1',[p])).rows[0];assert.equal(row.role,'protocol');assert.equal(row.is_active,true);});
  await check('protocol and sales cannot edit staff or elevate themselves',async()=>{for(const who of [p,s])await context(who,async()=>assert.rejects(rpc('admin_update_staff',[who,'NO ELEVATION','admin',true,[],await stamp(who)])));});
  await check('last active administrator invariant protects cross-admin demotion',async()=>{await context(a,async()=>rpc('admin_update_staff',[other,'SECOND ADMIN TEST','admin',true,[],await stamp(other)]));await context(other,async()=>rpc('admin_update_staff',[a,'FIRST ADMIN TEST','protocol',true,[ex],await stamp(a)]));const lastVersion=await stamp(other);await context(a,()=>assert.rejects(rpc('admin_update_staff',[other,'CANNOT REMOVE LAST','sales',false,[],lastVersion])));await context(other,async()=>rpc('admin_update_staff',[a,'FIRST ADMIN TEST','admin',true,[],await stamp(a)]));await context(a,async()=>rpc('admin_update_staff',[other,'OTHER PROTOCOL TEST','protocol',true,[],await stamp(other)]));});
  const guest={full_name_ar:'ضيف مراجعة مصطنع',official_title:'صفة تحتاج تأكيد',organization:'جهة اختبار',priority_level:'vvip',review_required:true,review_note:'راجع المصدر',photo_public_id:'',source_key:'local-only',source_record_key:'1'};
  const id=await context(a,()=>rpc('protocol_save_guest',['naima-baghdad-2026',guest,null]));
  await context(p,()=>rpc('protocol_check_in',[id]));
  const versions=async()=>{const row=(await db.query('select i.updated_at::text invitation_time,g.updated_at::text guest_time from public.protocol_invitations i join public.protocol_guests g on g.id=i.guest_id where i.id=$1',[id])).rows[0];return [row.guest_time,row.invitation_time];};
  await check('opening a reviewed record does not approve it',async()=>{const snap=await context(a,()=>rpc('protocol_snapshot',['naima-baghdad-2026']));assert.equal(snap.guests[0].review_required,true);});
  await check('only admin can explicitly approve a guest',async()=>{const v=await versions();for(const who of [p,s])await context(who,()=>assert.rejects(rpc('admin_approve_guest',[id,...v])));});
  await check('stale guest or invitation versions reject approval',async()=>{const old=await versions();await context(a,()=>rpc('protocol_save_guest',['naima-baghdad-2026',{...guest,official_title:'بيانات أحدث'},id]));const result=await context(a,()=>rpc('admin_approve_guest',[id,...old]));assert.equal(result.ok,false);assert.equal(result.code,'stale');assert.equal((await db.query('select review_required from public.protocol_invitations where id=$1',[id])).rows[0].review_required,true);});
  await check('review approval preserves priority source identity and original arrival',async()=>{const before=(await db.query('select * from public.protocol_invitations where id=$1',[id])).rows[0];const result=await context(a,async()=>rpc('admin_approve_guest',[id,...await versions()]));assert.equal(result.ok,true);const after=(await db.query('select * from public.protocol_invitations where id=$1',[id])).rows[0];assert.equal(after.review_required,false);assert.equal(after.priority_level,before.priority_level);assert.equal(after.guest_id,before.guest_id);assert.equal(after.source_key,before.source_key);assert.equal(after.source_record_key,before.source_record_key);assert.deepEqual(after.checked_in_at,before.checked_in_at);assert.equal(after.checked_in_by,before.checked_in_by);assert.equal((await db.query('select count(*)::int n from public.protocol_attendance_events')).rows[0].n,1);});
  await check('inactive and expired administrator sessions cannot invoke admin functions',async()=>{await context(a,()=>assert.rejects(rpc('admin_staff_directory',[])),{expired:true});await context(a,()=>assert.rejects(rpc('admin_staff_directory',[])),{missing:true});await db.query('update public.staff_roles set is_active=false where user_id=$1',[a]);await context(a,()=>assert.rejects(rpc('admin_staff_directory',[])));await db.query('update public.staff_roles set is_active=true where user_id=$1',[a]);});
  await check('anonymous role cannot invoke any administrative RPC',async()=>{const version=await versions();await db.exec('set role anon');try{await assert.rejects(rpc('admin_staff_directory',[]));await assert.rejects(rpc('admin_approve_guest',[id,...version]));}finally{await db.exec('reset role');}});
  await check('manual creation cannot duplicate a guest imported with a source identity',async()=>{const before=(await db.query('select count(*)::int n from public.protocol_invitations')).rows[0].n;const result=await context(a,()=>rpc('protocol_merge_import',['naima-baghdad-2026',[{...guest,official_title:'بيانات أحدث',source_key:'',source_record_key:''}]]));assert.equal(result.succeeded,0);assert.equal(result.updated,0);assert.equal(result.duplicated,1);assert.equal((await db.query('select count(*)::int n from public.protocol_invitations')).rows[0].n,before);});
  console.log(JSON.stringify({passed,external_sql_executed:false,real_data_modified:false,engine:'isolated PGlite; one connection',multi_session_locking_verified:false}));
}finally{await db.close();}
