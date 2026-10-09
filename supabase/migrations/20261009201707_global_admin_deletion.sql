begin;

-- No project FK: cleanup must survive deletion of the project itself.
create table access_private.deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null, project_name text not null, phase_id uuid,
  target_name text not null, actor_email text not null,
  deleted_phase_ids text[] not null default '{}',
  pending_paths text[] not null default '{}',
  created_at timestamptz not null default now(), completed_at timestamptz
);
alter table access_private.deletion_jobs enable row level security;
revoke all on access_private.deletion_jobs from public, anon, authenticated;

create function access_private.delete_workspace_target(
  p_project_id uuid, p_phase_id uuid, p_expected_version integer, p_confirmation text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor text; project public.projects%rowtype; target_name text;
  phases jsonb; history jsonb; kept_ids text[]; removed_ids text[]; paths text[];
  selected jsonb; next_data jsonb; job uuid;
  empty_content constant jsonb := '{"walls":[],"doorTypes":[],"hardware":[],"openings":[],"milestones":{},"references":[],"links":[],"elevations":[],"woodDoorOrders":[],"machiningSpecs":[],"takeoffSelection":{},"installRates":{},"anchorMilestones":{}}';
begin
  -- Same lock order as membership administration; a concurrent revocation wins
  -- before authorization is checked, or waits for this authorized transaction.
  lock table public.workspace_members in share mode;
  actor := access_private.require_global_admin();
  select * into project from public.projects where id=p_project_id for update;
  if not found or project.version is distinct from p_expected_version then
    raise exception 'This project changed or was deleted. Reload before deleting.';
  end if;
  target_name := project.name;
  if p_phase_id is not null then
    select value->>'name' into target_name from jsonb_array_elements(coalesce(project.data->'phases','[]'))
      where value->>'id'=p_phase_id::text;
    if not found then raise exception 'The phase no longer exists. Save or reload the project first.'; end if;
  end if;
  if p_confirmation is distinct from target_name then raise exception 'Type the exact name to confirm deletion.'; end if;

  if p_phase_id is not null then
    select coalesce(jsonb_agg(value),'[]') into phases from jsonb_array_elements(project.data->'phases')
      where value->>'id'<>p_phase_id::text;
    -- Keep ancestors needed by surviving phases (shared inherited files/QRs).
    with recursive retained(id) as (
      select value->>'id' from jsonb_array_elements(phases)
      union
      select e.value->'sourcePhase'->>'id' from retained r,
        jsonb_array_elements(coalesce(project.data->'phaseHistory','[]')) e(value)
        where e.value->'resultingPhaseIds' ? r.id
    ) select coalesce(array_agg(id),'{}') into kept_ids from retained;
    select coalesce(array_agg(id),'{}') into removed_ids from (
      select p_phase_id::text id union
      select value->'sourcePhase'->>'id' from jsonb_array_elements(coalesce(project.data->'phaseHistory','[]'))
    ) ids where not (id=any(kept_ids));
    -- Historical snapshots are no longer needed after deletion; retain only
    -- routing information and surviving opening IDs for old printed QR codes.
    select coalesce(jsonb_agg(value || jsonb_build_object(
      'sourcePhase', (value->'sourcePhase') || jsonb_build_object('data',empty_content),
      'resultingPhaseIds', (select coalesce(jsonb_agg(child),'[]') from jsonb_array_elements_text(value->'resultingPhaseIds') child where child=any(kept_ids)),
      'openingIdsByPhase', (select coalesce(jsonb_object_agg(k,filtered),'{}') from (
        select k,(select coalesce(jsonb_agg(opening_id),'[]') from jsonb_array_elements_text(v) opening_id
          where exists(select 1 from jsonb_array_elements(phases) ph, jsonb_array_elements(ph->'data'->'openings') op where op->>'id'=opening_id)) filtered
        from jsonb_each(value->'openingIdsByPhase') pairs(k,v) where k=any(kept_ids)
      ) routing)
    )),'[]') into history from jsonb_array_elements(coalesce(project.data->'phaseHistory','[]'))
      where value->'sourcePhase'->>'id'=any(kept_ids);
    select value into selected from jsonb_array_elements(phases)
      order by (value->>'id'=project.data->>'activePhaseId') desc limit 1;
    next_data := coalesce(selected->'data',empty_content) || jsonb_build_object(
      'phases',phases,'activePhaseId',coalesce(selected->>'id',''),'phaseHistory',history);
  end if;

  -- Include unindexed uploads as well as registered documents. Storage bytes
  -- MUST be deleted through the Storage API, never by deleting storage.objects.
  select coalesce(array_agg(distinct path),'{}') into paths from (
    select d.storage_path path from public.project_documents d where d.project_id=p_project_id
      and (p_phase_id is null or d.phase_id::text=any(removed_ids))
    union select o.name from storage.objects o where o.bucket_id='project-documents'
      and split_part(o.name,'/',1)=p_project_id::text
      and (p_phase_id is null or split_part(o.name,'/',2)=any(removed_ids))
  ) files;
  -- A prior phase cleanup can use a legacy path; preserve that work before
  -- deleting a project cascades the old queue.
  if to_regclass('public.phase_storage_cleanup') is not null then
    execute 'select $1 || coalesce(array_agg(storage_path),''{}'') from public.phase_storage_cleanup where project_id=$2 and ($3 is null or phase_id::text=any($4))'
      into paths using paths,p_project_id,p_phase_id,removed_ids;
    execute 'delete from public.phase_storage_cleanup where project_id=$1 and ($2 is null or phase_id::text=any($3))'
      using p_project_id,p_phase_id,removed_ids;
  end if;
  insert into access_private.deletion_jobs(project_id,project_name,phase_id,target_name,actor_email,deleted_phase_ids,pending_paths,completed_at)
    values(p_project_id,project.name,p_phase_id,target_name,actor,coalesce(removed_ids,'{}'),paths,
      case when cardinality(paths)=0 then now() end) returning id into job;
  delete from public.production_work_sessions where project_id=p_project_id
    and (p_phase_id is null or phase_id::text=any(removed_ids));
  delete from public.project_documents where project_id=p_project_id
    and (p_phase_id is null or phase_id::text=any(removed_ids));
  if p_phase_id is null then
    delete from public.projects where id=p_project_id;
    return jsonb_build_object('job_id',job,'project',null);
  end if;
  update public.projects set data=next_data where id=p_project_id returning * into project;
  return jsonb_build_object('job_id',job,'project',to_jsonb(project));
end;
$$;

create function access_private.pending_deletion_files() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform access_private.require_global_admin();
  -- Acknowledgement is based on Storage's own metadata, not client claims.
  update access_private.deletion_jobs j set pending_paths=array(
    select distinct path from unnest(j.pending_paths) path
      where exists(select 1 from storage.objects o where o.bucket_id='project-documents' and o.name=path)
  ) where completed_at is null;
  update access_private.deletion_jobs set completed_at=now() where completed_at is null and cardinality(pending_paths)=0;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'target_name',target_name,'paths',pending_paths) order by created_at)
    from access_private.deletion_jobs where completed_at is null),'[]');
end;
$$;

-- Block late uploads/work against a deleted target. Locking the parent makes
-- this check serialize with project/phase deletion; no storage bytes are touched.
create function access_private.check_live_target(p_project_id uuid,p_phase_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.projects where id=p_project_id for share;
  if not found then return false; end if;
  return not exists(select 1 from access_private.deletion_jobs j where j.project_id=p_project_id
    and (j.phase_id is null or p_phase_id=any(j.deleted_phase_ids)));
end;
$$;
create function access_private.check_target_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is not null and not access_private.check_live_target(new.project_id,new.phase_id::text) then
    raise exception 'This project or phase was deleted. Reload before continuing.';
  end if;
  return new;
end;
$$;
create trigger documents_live_target before insert or update on public.project_documents
  for each row execute function access_private.check_target_write();
create trigger work_sessions_live_target before insert or update on public.production_work_sessions
  for each row execute function access_private.check_target_write();
create function access_private.check_storage_target(p_name text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  return access_private.check_live_target(split_part(p_name,'/',1)::uuid,split_part(p_name,'/',2));
exception when invalid_text_representation then return false;
end;
$$;
create policy "Prevent uploads to deleted targets" on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'project-documents' or access_private.check_storage_target(name));
create policy "Prevent moving files to deleted targets" on storage.objects as restrictive for update to authenticated
  using(true) with check(bucket_id<>'project-documents' or access_private.check_storage_target(name));

create function public.delete_workspace_target(p_project_id uuid,p_phase_id uuid,p_expected_version integer,p_confirmation text)
returns jsonb language sql security invoker set search_path = '' as $$
  select access_private.delete_workspace_target(p_project_id,p_phase_id,p_expected_version,p_confirmation);
$$;
create function public.pending_deletion_files() returns jsonb language sql security invoker set search_path = '' as $$
  select access_private.pending_deletion_files();
$$;
revoke all on function access_private.delete_workspace_target(uuid,uuid,integer,text),access_private.pending_deletion_files(),access_private.check_live_target(uuid,text),access_private.check_target_write(),access_private.check_storage_target(text),public.delete_workspace_target(uuid,uuid,integer,text),public.pending_deletion_files() from public,anon,authenticated;
grant execute on function access_private.delete_workspace_target(uuid,uuid,integer,text),access_private.pending_deletion_files(),access_private.check_storage_target(text),public.delete_workspace_target(uuid,uuid,integer,text),public.pending_deletion_files() to authenticated;
notify pgrst,'reload schema';
commit;
