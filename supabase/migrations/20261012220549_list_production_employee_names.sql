begin;

create function access_private.list_production_employee_names(p_emails text[])
returns table(email text, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Production manager access required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from auth.users u
    join public.workspace_members m on m.email = lower(u.email)
    where u.id = (select auth.uid())
      and m.active
      and m.role in ('manager', 'global_admin')
  ) then
    raise exception 'Production manager access required' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_emails), 0) > 500 then
    raise exception 'Too many employee names requested' using errcode = '22023';
  end if;

  return query
    select m.email, coalesce(nullif(btrim(m.display_name), ''), m.email)
    from public.workspace_members m
    where m.email = any (
      select lower(requested.email)
      from unnest(coalesce(p_emails, array[]::text[])) as requested(email)
    )
    and exists (
      select 1
      from public.production_work_sessions s
      where s.worker_email = m.email
    );
end;
$$;

create function public.list_production_employee_names(p_emails text[])
returns table(email text, display_name text)
language sql
security invoker
set search_path = ''
as $$
  select * from access_private.list_production_employee_names(p_emails);
$$;

revoke all on function access_private.list_production_employee_names(text[]) from public, anon, authenticated;
grant execute on function access_private.list_production_employee_names(text[]) to authenticated;
revoke all on function public.list_production_employee_names(text[]) from public, anon;
grant execute on function public.list_production_employee_names(text[]) to authenticated;

commit;
