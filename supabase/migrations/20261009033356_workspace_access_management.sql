-- App access only: these roles do not grant Supabase, GitHub or Vercel access.
begin;
alter table public.workspace_members drop constraint workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check
  check (role in ('operator','manager','global_admin'));
alter table public.workspace_members
  add column active boolean not null default true,
  add column access_version integer not null default 1;

-- Keep this policy self-only. Existing data policies rely on EXISTS(membership).
-- Listing other members is confined to the guarded admin RPC below.
alter policy "Members see their membership" on public.workspace_members
  using (active and (select auth.uid()) is not null
    and email = lower(((select auth.jwt()) ->> 'email'))
    and coalesce(((select auth.jwt()) ->> 'is_anonymous'),'false') = 'false');
revoke insert, update, delete, truncate, references, trigger on public.workspace_members from authenticated, anon;

create schema if not exists access_private;
revoke all on schema access_private from public, anon;
grant usage on schema access_private to authenticated;
create table access_private.access_events (
  id bigint generated always as identity primary key,
  actor_id uuid, actor_email text not null, member_email text not null,
  action text not null, before_state jsonb, after_state jsonb not null,
  created_at timestamptz not null default now()
);
alter table access_private.access_events enable row level security;
revoke all on access_private.access_events from public, anon, authenticated;

-- The definer functions are intentionally private, strictly scoped, and check
-- the current Auth identity and live membership on every call (not metadata).
create function access_private.require_global_admin() returns text
language plpgsql security definer set search_path = '' as $$
declare actor text;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Global Admin access required' using errcode = '42501';
  end if;
  select m.email into actor from public.workspace_members m
    join auth.users u on lower(u.email)=m.email
    where u.id=auth.uid() and m.active and m.role='global_admin';
  if actor is null then
    raise exception 'Global Admin access required' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create function access_private.list_workspace_access() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform access_private.require_global_admin();
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object(
      'email',m.email,'display_name',m.display_name,'role',m.role,'active',m.active,
      'access_version',m.access_version,'user_id',u.id,
      'confirmed_at',u.email_confirmed_at,'last_sign_in_at',u.last_sign_in_at
    ) order by m.active desc,m.email) from public.workspace_members m
      left join auth.users u on lower(u.email)=m.email),'[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from
      (select id,actor_email,member_email,action,before_state,after_state,created_at
       from access_private.access_events order by id desc limit 100) e),'[]'::jsonb)
  );
end;
$$;

create function access_private.save_workspace_access(
  p_email text,p_display_name text,p_role text,p_active boolean,p_expected_version integer
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor text; target text := lower(trim(p_email));
  previous public.workspace_members%rowtype; next_state jsonb;
begin
  -- Serialize access changes, then recheck caller permissions. This prevents
  -- concurrent admin demotions and stale writes from undoing a revocation.
  lock table public.workspace_members in share row exclusive mode;
  actor := access_private.require_global_admin();
  if target is null or length(target)>254 or target !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or p_display_name is null or length(trim(p_display_name)) not between 1 and 120
     or p_role is null or p_role not in ('operator','manager','global_admin') or p_active is null then
    raise exception 'Enter a valid email, name and role';
  end if;
  select * into previous from public.workspace_members where email=target;
  if found then
    if p_expected_version is null or previous.access_version <> p_expected_version then
      raise exception 'This member changed. Refresh the list and try again.' using errcode='40001';
    end if;
    if target=actor and (not p_active or p_role <> 'global_admin') then
      raise exception 'You cannot revoke or downgrade your own Global Admin access';
    end if;
    if previous.active and previous.role='global_admin' and (not p_active or p_role <> 'global_admin')
      and not exists(select 1 from public.workspace_members where active and role='global_admin' and email<>target) then
      raise exception 'Keep at least one active Global Admin';
    end if;
    update public.workspace_members set display_name=trim(p_display_name),role=p_role,active=p_active,
      access_version=access_version+1 where email=target;
  else
    if p_expected_version is not null then
      raise exception 'This member changed. Refresh the list and try again.' using errcode='40001';
    end if;
    insert into public.workspace_members(email,display_name,role,active)
      values(target,trim(p_display_name),p_role,p_active);
  end if;
  next_state := jsonb_build_object('role',p_role,'active',p_active,'display_name',trim(p_display_name));
  insert into access_private.access_events(actor_id,actor_email,member_email,action,before_state,after_state)
  values(auth.uid(),actor,target,
    case when previous.email is null then 'Added' when previous.active and not p_active then 'Revoked'
      when not previous.active and p_active then 'Restored' else 'Updated' end,
    case when previous.email is null then null else jsonb_build_object('role',previous.role,'active',previous.active,'display_name',previous.display_name) end,
    next_state);
end;
$$;

create function public.list_workspace_access() returns jsonb
language sql security invoker set search_path = ''
as $$ select access_private.list_workspace_access(); $$;
create function public.save_workspace_access(
  p_email text,p_display_name text,p_role text,p_active boolean,p_expected_version integer default null
) returns void language sql security invoker set search_path = ''
as $$ select access_private.save_workspace_access(p_email,p_display_name,p_role,p_active,p_expected_version); $$;
revoke all on all functions in schema access_private from public,anon,authenticated;
grant execute on function access_private.list_workspace_access(),
  access_private.save_workspace_access(text,text,text,boolean,integer) to authenticated;
revoke all on function public.list_workspace_access(), public.save_workspace_access(text,text,text,boolean,integer) from public,anon;
grant execute on function public.list_workspace_access(), public.save_workspace_access(text,text,text,boolean,integer) to authenticated;

-- Extend existing manager checks without losing deployed phase-cleanup rules.
do $$
declare pol record; def text; fn record;
begin
  for pol in select * from pg_policies where schemaname='public'
    and tablename in ('vendors','production_work_sessions','phase_storage_cleanup')
    and (qual like '%wm.role%' or with_check like '%wm.role%') loop
    execute format('alter policy %I on %I.%I%s%s',pol.policyname,pol.schemaname,pol.tablename,
      case when pol.qual is null then '' else ' using (' || replace(pol.qual,
        'wm.role = ''manager''::text','wm.role = ANY (ARRAY[''manager''::text,''global_admin''::text])') || ')' end,
      case when pol.with_check is null then '' else ' with check (' || replace(pol.with_check,
        'wm.role = ''manager''::text','wm.role = ANY (ARRAY[''manager''::text,''global_admin''::text])') || ')' end);
  end loop;
  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('validate_production_work_session_update','delete_project_phase') loop
    def := pg_get_functiondef(fn.oid);
    def := replace(def, 'wm.role = ''manager''', 'wm.role in (''manager'',''global_admin'')');
    def := replace(def, 'new.approved_by <> lower', 'new.approved_by is distinct from lower');
    execute def;
  end loop;
end;
$$;
-- A revoked member must not keep using the owner-only production policies.
create policy "Active members required for production sessions"
  on public.production_work_sessions as restrictive for all to authenticated
  using (exists(select 1 from public.workspace_members))
  with check (exists(select 1 from public.workspace_members));
-- Likewise block future avatar requests after revocation (already public avatar
-- URLs and previously issued document signed URLs cannot be recalled by RLS).
create policy "Active members required for storage"
  on storage.objects as restrictive for all to authenticated
  using (exists(select 1 from public.workspace_members))
  with check (exists(select 1 from public.workspace_members));

-- Explicitly requested initial app administrators. Fail if either is missing.
do $$
begin
  if (select count(*) from public.workspace_members where email in ('jsparker95@gmail.com','brian@fortifieddoor.com')) <> 2 then
    raise exception 'Both requested administrators must already be workspace members';
  end if;
  insert into access_private.access_events(actor_email,member_email,action,before_state,after_state)
    select 'Initial administrator setup',email,'Promoted',jsonb_build_object('role',role,'active',active),
      jsonb_build_object('role','global_admin','active',true)
    from public.workspace_members where email in ('jsparker95@gmail.com','brian@fortifieddoor.com');
  update public.workspace_members set role='global_admin',active=true,access_version=access_version+1
    where email in ('jsparker95@gmail.com','brian@fortifieddoor.com');
end;
$$;
notify pgrst, 'reload schema';
commit;
