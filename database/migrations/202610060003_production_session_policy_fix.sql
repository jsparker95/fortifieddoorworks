create or replace function public.validate_production_work_session_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  manager_user boolean;
  own_active_timer boolean;
begin
  select exists(select 1 from public.workspace_members wm where wm.email = lower(((select auth.jwt()) ->> 'email')) and wm.role = 'manager')
    into manager_user;
  own_active_timer := old.worker_email = lower(((select auth.jwt()) ->> 'email')) and old.status = 'running'
    and new.status in ('completed','pending_approval') and new.ended_at is not null;

  if manager_user and old.work_kind = 'coded' and old.status = 'pending_approval' and new.status in ('approved','rejected') then
    if (to_jsonb(new) - 'status' - 'approved_by' - 'approved_at') <> (to_jsonb(old) - 'status' - 'approved_by' - 'approved_at') then
      raise exception 'Coded-time review cannot change the original time entry';
    end if;
    if new.approved_by <> lower(((select auth.jwt()) ->> 'email')) or new.approved_at is null then
      raise exception 'A review must record the reviewing manager and timestamp';
    end if;
  elsif own_active_timer then
    if (to_jsonb(new) - 'status' - 'ended_at') <> (to_jsonb(old) - 'status' - 'ended_at') then
      raise exception 'Stopping a timer cannot alter its original details';
    end if;
    if (old.work_kind = 'coded' and new.status <> 'pending_approval') or (old.work_kind <> 'coded' and new.status <> 'completed') then
      raise exception 'Coded time must be submitted for review; production timers are completed';
    end if;
  else
    raise exception 'Only the timer owner may stop it; managers may review pending coded-time entries';
  end if;
  return new;
end;
$$;

alter table public.production_work_sessions
  drop constraint if exists production_work_sessions_ended_after_start;
alter table public.production_work_sessions
  add constraint production_work_sessions_ended_after_start
  check (ended_at is null or ended_at >= started_at);
