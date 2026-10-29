import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {root,load} from './helpers/load-ts.mjs';
const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
const {rows}=JSON.parse(fs.readFileSync(path.join(root,'imports/wissam-miniatures.json')));
test('all 13 numbered photos have stable bounded IQD prices and no invented titles or dimensions',()=>{
 assert.equal(rows.length,13);assert.equal(new Set(rows.map(r=>r.photo_url)).size,13);
 assert.deepEqual(rows.map(r=>r.artwork_code),Array.from({length:13},(_,i)=>'MIN-'+String(i+1).padStart(3,'0')));
 for(const r of rows){assert.ok(r.price>=600000&&r.price<=1500000);assert.equal(r.currency,'IQD');assert.ok(!('title_ar'in r));assert.ok(!('width_cm'in r));}
 assert.ok(rows[12].photo_url.endsWith('/mini-_ivvpql.jpg'));
});
test('actual miniature cards render photo, number and Western price, without fictional titles or measurements',()=>{
 const Card=load('src/components/sales/ArtworkCard.tsx',{react:React,'react/jsx-runtime':jsx,'./ArtworkImage':{default:({artwork})=>React.createElement('img',{src:artwork.photo_url,alt:artwork.artwork_code})}}).default;
 const html=renderToStaticMarkup(React.createElement('div',{},...rows.map(r=>React.createElement(Card,{key:r.artwork_code,artwork:{...r,collection_kind:'miniature',title_ar:null,width_cm:null,height_cm:null,status:'available'},mode:'sales',onOpen:()=>{}}))));
 assert.equal((html.match(/<img /g)||[]).length,13);assert.ok(html.includes('MIN-013'));assert.ok(!html.includes('غير مكتمل'));assert.ok(!html.includes(' سم'));assert.doesNotMatch(html,/[\u0660-\u0669\u06f0-\u06f9]/);
});
