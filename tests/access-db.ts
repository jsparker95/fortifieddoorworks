import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export const identities = {
  owner: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "jsparker95@gmail.com",
  },
  brian: {
    id: "00000000-0000-4000-8000-000000000002",
    email: "brian@fortifieddoor.com",
  },
  operator: {
    id: "00000000-0000-4000-8000-000000000003",
    email: "operator@example.test",
  },
  manager: {
    id: "00000000-0000-4000-8000-000000000004",
    email: "manager@example.test",
  },
  outsider: {
    id: "00000000-0000-4000-8000-000000000005",
    email: "outsider@example.test",
  },
};
export async function accessDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,last_sign_in_at timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema public,auth,storage to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
  `);
  for (const file of [
    "database/schema.sql",
    "database/migrations/202610060001_project_documents.sql",
    "database/migrations/202610060002_shopfloor_time_tracking.sql",
    "database/migrations/202610060003_production_session_policy_fix.sql",
    "database/migrations/202610060004_vendor_lead_times.sql",
    "supabase/migrations/20261007192602_profile_account_management.sql",
  ]) {
    await db.exec(await readFile(file, "utf8"));
  }
  for (const [key, identity] of Object.entries(identities)) {
    await db.query("insert into auth.users values($1,$2,now(),null)", [
      identity.id,
      identity.email,
    ]);
    if (key !== "outsider")
      await db.query("insert into public.workspace_members values($1,$2,$3)", [
        identity.email,
        key === "owner"
          ? "Joseph Parker"
          : key === "brian"
            ? "Brian Jarvis"
            : key,
        key === "manager" || key === "brian" ? "manager" : "operator",
      ]);
  }
  await db.exec(
    await readFile(
      "supabase/migrations/20261009033356_workspace_access_management.sql",
      "utf8",
    ),
  );
  await db.exec(await readFile("supabase/migrations/20261009201707_global_admin_deletion.sql", "utf8"));
  return db;
}
export async function asUser(
  db: PGlite,
  identity: { id: string; email: string } | null,
  anonymous = false,
) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(
      identity
        ? { sub: identity.id, email: identity.email, is_anonymous: anonymous }
        : {},
    ),
  ]);
  await db.exec(`set role ${identity ? "authenticated" : "anon"}`);
}
