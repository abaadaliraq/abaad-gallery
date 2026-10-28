import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fixture,root,ids} from './helpers/booking-db.mjs';
const f=await fixture(),{db,ex}=f;let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const migration=fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith('_staff_account_management.sql'));
const rpc=(who,action,payload,options)=>f.rpc(who,'admin_staff_account',[action,payload],options);
const createRequest=(extra={})=>({operation_id:crypto.randomUUID(),full_name:'موظف اختبار معزول',email:'new-staff@example.test',role:'sales',exhibition_ids:[ex],...extra});
const account='10000000-0000-4000-8000-000000000010';
try{
 await db.exec("alter table auth.users add column email text,add column email_confirmed_at timestamptz,add column is_anonymous boolean default false,add column raw_app_meta_data jsonb default '{}',add column deleted_at timestamptz;");
 for(const [key,id]of Object.entries(ids))await db.query('update auth.users set email=$1,email_confirmed_at=now() where id=$2',[key+'@example.test',id]);
 for(const file of ['sales.sql','admin.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase',file),'utf8'));
 await check('schema deployment creates no accounts, changes no roles and keeps existing RLS',async()=>{
  const before=(await db.query('select to_jsonb(s) row from public.staff_roles s order by user_id')).rows;
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8'));
  assert.deepEqual((await db.query("select to_jsonb(s)-'deleted_at' row from public.staff_roles s order by user_id")).rows,before);
  assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,4);
  assert.ok((await db.query("select relrowsecurity and relforcerowsecurity enabled from pg_class where oid='public.staff_roles'::regclass")).rows[0].enabled);
 });
 await check('only a live active admin may prepare account mutations',async()=>{
  for(const who of ['protocol','sales','other','anon'])await assert.rejects(rpc(who,'prepare_create',createRequest()));
  for(const options of [{anonymous:true},{missing:true},{expired:true}])await assert.rejects(rpc('admin','prepare_create',createRequest(),options));
 });
 let request=createRequest(),op;
 await check('prepare is idempotent across a lost reply and stores no password',async()=>{
  op=(await rpc('admin','prepare_create',request)).operation_id;
  assert.equal((await rpc('admin','prepare_create',request)).operation_id,op);
  assert.equal((await rpc('admin','prepare_create',{...request,operation_id:crypto.randomUUID()})).operation_id,op);
  assert.equal((await db.query('select count(*)::int n from abaad_private.staff_account_operations')).rows[0].n,1);
  assert.ok(!(await db.query('select request::text body from abaad_private.staff_account_operations')).rows[0].body.includes('password'));
 });
 await check('existing unrelated Auth users cannot be adopted or granted a staff role',async()=>{
  const denied=await rpc('admin','prepare_create',createRequest({email:'protocol@example.test'}));assert.equal(denied.code,'email_exists');
  await assert.rejects(rpc('admin','finish_create',{operation_id:op,user_id:ids.protocol}));
  assert.equal((await db.query('select role from public.staff_roles where user_id=$1',[ids.protocol])).rows[0].role,'protocol');
 });
 await db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',[account,request.email,{abaad_staff_operation:op,abaad_staff_actor:ids.admin}]);
 await check('only the Auth account created by this operation can be registered and linked',async()=>{
  assert.equal((await rpc('admin','prepare_create',request)).user_id,account);
  assert.equal((await rpc('admin','finish_create',{operation_id:op,user_id:account})).ok,true);
  assert.equal((await db.query('select role from public.staff_roles where user_id=$1',[account])).rows[0].role,'sales');
  assert.equal((await db.query('select count(*)::int n from public.sales_exhibition_staff where user_id=$1 and exhibition_id=$2',[account,ex])).rows[0].n,1);
  assert.equal((await rpc('admin','finish_create',{operation_id:op,user_id:account})).already,true);
  assert.equal((await rpc('admin','prepare_create',request)).done,true);
 });
 await check('invalid role, invalid exhibition, missing exhibition and reused operation payload fail closed',async()=>{
  for(const extra of [{role:'owner'},{exhibition_ids:[]},{exhibition_ids:[crypto.randomUUID()]}])await assert.rejects(rpc('admin','prepare_create',createRequest({email:crypto.randomUUID()+'@example.test',...extra})));
  assert.equal((await rpc('admin','prepare_create',{...request,role:'admin'})).code,'operation_conflict');
 });
 await check('current/last admin cannot be deleted, and normal admin edits remain functional',async()=>{
  assert.equal((await rpc('admin','prepare_delete',{operation_id:crypto.randomUUID(),user_id:ids.admin,expected_updated_at:new Date().toISOString()})).code,'self_delete');
  const user=(await db.query('select * from public.staff_roles where user_id=$1',[account])).rows[0];
  assert.equal((await f.rpc('admin','admin_update_staff',[account,'موظف باسم معدل','sales',true,[ex],user.updated_at])).ok,true);
 });
 ids.created=account;await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[account.replace(/^1/,'2'),account]);
 const artist=(await db.query("select id from public.artwork_artists where slug='wissam-radi'")).rows[0].id;
 const listing=await f.rpc('admin','sales_save_artwork',['naima-baghdad-2026',{artist_id:artist,title_ar:'عمل اختبار معزول',artwork_code:'STAFF-AUDIT',price:'200',currency:'USD'},null,null]);
 await f.rpc('created','sales_transition',[listing.id,'reserved',1,crypto.randomUUID(),'']);
 const histories=(await db.query('select to_jsonb(h) row from public.artwork_status_history h order by id')).rows;
 let deletion;
 await check('delete uses expected version; no stale deletion disables an account',async()=>{
  const r=await rpc('admin','prepare_delete',{operation_id:crypto.randomUUID(),user_id:account,expected_updated_at:'2000-01-01T00:00:00Z'});assert.equal(r.code,'stale');
  assert.equal((await db.query('select is_active from public.staff_roles where user_id=$1',[account])).rows[0].is_active,true);
 });
 await check('deletion first revokes all sessions and memberships while preserving the historical identity',async()=>{
  const version=(await db.query('select updated_at from public.staff_roles where user_id=$1',[account])).rows[0].updated_at;
  deletion={operation_id:crypto.randomUUID(),user_id:account,expected_updated_at:version};
  assert.equal((await rpc('admin','prepare_delete',deletion)).ok,true);
  const user=(await db.query('select * from public.staff_roles where user_id=$1',[account])).rows[0];assert.equal(user.is_active,false);assert.ok(user.deleted_at);assert.equal(user.full_name,'موظف باسم معدل');
  assert.equal((await db.query('select count(*)::int n from auth.sessions where user_id=$1',[account])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.sales_exhibition_staff where user_id=$1',[account])).rows[0].n,0);
  await assert.rejects(f.rpc('created','sales_snapshot',['naima-baghdad-2026']));
  assert.deepEqual((await db.query('select to_jsonb(h) row from public.artwork_status_history h order by id')).rows,histories);
 });
 await check('directory hides deleted staff but retains their historical names and enables account controls',async()=>{
  const data=await f.rpc('admin','admin_staff_directory');assert.ok(!data.staff.some(s=>s.user_id===account));assert.ok(data.historical_staff.some(s=>s.user_id===account&&s.full_name==='موظف باسم معدل'));
  assert.equal(data.capabilities.account_creation,true);assert.equal(data.capabilities.account_deletion,true);
 });
 await check('no deletion success is reported before Auth confirms soft deletion; retries remain idempotent',async()=>{
  assert.equal((await rpc('admin','finish_delete',{operation_id:deletion.operation_id})).code,'auth_delete_pending');
  assert.equal((await rpc('admin','prepare_delete',deletion)).user_id,account);
  // Simulate the Auth Admin API's soft deletion in this isolated Auth fixture only.
  await db.query('update auth.users set deleted_at=now() where id=$1',[account]);
  assert.equal((await rpc('admin','finish_delete',{operation_id:deletion.operation_id})).ok,true);
  assert.equal((await rpc('admin','prepare_delete',deletion)).done,true);
  const target=(await db.query('select * from public.staff_roles where user_id=$1',[account])).rows[0];
  await assert.rejects(f.rpc('admin','admin_update_staff',[account,target.full_name,'sales',true,[ex],target.updated_at]));
 });
 await check('two administrators cannot delete each other and leave no active admin',async()=>{
  await db.query("update public.staff_roles set role='admin' where user_id=$1",[ids.other]);
  const target=(await db.query('select * from public.staff_roles where user_id=$1',[ids.other])).rows[0];
  await rpc('admin','prepare_delete',{operation_id:crypto.randomUUID(),user_id:ids.other,expected_updated_at:target.updated_at});
  await assert.rejects(rpc('other','prepare_delete',{operation_id:crypto.randomUUID(),user_id:ids.admin,expected_updated_at:new Date().toISOString()}));
  assert.equal((await db.query("select count(*)::int n from public.staff_roles where role='admin' and is_active")).rows[0].n,1);
 });
 await check('even admin sessions cannot directly read operation internals or write staff_roles',async()=>{
  await assert.rejects(f.context('admin',()=>db.query('select * from abaad_private.staff_account_operations')));
  await assert.rejects(f.context('admin',()=>db.query("update public.staff_roles set is_active=true where user_id=$1",[account])));
 });
 console.log(JSON.stringify({passed,real_accounts_created:0,production_changes:false,concurrent_connections_verified:false}));
}finally{delete ids.created;await db.close();}
