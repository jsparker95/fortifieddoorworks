alter table public.catalogs add column document_sha256 text;
alter table public.catalogs add constraint catalogs_document_sha256 check (
 document_sha256 is null or (document_path is not null and document_sha256 ~ '^[0-9a-f]{64}$')
);
alter table public.catalogs add column match_value text;
alter table public.catalogs drop constraint catalogs_document_pair;
alter table public.catalogs add constraint catalogs_document_pair check (
 (document_path is null and document_name is null) or
 (document_path is not null and document_name is not null
  and category in ('Hardware components','Door cutsheets','Frame cutsheets','Windows')
  and document_path like id::text || '/%' and length(document_name)>0)
);
alter table public.catalogs add constraint catalogs_match_category check (
 match_value is null or category in ('Door cutsheets','Frame cutsheets')
);
create or replace function public.validate_hardware_component_catalog() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare brand_category text; match_category text;
begin
 -- Older app clients replace paths without sending a new content hash.
 if TG_OP='UPDATE' and new.document_path is distinct from old.document_path
   and new.document_sha256 is not distinct from old.document_sha256 then
  new.document_sha256 := null;
 end if;
 brand_category := case new.category when 'Hardware components' then 'Hardware brands'
   when 'Door cutsheets' then 'Door brands' when 'Frame cutsheets' then 'Frame brands' end;
 if brand_category is not null then
  if new.brand_id is null then
   if TG_OP='INSERT' then raise exception 'Choose a brand from % in Settings.',brand_category; end if;
   if old.category<>new.category or old.brand_id is not null then raise exception 'Choose a brand from % in Settings.',brand_category; end if;
  elsif not exists(select 1 from public.catalogs where id=new.brand_id and category=brand_category) then
   raise exception 'Choose a brand from % in Settings.',brand_category;
  end if;
 elsif new.brand_id is not null then raise exception 'This category cannot have a brand.';
 end if;
 if TG_OP='UPDATE' and old.category<>new.category and exists(select 1 from public.catalogs where brand_id=old.id) then
  raise exception 'This brand is used by components or cutsheets. Reassign their brands first.';
 end if;
 if new.match_value is not null then
  match_category := case new.category when 'Door cutsheets' then 'Door materials' when 'Frame cutsheets' then 'Frame types' end;
  if match_category is null or not exists(select 1 from public.catalogs where category=match_category and value=new.match_value) then
   raise exception 'Choose an automatic match from the corresponding Settings list.';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.validate_hardware_component_catalog() from public,anon,authenticated;
drop policy "Workspace hardware document uploads" on storage.objects;
create policy "Workspace hardware document uploads" on storage.objects for insert to authenticated
with check(bucket_id='hardware-component-documents' and exists(select 1 from public.workspace_members)
 and exists(select 1 from public.catalogs where category in ('Hardware components','Door cutsheets','Frame cutsheets','Windows')
 and id::text=(storage.foldername(name))[1]));
