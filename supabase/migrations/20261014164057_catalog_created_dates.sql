-- Keep pre-existing dates unknown: a migration timestamp is not a creation date.
alter table public.catalogs add column created_at timestamptz;
alter table public.catalogs alter column created_at set default now();

create function public.preserve_catalog_created_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger preserve_catalog_created_at before insert or update on public.catalogs
for each row execute function public.preserve_catalog_created_at();
