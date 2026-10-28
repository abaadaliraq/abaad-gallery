import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {load,root} from './helpers/load-ts.mjs';const require=createRequire(import.meta.url);
const {rows}=JSON.parse(fs.readFileSync(path.join(root,'imports/wissam-artworks.json')));
const {validateArtwork,artworkMatches}=load('src/lib/sales/domain.ts');const artist='80000000-0000-4000-8000-000000000001';
test('requested dataset has exactly 24 paintings, 23 nameless miniatures and 20 supplied images',()=>{
 assert.equal(rows.length,47);assert.equal(new Set(rows.map(a=>a.artwork_code)).size,47);assert.equal(rows.filter(a=>a.collection_kind==='painting').length,24);assert.equal(rows.filter(a=>a.collection_kind==='miniature').length,23);assert.equal(rows.filter(a=>a.photo_url).length,20);
 for(const row of rows.slice(24)){assert.equal(row.title_ar,null);assert.equal(row.width_cm,null);assert.equal(row.height_cm,null);assert.equal(row.photo_url,null);}
 assert.deepEqual(rows.slice(24).map(a=>a.artwork_code),Array.from({length:23},(_,i)=>'MIN-'+String(i+1).padStart(3,'0')));
 assert.equal(rows[2].width_cm,85);assert.equal(rows[2].height_cm,215);assert.equal(rows[21].collection_kind,'painting');
});
test('miniature metadata validates with no invented title while other artwork names remain mandatory',()=>{
 const mini={artist_id:artist,artwork_code:'MIN-001',title_ar:'',collection_kind:'miniature',initial_status:'not_for_sale'};
 const r=validateArtwork(mini);assert.equal(r.errors.length,0);assert.equal(r.value.price,null);assert.equal(r.value.width_cm,null);
 assert.ok(validateArtwork({...mini,collection_kind:'painting'}).errors.length);assert.ok(validateArtwork({...mini,collection_kind:'large'}).errors.length);
});
test('search finds title or preserved code and handles NULL miniature names',()=>{
 assert.equal(artworkMatches({title_ar:null,title_en:null,artwork_code:'MIN-023',artist_name_ar:'وسام راضي',artist_name_en:null},'MIN-023'),true);
 assert.equal(artworkMatches({title_ar:'بنت المختار',title_en:null,artwork_code:'OLD-003',artist_name_ar:'وسام راضي',artist_name_en:null},'المختار'),true);
});
test('actual miniatures render internal numbers without presenting them as artistic names',()=>{
 const React=require('react'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
 const Grid=load('src/components/sales/ArtworkGrid.tsx',{'react':React,'react/jsx-runtime':jsx,'next/image':{default:()=>null}}).default;
 const artworks=rows.slice(24).map(w=>({...w,id:w.artwork_code,artist_name_ar:'وسام راضي',price:null,currency:null,status:'not_for_sale'}));
 const html=renderToStaticMarkup(React.createElement(Grid,{artworks,mode:'admin',onOpen:()=>{}}));
 assert.equal((html.match(/<article/g)||[]).length,23);assert.equal((html.match(/الاسم الفني غير مكتمل/g)||[]).length,0);assert.equal((html.match(/السعر غير محدد/g)||[]).length,23);assert.ok(html.includes('MIN-023'));assert.ok(!html.includes('>null<'));
});
test('actual dashboard exposes only paintings and miniatures for Wissam with independent counts',()=>{
 const React=require('react'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
 const snap={artists:[{id:artist,slug:'wissam-radi',name_ar:'وسام راضي',name_en:'Wissam Radi',total:47,paintings:24,miniatures:23,available:0,sold:0}],artworks:[],total:47,available:0,sold:0,reserved:0,total_matches:0,page:1,page_size:24};
 const Dashboard=load('src/components/sales/SalesDashboard.tsx',{'react':React,'react/jsx-runtime':jsx,'@/lib/sales/useSalesData':{useSalesData:()=>({filters:{q:'',artist,collection:'painting',status:'all',page:1},setFilters:()=>{},snapshot:snap,refresh:async()=>{},loading:false})},'@/lib/live/LiveProvider':{useLiveStore:()=>null},'@/lib/sales/actions':{},'@/lib/auth/actions':{},'next/image':{default:()=>null}}).default;
 const html=renderToStaticMarkup(React.createElement(Dashboard,{staff:{full_name:'اختبار محلي'},mode:'admin',embedded:true,readOnly:true}));assert.ok(html.includes('اللوحات — 24 عملاً'));assert.ok(html.includes('المصغرات — 23 عملاً'));assert.ok(!html.includes('اللوحات الكبيرة'));
});
test('collection API uses scoped RPC and only falls back to legacy reads for all collections',async()=>{
 let calls=[];
 const api=load('src/lib/sales/queries.ts',{'./access':{salesClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return name==='sales_snapshot'?{data:{artworks:[]},error:null}:{data:null,error:{code:'PGRST202'}};}})},'@/lib/protocol/config':{protocolSlug:()=> 'naima-baghdad-2026'},'@/lib/protocol/queries':{privateHeaders:{}}});
 assert.equal((await api.salesSnapshotResponse(new Request('http://localhost/api/sales?collection=all'),'sales')).status,200);assert.equal(calls.length,2);
 calls=[];assert.equal((await api.salesSnapshotResponse(new Request('http://localhost/api/admin/artworks?collection=miniature'),'admin')).status,503);assert.equal(calls.length,1);
 calls=[];assert.equal((await api.salesSnapshotResponse(new Request('http://localhost/api/sales?collection=invalid'),'sales')).status,400);assert.equal(calls.length,0);
});
