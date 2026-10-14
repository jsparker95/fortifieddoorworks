import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { accessDatabase, asUser, identities } from "./access-db";

test("door/frame cutsheets validate brands and matches and preserve private storage access", async () => {
  const db = await accessDatabase();
  try {
    await db.exec(await readFile("supabase/migrations/20261012212405_hardware_component_documents_brands.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261014152239_door_frame_cutsheets.sql", "utf8"));
    await asUser(db, identities.manager);
    const doorBrand = "00000000-0000-4000-8000-000000000101", frameBrand = "00000000-0000-4000-8000-000000000102", door = "00000000-0000-4000-8000-000000000103";
    await db.query("insert into catalogs(id,category,value) values($1,'Door brands','Door Co'),($2,'Frame brands','Frame Co')", [doorBrand, frameBrand]);
    await db.query("insert into catalogs(category,value) values('Door materials','HM Door'),('Frame types','Welded')");
    await assert.rejects(db.query("insert into catalogs(id,category,value,brand_id) values($1,'Door cutsheets','Series',$2)", [door, frameBrand]), /Door brands/);
    await assert.rejects(db.query("insert into catalogs(id,category,value,brand_id,match_value) values($1,'Door cutsheets','Series',$2,'Welded')", [door, doorBrand]), /automatic match/);
    await db.query("insert into catalogs(id,category,value,brand_id,match_value) values($1,'Door cutsheets','Series',$2,'HM Door')", [door, doorBrand]);
    await db.query("insert into storage.objects(bucket_id,name) values('hardware-component-documents',$1)", [door + "/upload/spec.pdf"]);
    await db.query("update catalogs set document_path=$2,document_name='spec.pdf',document_sha256=$3 where id=$1", [door, door + "/upload/spec.pdf", "a".repeat(64)]);
    await assert.rejects(db.query("update catalogs set document_sha256='not-a-hash' where id=$1", [door]), /check constraint/);
    await db.query("update catalogs set document_path=$2 where id=$1", [door, door + "/legacy-replacement/spec.pdf"]);
    assert.equal((await db.query<{ document_sha256: string | null }>("select document_sha256 from catalogs where id=$1", [door])).rows[0].document_sha256, null);
    await assert.rejects(db.query("update catalogs set category='Frame brands' where id=$1", [doorBrand]), /Reassign/);
    await asUser(db, identities.outsider);
    assert.equal((await db.query("select * from storage.objects where bucket_id='hardware-component-documents'")).rows.length, 0);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('hardware-component-documents',$1)", [door + "/outsider/spec.pdf"]), /row-level security/);
  } finally { await db.close(); }
});
