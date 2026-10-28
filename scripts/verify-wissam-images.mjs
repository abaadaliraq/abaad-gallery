import fs from 'node:fs';
const {rows}=JSON.parse(fs.readFileSync('imports/wissam-artworks.json','utf8'));
const results=[];
for(let start=0;start<rows.length;start+=4){
 await Promise.all(rows.slice(start,start+4).filter(row=>row.photo_url).map(async row=>{
  try{const r=await fetch(row.photo_url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(15000)});results.push({code:row.artwork_code,title:row.title_ar,status:r.status,type:r.headers.get('content-type'),ok:r.ok&&r.headers.get('content-type')?.startsWith('image/'),requires_identity_review:row.order===9});}
  catch(e){results.push({code:row.artwork_code,ok:false,error:e.message});}
 }));
}
results.sort((a,b)=>a.code.localeCompare(b.code));
fs.writeFileSync('work/wissam/image-verification.json',JSON.stringify({checked_at:new Date().toISOString(),results},null,2));
console.log(JSON.stringify({checked:results.length,passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok),identity_review:['WR-009']}));
if(process.argv.includes('--inspect-sewing')){
 const r=await fetch(rows[8].photo_url,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(r.ok)fs.writeFileSync('work/wissam/sewing-source.png',new Uint8Array(await r.arrayBuffer()));
}
if(results.some(r=>!r.ok))process.exitCode=1;
