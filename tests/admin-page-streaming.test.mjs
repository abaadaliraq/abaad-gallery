import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {load} from './helpers/load-ts.mjs';

const routes=[
 ['activity','@/components/admin/AdminActivity'],
 ['staff','@/components/admin/staff/StaffManagement'],
 ['settings','@/components/admin/AdminSettings'],
 ['artworks/preview','@/components/sales/SalesDashboard'],
];
for(const [route,component]of routes){
 function setup(allow=true){
  const calls=[];const Marker=()=>null,Loading=()=>null;
  const {default:Page}=load('src/app/admin/'+route+'/page.tsx',{
   react:React,'react/jsx-runtime':jsx,'next/cache':{io:async()=>{calls.push('io');}},
   '@/lib/auth/authorization':{requireRole:async role=>{calls.push(role);if(!allow)throw Error('DENIED');return {user_id:'current-admin'};}},
   [component]:{default:Marker},'@/components/ui/LoadingIndicator':{default:Loading},
  });return {Page,calls,Marker,Loading};
 }
 test(route+' returns its page-level loading boundary before reading the current session',async()=>{
  const h=setup(),shell=h.Page();assert.equal(shell.type,React.Suspense);assert.equal(shell.props.fallback.type,h.Loading);assert.deepEqual(h.calls,[]);
  const content=await shell.props.children.type();assert.deepEqual(h.calls,['io','admin']);assert.equal(content.type,h.Marker);
  if(route==='staff')assert.equal(content.props.currentUserId,'current-admin');
  if(route==='artworks/preview'){assert.equal(content.props.staff.user_id,'current-admin');assert.equal(content.props.readOnly,true);}
 });
 test(route+' cannot render protected content when the live admin guard rejects',async()=>{
  const h=setup(false),shell=h.Page();await assert.rejects(shell.props.children.type(),/DENIED/);assert.deepEqual(h.calls,['io','admin']);
 });
}
