import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { accessDatabase, asUser, identities } from "./access-db";
const migration = "supabase/migrations/20261012212405_hardware_component_documents_brands.sql";

test("hardware brands and private document access preserve existing settings", async () => {
  const db = await accessDatabase();
  try {
    const legacy = "00000000-0000-4000-8000-000000000090";
    const brand = "00000000-0000-4000-8000-000000000091";
    const component = "00000000-0000-4000-8000-000000000092";
    const other = "00000000-0000-4000-8000-000000000093";
    await db.query("insert into catalogs(id,category,value) values ($1,'Hardware components','Legacy')", [legacy]);
    await db.exec(await readFile(migration, "utf8"));
    await asUser(db, identities.manager);
    await db.query("update catalogs set description='still editable' where id=$1", [legacy]);
    await db.query("insert into catalogs(id,category,value) values ($1,'Hardware brands','Rockwood'),($2,'Door brands','DCI')", [brand, other]);
    await assert.rejects(db.query("insert into catalogs(id,category,value) values ($1,'Hardware components','Plate')", [component]), /Choose a hardware brand/);
    await assert.rejects(db.query("insert into catalogs(id,category,value,brand_id) values ($1,'Hardware components','Plate',$2)", [component, other]), /Hardware brands/);
    await db.query("insert into catalogs(id,category,value,brand_id) values ($1,'Hardware components','Plate',$2)", [component, brand]);
    await assert.rejects(db.query("update catalogs set brand_id=null where id=$1", [component]), /Choose a hardware brand/);
    await assert.rejects(db.query("delete from catalogs where id=$1", [brand]), /foreign key/);
    await assert.rejects(db.query("update catalogs set category='Door brands' where id=$1", [brand]), /Reassign/);
    await db.query("insert into storage.objects(bucket_id,name) values('hardware-component-documents',$1)", [component + "/upload/spec.pdf"]);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('hardware-component-documents',$1)", [other + "/upload/spec.pdf"]), /row-level security/);
    await db.query("update catalogs set document_path=$2,document_name='spec.pdf' where id=$1", [component, component + "/upload/spec.pdf"]);
    await assert.rejects(db.query("update catalogs set document_path=$2 where id=$1", [component, other + "/upload/spec.pdf"]), /check constraint/);
    await assert.rejects(db.query("update catalogs set document_path=null where id=$1", [component]), /check constraint/);
    await db.query("update catalogs set value='Rockwood renamed' where id=$1", [brand]);
    assert.equal((await db.query<{ brand_id: string }>("select brand_id from catalogs where id=$1", [component])).rows[0].brand_id, brand);
    await asUser(db, identities.outsider);
    assert.equal((await db.query("select * from storage.objects where bucket_id='hardware-component-documents'")).rows.length, 0);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('hardware-component-documents',$1)", [component + "/outsider/spec.pdf"]), /row-level security/);
    await asUser(db, null);
    await assert.rejects(db.query("select * from storage.objects"), /permission denied/);
    await asUser(db, identities.manager);
    assert.equal((await db.query("select * from storage.objects where bucket_id='hardware-component-documents'")).rows.length, 1);
    await db.query("delete from storage.objects where bucket_id='hardware-component-documents'");
  } finally { await db.close(); }
});
