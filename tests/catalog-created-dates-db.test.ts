import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { accessDatabase, asUser, identities } from "./access-db";

test("catalog creation dates are server assigned and survive edits and upserts, with historical dates unknown", async () => {
  const db = await accessDatabase();
  try {
    await db.exec("insert into public.catalogs(category,value) values('Door brands','Legacy')");
    await db.exec(await readFile("supabase/migrations/20261014164057_catalog_created_dates.sql", "utf8"));
    await asUser(db, identities.manager);
    assert.equal((await db.query<{ created_at: null }>("select created_at from catalogs where value='Legacy'")).rows[0].created_at, null);
    const id = "00000000-0000-4000-8000-000000000123";
    const started = Date.now();
    const inserted = await db.query<{ created_at: Date }>("insert into catalogs(id,category,value,created_at) values($1,'Door brands','New','2000-01-01') returning created_at", [id]);
    const created = inserted.rows[0].created_at;
    assert.ok(created.getTime() >= started && created.getTime() <= Date.now());
    await db.query("update catalogs set description='Updated',created_at=null where id=$1", [id]);
    await db.query("insert into catalogs(id,category,value) values($1,'Door brands','Renamed') on conflict(id) do update set value=excluded.value,created_at=excluded.created_at", [id]);
    assert.equal((await db.query<{ created_at: Date }>("select created_at from catalogs where id=$1", [id])).rows[0].created_at.getTime(), created.getTime());
    await db.exec("update catalogs set description='Changed legacy',created_at=now() where value='Legacy'");
    assert.equal((await db.query<{ created_at: null }>("select created_at from catalogs where value='Legacy'")).rows[0].created_at, null);
    const defaults = await db.query<{ created_at: Date }>("insert into catalogs(category,value) values('Door brands','Default') returning created_at");
    assert.ok(defaults.rows[0].created_at instanceof Date);
    await asUser(db, identities.outsider);
    assert.equal((await db.query("select * from catalogs")).rows.length, 0);
    await assert.rejects(db.exec("insert into catalogs(category,value) values('Door brands','Denied')"), /row-level security/);
  } finally { await db.close(); }
});
