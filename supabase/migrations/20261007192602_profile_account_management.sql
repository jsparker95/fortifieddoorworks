insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can view their own avatar uploads" on storage.objects;
create policy "Users can view their own avatar uploads"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can upload their own avatars" on storage.objects;
create policy "Users can upload their own avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update their own avatars" on storage.objects;
create policy "Users can update their own avatars"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete their own avatars" on storage.objects;
create policy "Users can delete their own avatars"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

alter table public.production_work_sessions
  drop constraint production_work_sessions_approved_by_fkey,
  add constraint production_work_sessions_approved_by_fkey
    foreign key (approved_by) references public.workspace_members(email) on update cascade,
  drop constraint production_work_sessions_worker_email_fkey,
  add constraint production_work_sessions_worker_email_fkey
    foreign key (worker_email) references public.workspace_members(email) on update cascade on delete restrict;

create or replace function public.sync_workspace_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and lower(new.email) is distinct from lower(old.email) then
    if exists (
      select 1
      from public.workspace_members as member
      where member.email = lower(new.email)
        and member.email <> lower(old.email)
    ) then
      raise exception 'This email is already assigned to a workspace member.';
    end if;

    update public.workspace_members
    set email = lower(new.email)
    where email = lower(old.email);
  end if;

  return new;
end;
$$;

revoke all on function public.sync_workspace_member_email() from public, anon, authenticated;

drop trigger if exists sync_workspace_member_email on auth.users;
create trigger sync_workspace_member_email
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_workspace_member_email();
