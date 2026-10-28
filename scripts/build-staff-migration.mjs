import fs from 'node:fs';
const file=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('_staff_account_management.sql'));
if(file.length!==1)throw Error('Expected one CLI-created staff migration');
const source=fs.readFileSync('supabase/admin.sql','utf8');
function fn(name){const start=source.indexOf('create function '+name+'(');const dollar=source.indexOf('$$',start);if(start<0)throw Error(name);return source.slice(start,source.indexOf('$$;',dollar+2)+3).replace('create function','create or replace function');}
const directory=fn('abaad_private.admin_staff_directory')
 .replace('count(*)from public.staff_roles)', 'count(*)from public.staff_roles where deleted_at is null)')
 .replace('where is_active)', 'where is_active and deleted_at is null)')
 .replace("'account_creation',false", "'account_creation',true,'account_deletion',true")
 .replace("'capabilities',", "'historical_staff',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'full_name',full_name)) from public.staff_roles where deleted_at is not null),'[]'::jsonb),'capabilities',")
 .replace('from public.staff_roles s left join auth.users u on u.id=s.user_id)', 'from public.staff_roles s left join auth.users u on u.id=s.user_id where s.deleted_at is null)');
const update=fn('abaad_private.admin_update_staff').replace('if not found then raise invalid_parameter_value;', 'if not found or target.deleted_at is not null then raise invalid_parameter_value;');
const core=fs.readFileSync('work/staff-account-core.sql','utf8');
const result=core+'\n'+directory+'\n'+update+"\nalter table public.staff_roles add constraint staff_deleted_inactive check(deleted_at is null or not is_active);\nnotify pgrst,'reload schema';\ncommit;\n";
fs.writeFileSync('supabase/migrations/'+file[0],result);console.log(file[0]);
