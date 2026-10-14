alter table public.project_documents
  add column if not exists description text not null default '';

comment on column public.project_documents.description is
  'User-facing document description, including AI-discovered schedule pages.';
