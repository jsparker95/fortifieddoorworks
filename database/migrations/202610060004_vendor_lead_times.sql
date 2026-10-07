create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  lead_time_days integer not null default 21 check (lead_time_days between 0 and 730),
  categories text[] not null default '{}',
  contact text not null default '',
  email text not null default '',
  phone text not null default '',
  notes text not null default '',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.vendors enable row level security;
drop policy if exists "Workspace members read vendors" on public.vendors;
drop policy if exists "Managers maintain vendors" on public.vendors;
create policy "Workspace members read vendors" on public.vendors for select to authenticated
  using (exists(select 1 from public.workspace_members));
create policy "Managers maintain vendors" on public.vendors for all to authenticated
  using (exists(select 1 from public.workspace_members wm where wm.email = lower(((select auth.jwt()) ->> 'email')) and wm.role = 'manager'))
  with check (exists(select 1 from public.workspace_members wm where wm.email = lower(((select auth.jwt()) ->> 'email')) and wm.role = 'manager'));
grant select, insert, update, delete on public.vendors to authenticated;
revoke all on public.vendors from anon;
create or replace function public.touch_vendor_updated_at()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists vendors_updated_at on public.vendors;
create trigger vendors_updated_at before update on public.vendors
  for each row execute function public.touch_vendor_updated_at();
