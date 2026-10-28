const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const response=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createStaffAccountHandler({makeClient,url,publicKey,secretKey}) {
 return async request=>{
  if(request.method!=='POST')return response({ok:false,code:'method'},405);
  const header=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9_.-]+$/.test(header)||header.length>8192)return response({ok:false,code:'unauthorized'},401);
  if(!url||new URL(url).hostname!=='pwlwelxnrrignapdsyiw.supabase.co'||!publicKey||!secretKey)return response({ok:false,code:'setup'},503);
  try {
   const client=makeClient(url,publicKey,{global:{headers:{Authorization:header}},auth:{persistSession:false,autoRefreshToken:false}});
   const auth=await client.auth.getUser(header.slice(7));
   const user=auth.data?.user;
   if(auth.error||!user||user.is_anonymous===true||!user.email||!user.email_confirmed_at)return response({ok:false,code:'unauthorized'},401);
   if(Number(request.headers.get('content-length')||0)>16384)return response({ok:false,code:'input'},413);
   const text=await request.text();if(text.length>16384)return response({ok:false,code:'input'},413);
   let body;try{body=JSON.parse(text);}catch{return response({ok:false,code:'input'},400);}
   if(!body||Array.isArray(body)||!['create','delete'].includes(body.action)||!uuid(body.operation_id))return response({ok:false,code:'input'},400);
   let payload;
   if(body.action==='create'){
    if(typeof body.full_name!=='string'||body.full_name.trim().length<2||body.full_name.length>120||typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email.trim())||!['admin','protocol','sales'].includes(body.role)||typeof body.password!=='string'||body.password.length<12||body.password.length>128||!Array.isArray(body.exhibition_ids)||body.exhibition_ids.length>100||!body.exhibition_ids.every(uuid))return response({ok:false,code:'input'},400);
    payload={operation_id:body.operation_id,full_name:body.full_name.trim(),email:body.email.trim().toLowerCase(),role:body.role,exhibition_ids:body.role==='admin'?[]:[...new Set(body.exhibition_ids)].sort()};
   }else{
    if(!uuid(body.user_id)||typeof body.expected_updated_at!=='string'||!Number.isFinite(Date.parse(body.expected_updated_at)))return response({ok:false,code:'input'},400);
    payload={operation_id:body.operation_id,user_id:body.user_id,expected_updated_at:body.expected_updated_at};
   }
   // This JWT-scoped RPC rechecks the live database admin and session. No service
   // client or Auth Admin operation is used until it authorizes the exact request.
   const prepare=await client.rpc('admin_staff_account',{p_action:'prepare_'+body.action,p_request:payload});
   if(prepare.error)return response({ok:false,code:prepare.error.code==='42501'?'forbidden':'setup'},prepare.error.code==='42501'?403:503);
   if(!prepare.data?.ok)return response({ok:false,code:prepare.data?.code||'conflict'},409);
   if(prepare.data.done)return response({ok:true,already:true,user_id:prepare.data.user_id});
   const operationId=prepare.data.operation_id;
   if(!uuid(operationId))return response({ok:false,code:'setup'},503);
   const admin=makeClient(url,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
   let target=prepare.data.user_id;
   if(body.action==='create'){
    let result;
    if(target){
     // Recover a previous interrupted request, owned by this exact operation.
     // It has no staff access until finish_create commits successfully.
     result=await admin.auth.admin.updateUserById(target,{password:body.password});
    }else{
     result=await admin.auth.admin.createUser({email:payload.email,password:body.password,email_confirm:true,app_metadata:{abaad_staff_operation:operationId,abaad_staff_actor:user.id}});
    }
    if(result.error||!result.data?.user?.id)return response({ok:false,code:result.error?.code==='email_exists'||result.error?.code==='user_already_exists'?'email_exists':'create_failed'},409);
    target=result.data.user.id;
   }else{
    if(!uuid(target)||target===user.id)return response({ok:false,code:'forbidden'},403);
    const deleted=await admin.auth.admin.deleteUser(target,true);
    if(deleted.error&&deleted.error.code!=='user_not_found')return response({ok:false,code:'delete_pending'},503);
   }
   const finish=await client.rpc('admin_staff_account',{p_action:'finish_'+body.action,p_request:{operation_id:operationId,user_id:target}});
   if(finish.error||!finish.data?.ok)return response({ok:false,code:body.action==='delete'?'delete_pending':'create_pending'},503);
   return response({ok:true,user_id:target});
  }catch{return response({ok:false,code:'retry'},503);}
 };
}
