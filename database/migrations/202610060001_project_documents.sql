create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  phase_id uuid not null,
  file_name text not null,
  storage_path text not null unique,
  document_type text not null default 'plan_set',
  revision_label text not null default '',
  page_count integer,
  status text not null default 'uploaded' check (status in ('uploaded','indexed','analyzed','needs_review','failed')),
  analysis jsonb,
  created_at timestamptz not null default now()
);
create index if not exists project_documents_project_phase_idx on public.project_documents(project_id, phase_id, created_at desc);
alter table public.project_documents enable row level security;
drop policy if exists "Workspace project documents" on public.project_documents;
create policy "Workspace project documents" on public.project_documents for all to authenticated
  using (exists(select 1 from public.workspace_members))
  with check (exists(select 1 from public.workspace_members));
grant select, insert, update, delete on public.project_documents to authenticated;
revoke all on public.project_documents from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-documents', 'project-documents', false, 104857600, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 104857600, allowed_mime_types = array['application/pdf'];
drop policy if exists "Workspace document storage" on storage.objects;
create policy "Workspace document storage" on storage.objects for all to authenticated
  using (bucket_id = 'project-documents' and exists(select 1 from public.workspace_members))
  with check (bucket_id = 'project-documents' and exists(select 1 from public.workspace_members));
