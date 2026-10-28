"use server";
import {adminClient} from "./access";
import {isUuid} from "@/lib/protocol/search";
import {isRole} from "@/types/auth";
import type {Role} from "@/types/auth";
export type CreateStaffInput={operation_id:string;full_name:string;email:string;password:string;role:Role;exhibition_ids:string[]};
const errors:Record<string,string>={
 input:"راجع اسم الموظف والبريد وكلمة المرور والدور والمعرض.",
 forbidden:"هذه العملية متاحة للإدارة النشطة فقط. حدّث الجلسة.",
 unauthorized:"انتهت جلسة الدخول. سجّل الدخول مجدداً.",
 email_exists:"يوجد حساب مسجل بهذا البريد؛ لن ننشئ حساباً مكرراً أو نغيّر حسابه.",
 pending_conflict:"يوجد طلب سابق لهذا البريد. أعد المحاولة بنفس بيانات الطلب السابق.",
 operation_conflict:"تغيرت بيانات الطلب. أغلق النافذة وأعد فتحها.",
 self_delete:"لا يمكنك حذف حسابك الحالي.",last_admin:"لا يمكن حذف آخر حساب إدارة نشط.",
 stale:"تغيرت بيانات الموظف. حدّث القائمة قبل الحذف.",
 create_failed:"تعذر إنشاء الحساب. راجع البريد وقوة كلمة المرور ثم أعد المحاولة.",
 create_pending:"لم يتأكد إكمال ربط الحساب. أعد المحاولة؛ لن يُنشأ حساب مكرر.",
 delete_pending:"تم إيقاف الوصول، لكن حذف حساب الدخول لم يُؤكد بعد. أعد المحاولة لإكمال الحذف.",
 setup:"خدمة إدارة الحسابات غير متاحة حالياً. لم يُؤكد إتمام العملية.",
};
async function run(body:Record<string,unknown>){
 const {client}=await adminClient();
 try{
  const result=await client.functions.invoke('staff-accounts',{body});
  let data=result.data;
  if(result.error){
   const context='context' in result.error?result.error.context:null;
   if(context instanceof Response){try{data=await context.json();}catch{/* Keep the failure closed. */}}
   return {ok:false,error:errors[data?.code]||"لم يتم تأكيد العملية. أعد المحاولة بنفس الطلب."};
  }
  if(!data||data.ok!==true)return {ok:false,error:errors[data?.code]||"لم يتم تأكيد العملية. أعد المحاولة بنفس الطلب."};
  return {ok:true};
 }catch{return {ok:false,error:"تعذر تأكيد الاتصال. أعد المحاولة بنفس الطلب قبل إنشاء طلب جديد."};}
}
export async function createStaffAccount(input:CreateStaffInput){
 // run() rechecks the actual server-side admin; body roles never authorize a caller.
 if(!input||!isUuid(input.operation_id)||typeof input.full_name!=='string'||input.full_name.trim().length<2||input.full_name.length>120||typeof input.email!=='string'||input.email.length>254||!/^\S+@\S+\.\S+$/.test(input.email.trim())||typeof input.password!=='string'||input.password.length<12||input.password.length>128||!isRole(input.role)||!Array.isArray(input.exhibition_ids)||input.exhibition_ids.length>100||!input.exhibition_ids.every(isUuid))return {ok:false,error:errors.input};
 if(input.role!=='admin'&&!input.exhibition_ids.length)return {ok:false,error:"اختر معرضاً للموظف."};
 return run({action:'create',operation_id:input.operation_id,full_name:input.full_name.trim(),email:input.email.trim().toLowerCase(),password:input.password,role:input.role,exhibition_ids:input.role==='admin'?[]:[...new Set(input.exhibition_ids)]});
}
export async function deleteStaffAccount(input:{operation_id:string;user_id:string;expected_updated_at:string}){
 if(!input||!isUuid(input.operation_id)||!isUuid(input.user_id)||typeof input.expected_updated_at!=='string'||!Number.isFinite(Date.parse(input.expected_updated_at)))return {ok:false,error:errors.input};
 return run({action:'delete',operation_id:input.operation_id,user_id:input.user_id,expected_updated_at:input.expected_updated_at});
}
