-- Durable extraction state is written only by the server worker. Workspace
-- members may observe progress through their existing membership access.
create table public.document_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  phase_id uuid not null,
  created_by uuid not null references auth.users(id),
  actor_email text not null,
  status text not null default 'queued' check (status in ('queued','indexing','locating','extracting','complete','partial','failed')),
  manual_pages integer[] not null default '{}',
  workflow_run_id text,
  index_path text,
  import_enabled boolean not null default false,
  progress jsonb not null default '{}',
  analysis jsonb,
  description text not null default '',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index document_extraction_one_active on public.document_extraction_jobs(document_id, phase_id)
  where status in ('queued','indexing','locating','extracting');
create index document_extraction_job_document on public.document_extraction_jobs(document_id, created_at desc);
alter table public.document_extraction_jobs enable row level security;
create policy "Workspace reads extraction progress" on public.document_extraction_jobs for select to authenticated
  using (exists(select 1 from public.projects p where p.id=project_id));
revoke all on public.document_extraction_jobs from anon, authenticated;
grant select on public.document_extraction_jobs to authenticated;
grant all on public.document_extraction_jobs to service_role;

create table public.document_extraction_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.document_extraction_jobs(id) on delete cascade,
  task_key text not null,
  kind text not null,
  status text not null default 'pending' check (status in ('pending','running','complete','failed')),
  input jsonb not null,
  result jsonb,
  attempts integer not null default 0,
  metrics jsonb not null default '{}',
  error jsonb,
  updated_at timestamptz not null default now(),
  unique(job_id,task_key)
);
alter table public.document_extraction_tasks enable row level security;
revoke all on public.document_extraction_tasks from anon, authenticated;
grant all on public.document_extraction_tasks to service_role;
create index document_extraction_tasks_job_status on public.document_extraction_tasks(job_id,status);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('document-analysis','document-analysis',false,104857600,array['application/json','application/pdf','image/png'])
on conflict(id) do nothing;
-- No browser storage policies: only the server worker can read these artifacts.
