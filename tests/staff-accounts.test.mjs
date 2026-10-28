import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {createStaffAccountHandler} from '../supabase/functions/staff-accounts/handler.mjs';
import {root,load} from './helpers/load-ts.mjs';const require=createRequire(import.meta.url);
const actor='10000000-0000-4000-8000-000000000001',target='10000000-0000-4000-8000-000000000002',operation='20000000-0000-4000-8000-000000000001',ex='30000000-0000-4000-8000-000000000001';
const body={action:'create',operation_id:operation,full_name:'موظف اختبار',email:'person@example.test',password:'test-only-password-123',role:'protocol',exhibition_ids:[ex]};
function fixture(options={}){
 const calls=[];
 const user={id:actor,email:'admin@example.test',email_confirmed_at:'2026-10-01',is_anonymous:false,...options.user};
 const authAdmin={
  createUser:async value=>{calls.push(['create',value]);if(options.createThrow)throw Error('network');return{data:{user:{id:target}},error:options.createError||null};},
  updateUserById:async(id,value)=>{calls.push(['password',id,value]);return{data:{user:{id}},error:null};},
  deleteUser:async(...args)=>{calls.push(['delete',...args]);return{error:options.deleteError||null};},
 };
 const makeClient=(_url,key)=>{
  if(key==='secret'){calls.push(['service']);return{auth:{admin:authAdmin}};}
  return{auth:{getUser:async()=>({data:{user},error:options.authError||null})},rpc:async(name,args)=>{
   calls.push(['rpc',name,args]);
   if(args.p_action.startsWith('prepare_'))return options.prepare||{data:{ok:true,operation_id:operation,user_id:args.p_action==='prepare_delete'?target:options.recover?target:null},error:null};
   return options.finish||{data:{ok:true},error:null};
  }};
 };
 const handler=createStaffAccountHandler({makeClient,url:options.url||'https://pwlwelxnrrignapdsyiw.supabase.co',publicKey:'public',secretKey:'secret'});
 const call=(value=body,authorization='Bearer test.jwt.token')=>handler(new Request('http://edge.test',{method:'POST',headers:{...(authorization?{Authorization:authorization}:{}),'Content-Type':'application/json'},body:JSON.stringify(value)}));
 return{calls,call,handler};
}
test('unauthenticated, unconfirmed and anonymous users cannot access Auth Admin',async()=>{
 const f=fixture();assert.equal((await f.call(body,'')).status,401);assert.equal(f.calls.length,0);
 for(const options of [{user:{is_anonymous:true}},{user:{email_confirmed_at:null}},{authError:{message:'expired'}}]){const g=fixture(options);assert.equal((await g.call()).status,401);assert.equal(g.calls.length,0);}
});
test('database admin/session guard is required before constructing the privileged client',async()=>{
 const f=fixture({prepare:{data:null,error:{code:'42501'}}});assert.equal((await f.call({...body,role:'admin',user_metadata:{role:'admin'}})).status,403);assert.ok(!f.calls.some(c=>c[0]==='service'));
});
test('wrong project, malformed requests and weak passwords never cause Auth mutations',async()=>{
 assert.equal((await fixture({url:'https://another-project.supabase.co'}).call()).status,503);
 for(const value of [{...body,password:'short'},{...body,role:'owner'},{...body,operation_id:'bad'},{...body,exhibition_ids:['bad']},{...body,action:'finish_create'}]){const f=fixture();assert.equal((await f.call(value)).status,400);assert.equal(f.calls.length,0);}
});
test('creates a verified Auth user, then separately registers the database role; secrets and password are not returned or passed to SQL',async()=>{
 const f=fixture();const result=await f.call();assert.equal(result.status,200);assert.equal((await result.json()).ok,true);
 const create=f.calls.find(c=>c[0]==='create')[1];assert.equal(create.email_confirm,true);assert.equal(create.app_metadata.abaad_staff_actor,actor);assert.equal(create.app_metadata.abaad_staff_operation,operation);
 assert.equal(create.role,undefined);assert.ok(!JSON.stringify(f.calls.filter(c=>c[0]==='rpc')).includes(body.password));
 const finish=f.calls.find(c=>c[0]==='rpc'&&c[2].p_action==='finish_create');assert.equal(finish[2].p_request.user_id,target);
});
test('finished requests and interrupted Auth creation retries do not create duplicate users',async()=>{
 const done=fixture({prepare:{data:{ok:true,done:true,user_id:target},error:null}});assert.equal((await done.call()).status,200);assert.ok(!done.calls.some(c=>c[0]==='service'));
 const recover=fixture({recover:true});assert.equal((await recover.call()).status,200);assert.equal(recover.calls.filter(c=>c[0]==='create').length,0);assert.equal(recover.calls.filter(c=>c[0]==='password').length,1);
});
test('role revoked before final registration cannot report success or delete an unrelated Auth user',async()=>{
 const f=fixture({finish:{data:null,error:{code:'42501'}}});const result=await f.call();assert.equal(result.status,503);assert.equal((await result.json()).code,'create_pending');assert.ok(!f.calls.some(c=>c[0]==='delete'));
});
test('duplicate emails and Auth failures do not report a completed creation',async()=>{
 const duplicate=fixture({prepare:{data:{ok:false,code:'email_exists'},error:null}});assert.equal((await duplicate.call()).status,409);assert.ok(!duplicate.calls.some(c=>c[0]==='service'));
 const network=fixture({createThrow:true});assert.equal((await network.call()).status,503);
});
test('deletion revokes database access first, then soft-deletes Auth and only then confirms completion',async()=>{
 const f=fixture();assert.equal((await f.call({action:'delete',operation_id:operation,user_id:target,expected_updated_at:'2026-10-01T00:00:00Z'})).status,200);
 assert.deepEqual(f.calls.find(c=>c[0]==='delete'),['delete',target,true]);
 const stages=f.calls.filter(c=>c[0]==='rpc').map(c=>c[2].p_action);assert.deepEqual(stages,['prepare_delete','finish_delete']);
 const fail=fixture({deleteError:{code:'unexpected'}});assert.equal((await fail.call({action:'delete',operation_id:operation,user_id:target,expected_updated_at:'2026-10-01T00:00:00Z'})).status,503);assert.ok(!fail.calls.some(c=>c[0]==='rpc'&&c[2].p_action==='finish_delete'));
});
test('self/last-admin refusal cannot reach Auth delete',async()=>{
 for(const code of ['self_delete','last_admin']){const f=fixture({prepare:{data:{ok:false,code},error:null}});assert.equal((await f.call({action:'delete',operation_id:operation,user_id:target,expected_updated_at:'2026-10-01T00:00:00Z'})).status,409);assert.ok(!f.calls.some(c=>c[0]==='delete'));}
});
test('Next Server Actions recheck actual admin identity and invoke only the bounded Edge function payload',async()=>{
 const calls=[];
 const api=load('src/lib/admin/staff-account-actions.ts',{'./access':{adminClient:async()=>({client:{functions:{invoke:async(...args)=>{calls.push(args);return{data:{ok:true},error:null};}}}})}});
 assert.equal((await api.createStaffAccount({...body,unexpected:'ignored'})).ok,true);assert.equal(calls[0][0],'staff-accounts');assert.equal(calls[0][1].body.unexpected,undefined);
 const denied=load('src/lib/admin/staff-account-actions.ts',{'./access':{adminClient:async()=>{throw Error('DENIED');}}});await assert.rejects(denied.createStaffAccount(body),/DENIED/);
});
test('staff page has add/edit/delete controls but no search field and protects the current admin visually',()=>{
 const React=require('react'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
 const Staff=load('src/components/admin/staff/StaffManagement.tsx',{'react':React,'react/jsx-runtime':jsx,'@/lib/admin/useAdminData':{useAdminData:()=>({data:{state:'ready',data:{total:1,active_count:1,staff:[{user_id:actor,full_name:'إدارة اختبار',role:'admin',is_active:true,email:'admin@example.test',exhibitions:[]}],exhibitions:[],capabilities:{staff_updates:true,account_creation:true,account_deletion:true}}},refresh:async()=>{},loading:false})},'@/lib/live/useLiveSafety':{useLiveSafety:()=>false},'@/lib/admin/actions':{},'@/lib/admin/staff-account-actions':{}}).default;
 const html=renderToStaticMarkup(React.createElement(Staff,{currentUserId:actor}));assert.ok(html.includes('إضافة موظف'));assert.ok(html.includes('تعديل'));assert.ok(html.includes('حذف'));assert.ok(!html.includes('type="search"'));assert.ok(!html.includes('البحث عن موظف'));assert.ok(html.includes('لا يمكن حذف حسابك أو آخر مدير نشط'));
});
test('server secret handling exists only in the Deno entrypoint and is absent from client staff components',()=>{
 for(const name of ['StaffCreate','StaffDelete','StaffManagement']){const code=fs.readFileSync(path.join(root,'src/components/admin/staff/'+name+'.tsx'),'utf8');assert.ok(!code.includes('SERVICE_ROLE'));assert.ok(!code.includes('auth.admin'));}
});
