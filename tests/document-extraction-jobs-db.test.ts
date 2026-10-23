import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('job migration restricts writes and artifacts, prevents duplicate active work, and preserves completed tasks', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create schema storage;
   create table auth.users(id uuid primary key);
   create table public.projects(id uuid primary key);
   alter table public.projects enable row level security;
   create policy member_projects on public.projects for select to authenticated using(current_setting('test.member',true) = 'yes');
   grant usage on schema public,auth,storage to authenticated,anon,service_role;
   grant select on public.projects to authenticated;
   create table public.project_documents(id uuid primary key);
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   insert into auth.users values('00000000-0000-4000-8000-000000000001');
   insert into projects values('00000000-0000-4000-8000-000000000002');
   insert into project_documents values('00000000-0000-4000-8000-000000000003');`);
  await db.exec(await readFile('supabase/migrations/20261023144042_document_extraction_jobs.sql','utf8'));
  const insert = `insert into document_extraction_jobs(document_id,project_id,phase_id,created_by,actor_email) values('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','test@example.test')`;
  await db.exec(insert);
  await assert.rejects(db.exec(insert), /duplicate key/);
  await db.exec(`set test.member='yes'; set role authenticated`);
  assert.equal((await db.query('select * from document_extraction_jobs')).rows.length,1);
  await assert.rejects(db.exec(`update document_extraction_jobs set status='complete'`),/permission denied/);
  await assert.rejects(db.query('select * from document_extraction_tasks'),/permission denied/);
  await db.exec(`set test.member='no'`);
  assert.equal((await db.query('select * from document_extraction_jobs')).rows.length,0);
  await db.exec(`reset role; update document_extraction_jobs set status='partial'`);
  await db.exec(insert);
  assert.equal((await db.query<{public:boolean}>('select public from storage.buckets')).rows[0].public,false);
  await db.exec(`insert into document_extraction_tasks(job_id,task_key,kind,input,status,result)
    select id,'doors:1:0','doors','{}','complete','{"openings":[{"mark":"101"}]}' from document_extraction_jobs limit 1`);
  await db.exec(`insert into document_extraction_tasks(job_id,task_key,kind,input)
    select job_id,task_key,kind,input from document_extraction_tasks on conflict(job_id,task_key) do nothing`);
  assert.equal((await db.query<{status:string}>('select status from document_extraction_tasks')).rows[0].status,'complete');
 } finally { await db.close(); }
});
