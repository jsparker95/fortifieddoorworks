alter table public.catalogs
  add column brand_id uuid references public.catalogs(id) on delete restrict,
  add column document_path text,
  add column document_name text;
create index catalogs_brand_id_idx on public.catalogs(brand_id) where brand_id is not null;
alter table public.catalogs add constraint catalogs_document_pair check (
  (document_path is null and document_name is null) or
  (document_path is not null and document_name is not null and category = 'Hardware components' and document_path like id::text || '/%' and length(document_name) > 0)
);

-- Existing unassigned components are retained; new components require a real hardware brand.
create function public.validate_hardware_component_catalog() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.category = 'Hardware components' then
    if new.brand_id is null then
      if TG_OP = 'INSERT' then raise exception 'Choose a hardware brand for this component.'; end if;
      if old.category <> 'Hardware components' or old.brand_id is not null then
        raise exception 'Choose a hardware brand for this component.';
      end if;
    elsif not exists (select 1 from public.catalogs where id = new.brand_id and category = 'Hardware brands') then
      raise exception 'Choose a brand from Hardware brands in Settings.';
    end if;
  elsif new.brand_id is not null then
    raise exception 'Only hardware components can have a hardware brand.';
  end if;
  if TG_OP = 'UPDATE' and old.category = 'Hardware brands' and new.category <> 'Hardware brands'
    and exists (select 1 from public.catalogs where brand_id = old.id) then
    raise exception 'This brand is used by hardware components. Reassign their brands first.';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_hardware_component_catalog() from public, anon, authenticated;
create trigger validate_hardware_component_catalog before insert or update on public.catalogs
for each row execute function public.validate_hardware_component_catalog();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('hardware-component-documents','hardware-component-documents',false,20971520,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png','text/plain']);
create policy "Workspace hardware document reads" on storage.objects for select to authenticated
using (bucket_id = 'hardware-component-documents' and exists (select 1 from public.workspace_members));
create policy "Workspace hardware document uploads" on storage.objects for insert to authenticated
with check (bucket_id = 'hardware-component-documents' and exists (select 1 from public.workspace_members)
  and exists (select 1 from public.catalogs where category = 'Hardware components' and id::text = (storage.foldername(name))[1]));
create policy "Workspace hardware document cleanup" on storage.objects for delete to authenticated
using (bucket_id = 'hardware-component-documents' and exists (select 1 from public.workspace_members));
