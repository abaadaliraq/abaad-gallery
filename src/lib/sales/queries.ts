import "server-only";
import {salesClient} from "./access";
import {protocolSlug} from "@/lib/protocol/config";
import {privateHeaders} from "@/lib/protocol/queries";
import {isUuid} from "@/lib/protocol/search";
import {isStatus} from "./domain";
import type {SalesMode} from "@/types/sales";
export async function salesSnapshotResponse(request:Request,mode:SalesMode){const client=await salesClient(mode);const params=new URL(request.url).searchParams;const artist=params.get('artist')||null,collection=params.get('collection')||'all',status=params.get('status')||'all',page=Number(params.get('page')||1);if(!['all','painting','miniature'].includes(collection)||(artist&&!isUuid(artist))||(status!=='all'&&!isStatus(status))||!Number.isInteger(page)||page<1||page>10000)return Response.json({error:'خيارات البحث غير صالحة.'},{status:400,headers:privateHeaders});
 try{if(!client)throw Error();const args={p_slug:protocolSlug(),p_query:(params.get('q')||'').slice(0,200),p_artist:artist,p_status:status,p_page:page};let result=await client.rpc('sales_collection_snapshot',{...args,p_collection:collection});if(result.error&&['PGRST202','42883'].includes(result.error.code)&&collection==='all')result=await client.rpc('sales_snapshot',args);const {data,error}=result;if(error)return Response.json({setup:['PGRST202','42P01','42883'].includes(error.code),error:error.code==='42501'?'لم يُمنح حسابك الوصول إلى مبيعات هذا المعرض.': ['PGRST202','42P01','42883'].includes(error.code)?'قسم المبيعات بانتظار اعتماد وتهيئة قاعدة البيانات.':'تعذر تحميل بيانات الأعمال.'},{status:error.code==='42501'?403:503,headers:privateHeaders});return Response.json(data,{headers:privateHeaders});}catch{return Response.json({error:'تعذر الاتصال. أعد المحاولة.'},{status:503,headers:privateHeaders});}}
