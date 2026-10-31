export type VisitorInput = {full_name:string;phone:string;address:string;visit_date:string};
export function westernDigits(value:string){return value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g,c=>String(c.charCodeAt(0)-(c.charCodeAt(0)>=0x6f0?0x6f0:0x660)));}
export function validateVisitor(raw:unknown):{value?:VisitorInput;error?:string}{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return {error:"أدخل بيانات الزائر."};
 const x=raw as Record<string,unknown>;
 if(['full_name','phone','address','visit_date'].some(k=>typeof x[k]!=="string"))return {error:"أكمل الاسم والهاتف والعنوان وتاريخ الزيارة."};
 const full_name=(x.full_name as string).trim(),address=(x.address as string).trim(),visit_date=x.visit_date as string;
 let phone=westernDigits(x.phone as string).replace(/[\s()-]/g,'');
 if(/^07\d{9}$/.test(phone))phone='+964'+phone.slice(1);
 else if(/^9647\d{9}$/.test(phone))phone='+'+phone;
 else if(/^009647\d{9}$/.test(phone))phone='+'+phone.slice(2);
 if(full_name.length<2||full_name.length>160)return {error:"أدخل اسم الزائر كاملاً."};
 if(!/^\+9647\d{9}$/.test(phone))return {error:"أدخل رقم هاتف عراقي صحيح، مثل 07701234567."};
 if(address.length<2||address.length>300)return {error:"أدخل عنوان الزائر، مثل المنطقة والمدينة (حتى 300 حرف)."};
 if(!/^2026-(10|11)-\d{2}$/.test(visit_date)||!Number.isFinite(Date.parse(visit_date+'T12:00:00Z'))||new Date(visit_date+'T12:00:00Z').toISOString().slice(0,10)!==visit_date||visit_date<'2026-10-31'||visit_date>'2026-11-09')return {error:"اختر تاريخاً ضمن أيام المعرض."};
 return {value:{full_name,phone,address,visit_date}};
}
export const baghdadToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baghdad',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
