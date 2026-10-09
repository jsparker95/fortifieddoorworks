import assert from "node:assert/strict";
import test from "node:test";
import { accessDatabase, asUser, identities } from "./access-db";
import {
  accountStatus,
  canManageProduction,
  isWorkspaceRole,
} from "../lib/access";

test("role helpers fail closed and retain Global Admin manager privileges", () => {
  assert.equal(isWorkspaceRole("owner"), false);
  assert.equal(isWorkspaceRole(null), false);
  assert.equal(canManageProduction("operator"), false);
  assert.equal(canManageProduction("manager"), true);
  assert.equal(canManageProduction("global_admin"), true);
  assert.equal(
    accountStatus({
      email: "a@b.test",
      display_name: "A",
      role: "operator",
      active: false,
      access_version: 1,
      user_id: null,
      confirmed_at: null,
      last_sign_in_at: null,
    }),
    "Access revoked",
  );
});

test("database enforces administrator access, audit, revocation and manager compatibility", async (t) => {
  const db = await accessDatabase();
  t.after(() => db.close());
  const save = (
    email: string,
    role: string,
    active: boolean,
    version: number | null = 1,
  ) =>
    db.query("select public.save_workspace_access($1,'Test member',$2,$3,$4)", [
      email,
      role,
      active,
      version,
    ]);
  await asUser(db, identities.owner);
  const admins = await db.query<{
    list_workspace_access: { members: { email: string; role: string }[] };
  }>("select public.list_workspace_access()");
  assert.equal(
    admins.rows[0].list_workspace_access.members.filter(
      (m) => m.role === "global_admin",
    ).length,
    2,
  );
  assert.equal(
    (await db.query("select * from workspace_members")).rows.length,
    1,
    "membership RLS must stay self-only",
  );
  await assert.rejects(
    db.query("update workspace_members set role='operator'"),
    /permission denied/,
  );
  await assert.rejects(
    save(identities.owner.email, "operator", true, 2),
    /own Global Admin/,
  );
  await assert.rejects(
    save(identities.owner.email, "global_admin", false, 2),
    /own Global Admin/,
  );
  await save("new@example.test", "operator", true, null);
  await assert.rejects(
    save("new@example.test", "operator", true, null),
    /changed/,
  );
  await assert.rejects(save("bad", "operator", true, null), /valid email/);
  await assert.rejects(
    save("bad@example.test", "superadmin", true, null),
    /valid email/,
  );
  await db.query("insert into vendors(name) values ('Admin vendor')");
  await asUser(db, identities.brian);
  await db.query(
    "update vendors set lead_time_days=25 where name='Admin vendor'",
  );
  await asUser(db, identities.manager);
  await db.query("insert into vendors(name) values ('Manager vendor')");
  await assert.rejects(
    db.query("select public.list_workspace_access()"),
    /Global Admin/,
  );
  await assert.rejects(
    save(identities.manager.email, "global_admin", true),
    /Global Admin/,
  );
  await asUser(db, identities.operator);
  await assert.rejects(
    db.query("insert into vendors(name) values ('Operator vendor')"),
    /row-level security/,
  );
  await assert.rejects(
    db.query("select public.list_workspace_access()"),
    /Global Admin/,
  );
  await db.query(
    "insert into projects(name) values ('Allowed operator project')",
  );
  await db.query(
    "insert into production_work_sessions(worker_email,work_kind) values($1,'shift')",
    [identities.operator.email],
  );
  await db.query(
    "insert into storage.objects(bucket_id,name) values('avatars',$1)",
    [`${identities.operator.id}/avatar`],
  );
  await asUser(db, identities.outsider);
  assert.equal((await db.query("select * from projects")).rows.length, 0);
  await assert.rejects(
    db.query("select public.list_workspace_access()"),
    /Global Admin/,
  );
  await asUser(db, identities.owner, true);
  await assert.rejects(
    db.query("select public.list_workspace_access()"),
    /Global Admin/,
  );
  assert.equal((await db.query("select * from projects")).rows.length, 0);
  await asUser(db, null);
  await assert.rejects(
    db.query("select public.list_workspace_access()"),
    /permission denied/,
  );
  await asUser(db, identities.owner);
  await save(identities.operator.email, "operator", false);
  await assert.rejects(
    save(identities.operator.email, "manager", true),
    /changed/,
  );
  await asUser(db, identities.operator);
  for (const table of [
    "workspace_members",
    "projects",
    "vendors",
    "production_work_sessions",
    "storage.objects",
  ]) {
    assert.equal(
      (await db.query(`select * from ${table}`)).rows.length,
      0,
      `revoked token still accesses ${table}`,
    );
  }
  await assert.rejects(
    db.query("insert into projects(name) values ('Revoked project')"),
    /row-level security/,
  );
  assert.equal(
    (
      await db.query(
        "update production_work_sessions set status='completed', ended_at=now() returning id",
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    db.query("select * from access_private.access_events"),
    /permission denied/,
  );
  await asUser(db, identities.owner);
  await save(identities.operator.email, "manager", true, 2);
  await asUser(db, identities.operator);
  assert.equal(
    (await db.query("select * from production_work_sessions")).rows.length,
    1,
    "revocation must retain history",
  );
  await db.query(
    "update production_work_sessions set status='completed',ended_at=now() where worker_email=$1",
    [identities.operator.email],
  );
  await db.query(
    "insert into production_work_sessions(worker_email,work_kind) values($1,'shift')",
    [identities.operator.email],
  );
  await db.query(
    "insert into production_work_sessions(worker_email,work_kind,coded_category) values($1,'coded','Training')",
    [identities.operator.email],
  );
  await db.query(
    "update production_work_sessions set status='pending_approval',ended_at=now() where work_kind='coded'",
  );
  await asUser(db, identities.brian);
  await assert.rejects(
    db.query(
      "update production_work_sessions set status='approved',approved_by=null,approved_at=now() where work_kind='coded'",
    ),
    /reviewing manager/,
  );
  const approved = await db.query(
    "update production_work_sessions set status='approved',approved_by=$1,approved_at=now() where work_kind='coded' returning id",
    [identities.brian.email],
  );
  assert.equal(
    approved.rows.length,
    1,
    "Global Admin must be able to review time",
  );
  await asUser(db, identities.owner);
  await save(identities.brian.email, "global_admin", false, 2);
  await asUser(db, identities.brian);
  await assert.rejects(
    db.query("select public.list_workspace_access()"),
    /Global Admin/,
  );
  await assert.rejects(
    save("new@example.test", "global_admin", true),
    /Global Admin/,
  );
  await asUser(db, identities.owner);
  const history = await db.query<{
    list_workspace_access: { events: { action: string }[] };
  }>("select public.list_workspace_access()");
  assert.equal(
    history.rows[0].list_workspace_access.events.filter(
      (e) => e.action === "Revoked",
    ).length,
    2,
  );
  await assert.rejects(
    save(identities.owner.email, "operator", true, 2),
    /own Global Admin/,
  );
  await db.exec("reset role");
  const functions = await db.query<{ proname: string; safe: boolean }>(
    "select p.proname, coalesce(p.proconfig @> ARRAY['search_path=\"\"'],false) as safe from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='access_private'",
  );
  assert.ok(functions.rows.length >= 3);
  assert.ok(
    functions.rows.every((fn) => fn.safe),
    "private definer functions must pin search_path",
  );
  assert.equal(
    (
      await db.query<{ allowed: boolean }>(
        "select has_function_privilege('anon','public.save_workspace_access(text,text,text,boolean,integer)','execute') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  assert.equal(
    (
      await db.query<{ allowed: boolean }>(
        "select has_function_privilege('authenticated','access_private.require_global_admin()','execute') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
});
