import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {root, load} from './helpers/load-ts.mjs';

const require=createRequire(import.meta.url);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'imports/ghadeer-artworks.json')));
const {validateArtwork,priceText,dimensions}=load('src/lib/sales/domain.ts');
const {isLocalArtworkPath}=load('src/lib/sales/image-reference.ts');
const artist_id='80000000-0000-4000-8000-000000000001';
test('four fixed unique codes, exact requested names and dimensions',()=>{
  assert.deepEqual(manifest.works.map(w=>w.artwork_code),['GAT-001','GAT-002','GAT-003','GAT-004']);
  assert.deepEqual(manifest.works.map(w=>w.title_ar),['شارع التوراه','خان الذهب','المسمار الرقمي','الختم السومري']);
  assert.equal(dimensions(manifest.works[0]),'120 × 60 × 40 سم');
  assert.equal(dimensions(manifest.works[1]),'170 × 60 × 50 سم');
  for(const w of manifest.works){assert.equal(validateArtwork({...w,artist_id}).errors.length,0);assert.equal(w.price,null);assert.equal(w.initial_status,'not_for_sale');assert.equal(priceText(w.price,w.currency),'السعر غير محدد');}
  for(const w of manifest.works.slice(2)){assert.equal(dimensions(w),null);assert.equal(w.description,null);}
});
test('three images copied from real local files without changing the originals',()=>{
  for(const w of manifest.works.slice(0,3))assert.deepEqual(fs.readFileSync(path.join(root,'public',w.photo_local_path)),fs.readFileSync(path.join(root,'public/images',path.basename(w.photo_local_path))));
  assert.equal(manifest.works[3].photo_local_path,null);
});
test('local path allowlist rejects traversal, remote URLs, SVG and ambiguous encodings',()=>{
  for(const value of ['/images/ghadeer/torah-street.jpg','/images/real-work.png'])assert.equal(isLocalArtworkPath(value),true);
  for(const value of ['/images/../secret.jpg','/images/%2e%2e/secret.jpg','//images/a.jpg','/images/a.svg','/images/a.jpg?x=1','/images/a.jpg#x','/images/a\\b.jpg','https://example.com/images/a.jpg','/images/.hidden/a.jpg','/images/a%20b.jpg'])assert.equal(isLocalArtworkPath(value),false,value);
});
test('local and Cloudinary references stay separate and cannot be combined',()=>{
  const w={...manifest.works[0],artist_id};
  assert.ok(validateArtwork({...w,photo_url:w.photo_local_path,photo_local_path:''}).errors.length);
  assert.ok(validateArtwork({...w,photo_public_id:'artworks/remote'}).errors.length);
  const cloud=validateArtwork({...w,photo_local_path:'',photo_url:'https://res.cloudinary.com/dyqdfbaln/image/upload/v123/artworks/remote.jpg',photo_public_id:'artworks/remote'});
  assert.equal(cloud.errors.length,0);
});
function nativeLoad(file,overrides={}){
 const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const exports={};
 vm.runInNewContext('(function(require,exports){'+source+'})',{process,Uint8Array,Response,URL,AbortSignal,fetch:overrides.fetch||fetch})(s=>Object.hasOwn(overrides,s)?overrides[s]:require(s),exports);
 return exports;
}
const {readLocalArtworkImage}=nativeLoad('src/lib/sales/local-images.ts',{'server-only':{},'./image-reference':{isLocalArtworkPath}});
test('local reader returns actual WebP bytes despite .jpg extension and gracefully handles a missing image',async()=>{
 const result=await readLocalArtworkImage(manifest.works[0].photo_local_path);
 assert.equal(result.type,'image/webp');assert.equal(result.bytes.length,186910);
 assert.equal(await readLocalArtworkImage('/images/ghadeer/missing.jpg'),null);
 assert.equal(await readLocalArtworkImage('/images/../../package.json'),null);
});
function photoApi(data,{allowed=true,cloud=true,error=null}={}){
 let localReads=0,fetches=0,rpcs=0;
 const api=nativeLoad('src/lib/sales/photos.ts',{
  './access':{salesClient:async()=>allowed?{rpc:async()=>{rpcs++;return{data,error};}}:null},
  'server-only':{},
  './local-images':{readLocalArtworkImage:async ref=>{localReads++;return readLocalArtworkImage(ref);}},
  '@/lib/protocol/config':{cloudinaryConfig:()=>cloud?{cloudName:'dyqdfbaln',mode:'upload'}:null},
  '@/lib/protocol/validation':load('src/lib/protocol/validation.ts'),
  '@/lib/protocol/search':load('src/lib/protocol/search.ts'),
  '@/lib/protocol/queries':{privateHeaders:{'Cache-Control':'private, no-store'}},
  cloudinary:{v2:{url:(id)=>'https://res.cloudinary.com/dyqdfbaln/image/upload/'+id}},
  fetch:async()=>{fetches++;return new Response(new Uint8Array([255,216,255,0,0,0,0,0]),{headers:{'Content-Type':'image/jpeg'}});},
 });
 const get=(mode='sales',suffix='')=>api.artworkPhotoResponse(new Request('http://localhost/api/sales/photo/id'+suffix),'30000000-0000-4000-8000-000000000001',mode);
 return {get,stats:()=>({localReads,fetches,rpcs})};
}
test('sales and admin local photo API works without Cloudinary configuration',async()=>{
 const f=photoApi({photo_local_path:manifest.works[0].photo_local_path},{cloud:false});
 for(const mode of ['sales','admin']){const res=await f.get(mode);assert.equal(res.status,200);assert.equal(res.headers.get('Content-Type'),'image/webp');assert.equal(res.headers.get('X-Content-Type-Options'),'nosniff');assert.equal((await res.arrayBuffer()).byteLength,186910);}
 assert.equal(f.stats().fetches,0);assert.equal(f.stats().rpcs,2);
});
test('authorization happens before reading local bytes; missing or invalid files do not fall through remotely',async()=>{
 for(const options of [{allowed:false},{error:{code:'42501'}}]){const f=photoApi({photo_local_path:manifest.works[0].photo_local_path},options);assert.equal((await f.get()).status,404);assert.equal(f.stats().localReads,0);}
 for(const ref of ['/images/ghadeer/missing.jpg','/images/../secret.jpg']){const f=photoApi({photo_local_path:ref,photo_public_id:'remote'});assert.equal((await f.get()).status,404);assert.equal(f.stats().fetches,0);}
 const f=photoApi({photo_local_path:manifest.works[0].photo_local_path});assert.equal((await f.get('sales','?w=999')).status,400);assert.equal(f.stats().rpcs,0);
});
test('existing Cloudinary photo flow and missing photo placeholder remain supported',async()=>{
 const f=photoApi({photo_public_id:'artworks/remote',photo_url:'https://res.cloudinary.com/dyqdfbaln/image/upload/v123/artworks/remote.jpg'});
 assert.equal((await f.get()).status,200);assert.equal(f.stats().fetches,1);assert.equal(f.stats().localReads,0);
 assert.equal((await photoApi({photo_public_id:null,photo_local_path:null}).get()).status,404);
});
test('unapplied SQL cannot silently discard a local image on save or CSV import',async()=>{
 let writes=0;
 const client={rpc:async name=>{if(name==='sales_snapshot')return{data:{artists:[{id:artist_id,name_ar:'غدير الطائي',name_en:null}]},error:null};writes++;return{data:{ok:true},error:null};}};
 const api=load('src/lib/sales/actions.ts',{'./access':{salesClient:async()=>client},'@/lib/auth/authorization':{requireRole:async()=>({role:'admin'})},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/protocol/config':{protocolSlug:()=>manifest.exhibition_slug,cloudinaryConfig:()=>null}});
 assert.equal((await api.saveArtwork(null,null,{...manifest.works[0],artist_id})).ok,false);
 assert.equal((await api.importArtworks('artwork_code,artist,title_ar,photo_local_path\nNEW,غدير الطائي,عمل,/images/ghadeer/torah-street.jpg')).ok,false);
 assert.equal(writes,0);
});

test('actual card components render all four for sales and admin with protected photos and no fake prices',()=>{
 const React=require('react'), jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
 const overrides={'react':React,'react/jsx-runtime':jsx,'next/image':{default:({loader,...props})=>React.createElement('img',{...props,src:loader?loader({src:props.src,width:props.width}):props.src})}};
 const Grid=load('src/components/sales/ArtworkGrid.tsx',overrides).default;
 const artworks=manifest.works.map((w,i)=>({...w,id:'listing-'+i,artist_name_ar:'غدير الطائي',status:'not_for_sale'}));
 for(const mode of ['sales','admin']){
   const html=renderToStaticMarkup(React.createElement(Grid,{artworks,mode,onOpen:()=>{}}));
   assert.equal((html.match(/<article/g)||[]).length,4);
   for(const w of artworks)assert.ok(html.includes(w.title_ar));
   assert.equal((html.match(/السعر غير محدد/g)||[]).length,4);
   assert.equal((html.match(/غير معروض للبيع/g)||[]).length,4);
   assert.equal((html.match(/الصورة غير متوفرة بعد/g)||[]).length,1);
   assert.ok(html.includes(mode==='admin'?'/api/admin/artworks/photo/':'/api/sales/photo/'));
   assert.ok(html.includes('sm:grid-cols-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-4'));
 }
});
test('actual details render supplied descriptions and dimensions without inventing missing fields',()=>{
 const React=require('react'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
 const overrides={'react':React,'react/jsx-runtime':jsx,'next/image':{default:()=>null},'@/lib/live/LiveProvider':{useLiveStore:()=>null},'@/lib/sales/actions':{artworkHistory:async()=>({ok:true,events:[]}),changeArtworkStatus:async()=>({ok:false})}};
 const Details=load('src/components/sales/ArtworkDetails.tsx',overrides).default;
 for(const w of manifest.works){
   const html=renderToStaticMarkup(React.createElement(Details,{artwork:{...w,id:'listing',artist_name_ar:'غدير الطائي',status:'not_for_sale'},mode:'sales',onClose:()=>{},onSaved:async()=>{},onEdit:()=>{},disabled:true,readOnly:true}));
   assert.ok(html.includes(w.title_ar));
   if(w.description)assert.ok(html.includes(w.description));
   if(dimensions(w))assert.ok(html.includes(dimensions(w)));else assert.ok(!html.includes('<dt class="shrink-0 text-muted">الأبعاد</dt>'));
   assert.ok(html.includes('السعر غير محدد'));
 }
});
