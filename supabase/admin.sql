-- ABAAD EXHIBIT Phase 05 — ADMINISTRATION. REVIEW ONLY. NOT APPLIED.
-- Target project: pwlwelxnrrignapdsyiw.
-- Requires reviewed Auth, Protocol and Sales schemas. Creates no tables or accounts.
-- Does not change any existing policies or direct table grants. No production rows are modified by deployment.
begin;
do $$begin
 if to_regclass('public.staff_roles') is null or to_regclass('public.protocol_invitations') is null or to_regclass('public.sales_exhibition_staff') is null or to_regprocedure('abaad_private.has_live_session()') is null then
 raise exception 'Reviewed authentication, protocol and sales foundation required';end if;
end$$;
create function abaad_private.admin_authorized() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_roles s where s.user_id=(select auth.uid()) and s.role='admin' and s.is_active)
 and (select abaad_private.has_live_session());
$$;
revoke all on function abaad_private.admin_authorized() from public,anon,authenticated;
grant execute on function abaad_private.admin_authorized() to authenticated;

-- Read-only directory: emails are returned only to a live active administrator.
-- No Auth Admin secret is needed in browser or server configuration.
create function abaad_private.admin_staff_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not coalesce(abaad_private.admin_authorized(),false) then raise insufficient_privilege;end if;
 select jsonb_build_object('total',(select count(*)from public.staff_roles),'active_count',(select count(*)from public.staff_roles where is_active),
 'capabilities',jsonb_build_object('staff_updates',true,'guest_review',true,'account_creation',false),
 'exhibitions',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'slug',e.slug,'name',e.name,'is_active',e.is_active)order by e.name)from public.protocol_exhibitions e where e.is_active),'[]'::jsonb),
 'staff',coalesce((select jsonb_agg(to_jsonb(row)order by row.full_name,row.user_id)from(
 select s.user_id,s.full_name,u.email,s.role,s.is_active,s.created_at,s.updated_at,
 coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'slug',e.slug,'name',e.name)order by e.name)from public.protocol_exhibitions e where e.id in(
 select p.exhibition_id from public.protocol_exhibition_staff p where p.user_id=s.user_id union select a.exhibition_id from public.sales_exhibition_staff a where a.user_id=s.user_id)),'[]'::jsonb)exhibitions
 from public.staff_roles s left join auth.users u on u.id=s.user_id)row),'[]'::jsonb))into result;
 return result;
end$$;
create function public.admin_staff_directory()returns jsonb language sql stable security invoker set search_path=''as $$select abaad_private.admin_staff_directory();$$;

-- Serializes administrative staff edits to preserve the last active admin invariant.
-- Actor identity and session always come from the live authenticated request.
create function abaad_private.admin_update_staff(p_user_id uuid,p_full_name text,p_role text,p_is_active boolean,p_exhibition_ids uuid[],p_expected_updated_at timestamptz)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare target public.staff_roles;active_admins integer;exhibition uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('abaad:admin-staff-edit',0));
 if not coalesce(abaad_private.admin_authorized(),false)then raise insufficient_privilege;end if;
 if p_user_id is null or char_length(trim(coalesce(p_full_name,'')))not between 2 and 120 or p_role not in('admin','protocol','sales')or p_is_active is null or p_exhibition_ids is null or cardinality(p_exhibition_ids)>100 or p_expected_updated_at is null then raise invalid_parameter_value;end if;
 select * into target from public.staff_roles where user_id=p_user_id for update;
 if not found then raise invalid_parameter_value;end if;
 if target.updated_at<>p_expected_updated_at then return jsonb_build_object('ok',false,'code','stale');end if;
 if p_user_id=auth.uid() and (p_role<>target.role or p_is_active<>target.is_active)then raise insufficient_privilege;end if;
 if target.role='admin'and target.is_active and(p_role<>'admin'or not p_is_active)then
 select count(*)into active_admins from public.staff_roles where role='admin'and is_active;
 if active_admins<=1 then raise exception 'Last active administrator cannot be disabled or demoted'using errcode='42501';end if;
 end if;
 foreach exhibition in array p_exhibition_ids loop
 if exhibition is null or not exists(select 1 from public.protocol_exhibitions where id=exhibition and is_active)then raise invalid_parameter_value;end if;
 end loop;
 update public.staff_roles set full_name=trim(p_full_name),role=p_role,is_active=p_is_active,updated_at=clock_timestamp()where user_id=p_user_id;
 -- Memberships do not confer a role. RLS still checks active staff role and a live session.
 delete from public.protocol_exhibition_staff where user_id=p_user_id;
 delete from public.sales_exhibition_staff where user_id=p_user_id;
 if p_role='protocol'then
 insert into public.protocol_exhibition_staff(exhibition_id,user_id)select distinct id,p_user_id from unnest(p_exhibition_ids)ids(id);
 elsif p_role='sales'then
 insert into public.sales_exhibition_staff(exhibition_id,user_id)select distinct id,p_user_id from unnest(p_exhibition_ids)ids(id);
 end if;
 return jsonb_build_object('ok',true);
end$$;
create function public.admin_update_staff(p_user_id uuid,p_full_name text,p_role text,p_is_active boolean,p_exhibition_ids uuid[],p_expected_updated_at timestamptz)returns jsonb
language sql security invoker set search_path=''as $$select abaad_private.admin_update_staff(p_user_id,p_full_name,p_role,p_is_active,p_exhibition_ids,p_expected_updated_at);$$;

-- Explicit review approval, version-checked against both the invitation and guest.
-- Does not modify priority, identity, source, arrival timestamp or arrival actor.
create function abaad_private.admin_approve_guest(p_invitation_id uuid,p_guest_updated_at timestamptz,p_invitation_updated_at timestamptz)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare invitation public.protocol_invitations;guest public.protocol_guests;begin
 if not coalesce(abaad_private.admin_authorized(),false)then raise insufficient_privilege;end if;
 if p_guest_updated_at is null or p_invitation_updated_at is null then raise invalid_parameter_value;end if;
 select * into invitation from public.protocol_invitations where id=p_invitation_id for update;
 if not found or not coalesce(abaad_private.protocol_allowed(invitation.exhibition_id),false)then raise insufficient_privilege;end if;
 select * into guest from public.protocol_guests where id=invitation.guest_id for update;
 if guest.updated_at<>p_guest_updated_at or invitation.updated_at<>p_invitation_updated_at then return jsonb_build_object('ok',false,'code','stale');end if;
 if not invitation.review_required then return jsonb_build_object('ok',true,'already',true);end if;
 update public.protocol_invitations set review_required=false,updated_at=clock_timestamp()where id=p_invitation_id;
 return jsonb_build_object('ok',true,'already',false);
end$$;
create function public.admin_approve_guest(p_invitation_id uuid,p_guest_updated_at timestamptz,p_invitation_updated_at timestamptz)returns jsonb
language sql security invoker set search_path=''as $$select abaad_private.admin_approve_guest(p_invitation_id,p_guest_updated_at,p_invitation_updated_at);$$;

do $$declare signature text;begin
 foreach signature in array array['admin_staff_directory()','admin_update_staff(uuid,text,text,boolean,uuid[],timestamp with time zone)','admin_approve_guest(uuid,timestamp with time zone,timestamp with time zone)']loop
 execute 'revoke all on function abaad_private.'||signature||' from public,anon,authenticated';
 execute 'revoke all on function public.'||signature||' from public,anon,authenticated';
 execute 'grant execute on function abaad_private.'||signature||' to authenticated';
 execute 'grant execute on function public.'||signature||' to authenticated';
 end loop;
end$$;
commit;
-- Audit scope remains the existing attendance and artwork status history tables.
-- Guest metadata edits, review approvals and staff edits are not logged in those histories.
-- No account creation endpoint or permission is introduced by this file.
