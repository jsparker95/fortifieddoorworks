alter table public.workspace_members
  add column if not exists role text not null default 'operator'
  check (role in ('operator','manager'));
update public.workspace_members
set role = 'manager'
where lower(email) = 'brian@fortifieddoor.com';

with legacy_projects as (
  select id, data, gen_random_uuid() as phase_id
  from public.projects
  where jsonb_typeof(data -> 'phases') is distinct from 'array'
     or jsonb_array_length(case when jsonb_typeof(data -> 'phases') = 'array' then data -> 'phases' else '[]'::jsonb end) = 0
)
update public.projects p
set data = legacy_projects.data || jsonb_build_object(
  'phases', jsonb_build_array(jsonb_build_object(
    'id', legacy_projects.phase_id::text,
    'name', 'Phase 1',
    'createdAt', now()::text,
    'data', legacy_projects.data - 'phases' - 'activePhaseId' - 'phaseHistory'
  )),
  'activePhaseId', legacy_projects.phase_id::text,
  'phaseHistory', '[]'::jsonb
)
from legacy_projects
where p.id = legacy_projects.id;

create table if not exists public.production_work_sessions (
  id uuid primary key default gen_random_uuid(),
  worker_email text not null references public.workspace_members(email) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  phase_id uuid,
  opening_id uuid,
  opening_mark text not null default '',
  work_kind text not null check (work_kind in ('shift','frame','door','hardware','coded')),
  coded_category text not null default '',
  status text not null default 'running' check (status in ('running','completed','pending_approval','approved','rejected')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  piece_rate_hours numeric(8,3) not null default 0 check (piece_rate_hours >= 0),
  notes text not null default '',
  approved_by text references public.workspace_members(email),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'running' and ended_at is null) or (status <> 'running' and ended_at is not null)),
  check ((work_kind = 'coded' and coded_category <> '') or work_kind <> 'coded'),
  check ((work_kind in ('frame','door','hardware') and project_id is not null and phase_id is not null and opening_id is not null) or work_kind not in ('frame','door','hardware'))
);
create unique index if not exists one_open_shift_per_worker
  on public.production_work_sessions(worker_email)
  where work_kind = 'shift' and status = 'running';
create unique index if not exists one_open_task_per_worker
  on public.production_work_sessions(worker_email)
  where work_kind <> 'shift' and status = 'running';
create index if not exists production_sessions_worker_started_idx
  on public.production_work_sessions(worker_email, started_at desc);
create index if not exists production_sessions_project_phase_idx
  on public.production_work_sessions(project_id, phase_id, started_at desc);

create or replace function public.prepare_production_work_session()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  configured_rate numeric;
begin
  if new.work_kind = 'shift' then
    if new.project_id is not null or new.phase_id is not null or new.opening_id is not null then
      raise exception 'Shift sessions are not tied to a project opening';
    end if;
    new.piece_rate_hours := 0;
    return new;
  end if;

  if not exists (
    select 1 from public.production_work_sessions s
    where s.worker_email = new.worker_email and s.work_kind = 'shift' and s.status = 'running'
  ) then
    raise exception 'Start a shift before starting a work or coded-time session';
  end if;

  if new.work_kind in ('frame','door','hardware') then
    select coalesce(nullif(opening.value ->> 'pieceRateHours', '')::numeric, 0)
      into configured_rate
    from public.projects p
    cross join lateral jsonb_array_elements(coalesce(p.data -> 'phases', '[]'::jsonb)) phase(value)
    cross join lateral jsonb_array_elements(coalesce(phase.value -> 'data' -> 'openings', '[]'::jsonb)) opening(value)
    where p.id = new.project_id
      and phase.value ->> 'id' = new.phase_id::text
      and opening.value ->> 'id' = new.opening_id::text
    limit 1;
    if configured_rate is null then
      raise exception 'Opening is not saved in the selected project phase';
    end if;
    new.piece_rate_hours := case when new.work_kind = 'frame' then configured_rate else 0 end;
  else
    new.piece_rate_hours := 0;
  end if;
  return new;
end;
$$;
drop trigger if exists production_work_session_prepare on public.production_work_sessions;
create trigger production_work_session_prepare
  before insert on public.production_work_sessions
  for each row execute function public.prepare_production_work_session();

create or replace function public.validate_production_work_session_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  manager_user boolean;
begin
  select exists(select 1 from public.workspace_members wm where wm.email = lower(((select auth.jwt()) ->> 'email')) and wm.role = 'manager')
    into manager_user;
  if manager_user then
    if old.work_kind <> 'coded' or old.status <> 'pending_approval' or new.status not in ('approved','rejected') then
      raise exception 'Managers may only approve or reject pending coded-time entries';
    end if;
    if (to_jsonb(new) - 'status' - 'approved_by' - 'approved_at') <> (to_jsonb(old) - 'status' - 'approved_by' - 'approved_at') then
      raise exception 'Coded-time review cannot change the original time entry';
    end if;
    if new.approved_by <> lower(((select auth.jwt()) ->> 'email')) or new.approved_at is null then
      raise exception 'A review must record the reviewing manager and timestamp';
    end if;
  else
    if old.worker_email <> lower(((select auth.jwt()) ->> 'email')) or old.status <> 'running' or new.status not in ('completed','pending_approval') or new.ended_at is null then
      raise exception 'Operators may only stop their own running timer';
    end if;
    if (to_jsonb(new) - 'status' - 'ended_at') <> (to_jsonb(old) - 'status' - 'ended_at') then
      raise exception 'Stopping a timer cannot alter its original details';
    end if;
    if (old.work_kind = 'coded' and new.status <> 'pending_approval') or (old.work_kind <> 'coded' and new.status <> 'completed') then
      raise exception 'Coded time must be submitted for review; production timers are completed';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists production_work_session_validate_update on public.production_work_sessions;
create trigger production_work_session_validate_update
  before update on public.production_work_sessions
  for each row execute function public.validate_production_work_session_update();

alter table public.production_work_sessions enable row level security;
drop policy if exists "Operators read own sessions; managers read all" on public.production_work_sessions;
drop policy if exists "Operators create own running sessions" on public.production_work_sessions;
drop policy if exists "Operators stop own running sessions; managers review" on public.production_work_sessions;
create policy "Operators read own sessions; managers read all"
  on public.production_work_sessions for select to authenticated
  using (worker_email = lower(((select auth.jwt()) ->> 'email')) or exists(
    select 1 from public.workspace_members wm
    where wm.email = lower(((select auth.jwt()) ->> 'email')) and wm.role = 'manager'
  ));
create policy "Operators create own running sessions"
  on public.production_work_sessions for insert to authenticated
  with check (
    worker_email = lower(((select auth.jwt()) ->> 'email'))
    and exists(select 1 from public.workspace_members wm where wm.email = worker_email)
    and status = 'running' and ended_at is null and approved_by is null and approved_at is null
  );
create policy "Operators stop own running sessions; managers review"
  on public.production_work_sessions for update to authenticated
  using (
    exists(select 1 from public.workspace_members wm where wm.email = lower(((select auth.jwt()) ->> 'email')) and wm.role = 'manager')
    or (worker_email = lower(((select auth.jwt()) ->> 'email')) and status = 'running')
  )
  with check (
    exists(select 1 from public.workspace_members wm where wm.email = lower(((select auth.jwt()) ->> 'email')) and wm.role = 'manager')
    or (
      worker_email = lower(((select auth.jwt()) ->> 'email'))
      and status in ('completed','pending_approval')
      and ended_at is not null and approved_by is null and approved_at is null
    )
  );
grant select, insert, update on public.production_work_sessions to authenticated;
revoke all on public.production_work_sessions from anon;
