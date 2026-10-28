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

  await db.exec(fs.readFileSync(root+'supabase/sales.sql','utf8'));
  await db.query('insert into public.sales_exhibition_staff values($1,$2)',[ex,s]);
  const second='10000000-0000-4000-8000-000000000005';await db.query('insert into auth.users values($1)',[second]);await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[sess(second),second]);await db.query("insert into public.staff_roles(user_id,full_name,role)values($1,'SECOND SALES TEST','sales')",[second]);await db.query('insert into public.sales_exhibition_staff values($1,$2)',[ex,second]);
  const artist=(await db.query("select id from public.artwork_artists where slug='wissam-radi'")).rows[0].id;
  const artwork={artist_id:artist,artwork_code:'TEST-001',title_ar:'عمل اختبار محلي فقط',title_en:'TEST ARTWORK',year_created:2020,medium:'خامة اختبار',width_cm:'50.50',height_cm:'100',price:'1500.25',currency:'USD',initial_status:'available',photo_public_id:'',photo_url:''};let listing;
  await check('sales schema seeds only two supplied artists and zero artworks',async()=>{assert.equal((await db.query('select count(*)::int n from public.artwork_artists')).rows[0].n,2);assert.equal((await db.query('select count(*)::int n from public.artworks')).rows[0].n,0);});
  await check('admin adds artwork with exact decimal price',async()=>{const result=await context(a,()=>rpc('sales_save_artwork',['naima-baghdad-2026',artwork,null,null]));assert.equal(result.ok,true);listing=result.id;const snap=await context(s,()=>rpc('sales_snapshot',['naima-baghdad-2026']));assert.equal(snap.artworks[0].price,'1500.25');assert.equal(snap.artworks[0].width_cm,'50.50');assert.equal(snap.available,1);});
  await check('protocol cannot read artwork tables prices snapshot or photo',async()=>{await context(p,async()=>{for(const table of ['artworks','artwork_artists','exhibition_artworks'])assert.equal((await db.query('select * from public.'+table)).rows.length,0);await assert.rejects(rpc('sales_snapshot',['naima-baghdad-2026']));assert.equal(await rpc('sales_photo_ref',[listing]),null);});});
  await check('sales cannot directly edit prices or delete artworks',async()=>{await context(s,async()=>{await assert.rejects(db.query('update public.exhibition_artworks set price=1 where id=$1',[listing]));await assert.rejects(db.query('delete from public.artworks'));await assert.rejects(rpc('sales_save_artwork',['naima-baghdad-2026',artwork,listing,1]));await assert.rejects(rpc('sales_save_artist',['naima-baghdad-2026','فنان اختبار','TEST',null]));});});
  await check('sales search supports title artwork code and artist',async()=>{for(const q of ['TEST-001','عمل','وسام','wissam']){const snap=await context(s,()=>rpc('sales_snapshot',['naima-baghdad-2026',q]));assert.equal(snap.total_matches,1);}const empty=await context(s,()=>rpc('sales_snapshot',['naima-baghdad-2026','',null,'sold']));assert.equal(empty.total_matches,0);});
  const reserveOp='70000000-0000-4000-8000-000000000001';
  await check('reservation records real actor time version and updated statistics',async()=>{const result=await context(s,()=>rpc('sales_transition',[listing,'reserved',1,reserveOp,'']));assert.equal(result.ok,true);const row=(await db.query('select * from public.exhibition_artworks where id=$1',[listing])).rows[0];assert.equal(row.reserved_by,s);assert.ok(row.reserved_at);assert.equal(row.version,2);const snap=await context(second,()=>rpc('sales_snapshot',['naima-baghdad-2026']));assert.equal(snap.reserved,1);assert.equal(snap.artworks[0].status,'reserved');});
  await check('lost-response retry is idempotent and does not append another event',async()=>{const result=await context(s,()=>rpc('sales_transition',[listing,'reserved',1,reserveOp,'']));assert.equal(result.ok,true);assert.equal(result.already,true);assert.equal((await db.query("select count(*)::int n from public.artwork_status_history where listing_id=$1 and new_status='reserved'",[listing])).rows[0].n,1);});
  await check('second staff stale reservation or sale is rejected by database',async()=>{const result=await context(second,()=>rpc('sales_transition',[listing,'sold',1,'70000000-0000-4000-8000-000000000002','']));assert.equal(result.ok,false);assert.equal(result.code,'stale');});
  await check('sales cannot cancel reservation or read history',async()=>{await context(s,async()=>{await assert.rejects(rpc('sales_transition',[listing,'available',2,'70000000-0000-4000-8000-000000000003','']));await assert.rejects(rpc('sales_history',[listing]));assert.equal((await db.query('select * from public.artwork_status_history')).rows.length,0);});});
  const sellOp='70000000-0000-4000-8000-000000000004';
  await check('sale from reserved is atomic and cannot be sold twice',async()=>{const result=await context(s,()=>rpc('sales_transition',[listing,'sold',2,sellOp,'']));assert.equal(result.ok,true);const row=(await db.query('select * from public.exhibition_artworks where id=$1',[listing])).rows[0];assert.equal(row.sold_by,s);assert.ok(row.sold_at);const secondSale=await context(second,()=>rpc('sales_transition',[listing,'sold',3,'70000000-0000-4000-8000-000000000005','']));assert.equal(secondSale.ok,false);assert.equal((await db.query("select count(*)::int n from public.artwork_status_history where listing_id=$1 and new_status='sold'",[listing])).rows[0].n,1);});
  await check('metadata edit preserves sold state and original sale actor time',async()=>{const before=(await db.query('select * from public.exhibition_artworks where id=$1',[listing])).rows[0];const result=await context(a,()=>rpc('sales_save_artwork',['naima-baghdad-2026',{...artwork,price:'1600.50'},listing,3]));assert.equal(result.ok,true);const after=(await db.query('select * from public.exhibition_artworks where id=$1',[listing])).rows[0];assert.equal(after.status,'sold');assert.equal(after.sold_by,before.sold_by);assert.deepEqual(after.sold_at,before.sold_at);});
  await check('same operation ID cannot target another action or actor',async()=>{await context(second,()=>assert.rejects(rpc('sales_transition',[listing,'sold',4,sellOp,''])));await context(s,()=>assert.rejects(rpc('sales_transition',[listing,'reserved',4,sellOp,''])));});
  await check('admin correction requires reason and appends history',async()=>{await context(a,()=>assert.rejects(rpc('sales_transition',[listing,'available',4,'70000000-0000-4000-8000-000000000006',''])));const result=await context(a,()=>rpc('sales_transition',[listing,'available',4,'70000000-0000-4000-8000-000000000006','تصحيح اختبار محلي']));assert.equal(result.ok,true);const events=await context(a,()=>rpc('sales_history',[listing]));assert.equal(events.length,4);assert.ok(events.some(e=>e.previous_status==='sold'&&e.new_status==='available'&&e.reason==='تصحيح اختبار محلي'));});
  await check('duplicate normalized artwork code rolls back without orphan artwork',async()=>{const n=(await db.query('select count(*)::int n from public.artworks')).rows[0].n;await context(a,()=>assert.rejects(rpc('sales_save_artwork',['naima-baghdad-2026',{...artwork,artwork_code:'test-001'},null,null])));assert.equal((await db.query('select count(*)::int n from public.artworks')).rows[0].n,n);});
  await check('missing prices remain NULL and zero negative unsupported currency fail',async()=>{const result=await context(a,()=>rpc('sales_save_artwork',['naima-baghdad-2026',{...artwork,artwork_code:'NO-PRICE',price:null,currency:null,initial_status:'not_for_sale'},null,null]));const snap=await context(s,()=>rpc('sales_snapshot',['naima-baghdad-2026','NO-PRICE']));assert.equal(snap.artworks[0].price,null);assert.equal(result.ok,true);for(const extra of [{price:'0'},{price:'-1'},{currency:'EUR'}])await context(a,()=>assert.rejects(rpc('sales_save_artwork',['naima-baghdad-2026',{...artwork,artwork_code:'BAD',...extra},null,null])));});
  await check('not for sale cannot be reserved or sold by sales',async()=>{const snap=await context(s,()=>rpc('sales_snapshot',['naima-baghdad-2026','NO-PRICE']));for(const next of ['reserved','sold'])await context(s,()=>assert.rejects(rpc('sales_transition',[snap.artworks[0].id,next,1,'70000000-0000-4000-8000-000000000007',''])));});
  await check('CSV plan is read-only and import skips existing sale state',async()=>{const rows=[artwork,{...artwork,artwork_code:'NEW-CSV'}];const plan=await context(a,()=>rpc('sales_import_plan',['naima-baghdad-2026',rows]));assert.equal(plan.new_count,1);assert.equal(plan.existing_count,1);const before=(await db.query('select * from public.exhibition_artworks where id=$1',[listing])).rows[0];const result=await context(a,()=>rpc('sales_import_artworks',['naima-baghdad-2026',rows]));assert.equal(result.inserted,1);assert.equal(result.skipped,1);const repeat=await context(a,()=>rpc('sales_import_artworks',['naima-baghdad-2026',rows]));assert.equal(repeat.inserted,0);assert.equal(repeat.skipped,2);const after=(await db.query('select * from public.exhibition_artworks where id=$1',[listing])).rows[0];assert.deepEqual(after,before);});
  await check('conflicting CSV identity stops all additions',async()=>{const result=await context(a,()=>rpc('sales_import_artworks',['naima-baghdad-2026',[{...artwork,title_ar:'عنوان مختلف'},{...artwork,artwork_code:'MUST-NOT-ADD'}]]));assert.equal(result.ok,false);assert.equal((await db.query("select count(*)::int n from public.exhibition_artworks where artwork_code='MUST-NOT-ADD'")).rows[0].n,0);});
  await check('protocol and sales cannot import artworks',async()=>{for(const who of [p,s])await context(who,async()=>{for(const fn of ['sales_import_plan','sales_import_artworks'])await assert.rejects(rpc(fn,['naima-baghdad-2026',[artwork]]));});});
  await check('unassigned sales and inactive staff are denied',async()=>{await db.query('delete from public.sales_exhibition_staff where user_id=$1',[second]);await context(second,()=>assert.rejects(rpc('sales_snapshot',['naima-baghdad-2026'])));await db.query('update public.staff_roles set is_active=false where user_id=$1',[s]);await context(s,()=>assert.rejects(rpc('sales_snapshot',['naima-baghdad-2026'])));await db.query('update public.staff_roles set is_active=true where user_id=$1',[s]);});
  await check('expired or missing sessions fail closed',async()=>{await context(s,()=>assert.rejects(rpc('sales_snapshot',['naima-baghdad-2026'])),{expired:true});await context(s,()=>assert.rejects(rpc('sales_snapshot',['naima-baghdad-2026'])),{missing:true});});
  await check('anonymous role cannot read sales prices or execute snapshot',async()=>{await db.exec('set role anon');try{await assert.rejects(db.query('select * from public.exhibition_artworks'));await assert.rejects(rpc('sales_snapshot',['naima-baghdad-2026']));}finally{await db.exec('reset role');}});

  await check('RLS isolates a second exhibition and its prices',async()=>{const otherEx=(await db.query("insert into public.protocol_exhibitions(slug,name)values('other-sales-test','SECOND EXHIBITION TEST')returning id")).rows[0].id;await db.query('insert into public.exhibition_artists(exhibition_id,artist_id)values($1,$2)',[otherEx,artist]);const result=await context(a,()=>rpc('sales_save_artwork',['other-sales-test',{...artwork,artwork_code:'PRIVATE-OTHER'},null,null]));await context(s,async()=>{await assert.rejects(rpc('sales_snapshot',['other-sales-test']));const hidden=await db.query('select * from public.exhibition_artworks where id=$1',[result.id]);assert.equal(hidden.rows.length,0);assert.equal(await rpc('sales_photo_ref',[result.id]),null);await assert.rejects(rpc('sales_transition',[result.id,'sold',1,'70000000-0000-4000-8000-000000000009','']));});});
  await check('all six sales tables enforce RLS and FORCE RLS',async()=>{const rows=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relname=any($1::text[])",[['artwork_artists','exhibition_artists','sales_exhibition_staff','artworks','exhibition_artworks','artwork_status_history']])).rows;assert.equal(rows.length,6);assert.ok(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));});
  console.log(JSON.stringify({passed,engine:'isolated PGlite; one connection',external_sql_executed:false,multi_session_concurrency_verified:false}));
}finally{await db.close();}
