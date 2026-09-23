create table public.workspace_members (email text primary key check(email = lower(email)), display_name text not null default '');
alter table public.workspace_members enable row level security;
create policy "Members see their membership" on public.workspace_members for select to authenticated using (email = lower(((select auth.jwt()) ->> 'email')) and coalesce(((select auth.jwt()) ->> 'is_anonymous'),'false') = 'false');
grant select on public.workspace_members to authenticated;
revoke all on public.workspace_members from anon;
create table public.contractors (id uuid primary key default gen_random_uuid(), name text not null unique check(length(trim(name)) > 0), contact text not null default '', email text not null default '', phone text not null default '');
create table public.catalogs (id uuid primary key default gen_random_uuid(), category text not null, value text not null check(length(trim(value)) > 0), description text not null default '', unique(category,value));
create table public.projects (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) > 0), building text not null default '', contractor_id uuid references public.contractors(id) on delete restrict,
 start_date date, pm text not null default '', jobsite text not null default '', scope text not null default '', cuts text not null default '', status text not null default 'Planning' check (status in ('Planning','Submittal','Approved','In production','Ready to ship','Complete','On hold','Archived')),
 source_id text unique, data jsonb not null default '{"walls":[],"doorTypes":[],"hardware":[],"openings":[],"milestones":{},"references":[],"links":[]}'::jsonb check(jsonb_typeof(data)='object'), version integer not null default 1, updated_at timestamptz not null default now()
);
create index projects_contractor_idx on public.projects(contractor_id);
create index projects_status_idx on public.projects(status);
create index projects_updated_idx on public.projects(updated_at desc);
alter table public.contractors enable row level security;
alter table public.catalogs enable row level security;
alter table public.projects enable row level security;
create policy "Workspace contractors" on public.contractors for all to authenticated using (exists(select 1 from public.workspace_members)) with check (exists(select 1 from public.workspace_members));
create policy "Workspace catalogs" on public.catalogs for all to authenticated using (exists(select 1 from public.workspace_members)) with check (exists(select 1 from public.workspace_members));
create policy "Workspace projects" on public.projects for all to authenticated using (exists(select 1 from public.workspace_members)) with check (exists(select 1 from public.workspace_members));
grant select,insert,update,delete on public.contractors, public.catalogs, public.projects to authenticated;
revoke all on public.contractors, public.catalogs, public.projects from anon;
create function public.increment_project_version() returns trigger language plpgsql security invoker set search_path = '' as $$ begin new.version := old.version + 1; new.updated_at := now(); return new; end; $$;
create trigger projects_version before update on public.projects for each row execute function public.increment_project_version();
