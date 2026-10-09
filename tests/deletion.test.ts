import test from "node:test";
import assert from "node:assert/strict";
import { accessDatabase, asUser, identities } from "./access-db";
import { normalizeProject, persistActivePhase, phaseAncestors } from "../lib/phases";
import { emptyPhaseContent, newProject, type Project } from "../lib/types";

const projectId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const first = "20000000-0000-4000-8000-000000000001";
const second = "20000000-0000-4000-8000-000000000002";
const ancestor = "20000000-0000-4000-8000-000000000003";
const phase = (id: string, name: string) => ({ id, name, createdAt: new Date().toISOString(), data: { ...emptyPhaseContent(), openings: [{ id: id.replace("2000", "3000"), name }] } });

test("Global Admin deletion removes records, preserves sibling files, and resumes Storage cleanup", async () => {
  const db = await accessDatabase();
  try {
    const a = phase(first, "First phase");
    const b = phase(second, "Second phase");
    const data = { ...a.data, phases: [a, b], activePhaseId: first, phaseHistory: [{
      id: "split", at: "2026-10-01", sourcePhase: phase(ancestor, "Original"), resultingPhaseIds: [first, second],
      openingIdsByPhase: { [first]: a.data.openings.map((o) => o.id), [second]: b.data.openings.map((o) => o.id) },
    }] };
    await db.query("insert into public.projects(id,name,data) values($1,'Delete test',$2),($3,'Unrelated project',$2)", [projectId, JSON.stringify(data), otherId]);
    await db.query("insert into public.production_work_sessions(worker_email,work_kind) values($1,'shift')",[identities.operator.email]);
    for (const id of [first, second, ancestor]) {
      const path = `${projectId}/${id}/plan.pdf`;
      await db.query("insert into public.project_documents(project_id,phase_id,file_name,storage_path) values($1,$2,'plan.pdf',$3)", [projectId,id,path]);
      await db.query("insert into storage.objects(bucket_id,name) values('project-documents',$1)", [path]);
      await db.query("insert into public.production_work_sessions(worker_email,project_id,phase_id,work_kind,coded_category,status,ended_at) values($1,$2,$3,'coded','Shop work','completed',now())", [identities.operator.email,projectId,id]);
    }
    await db.query("insert into storage.objects(bucket_id,name) values('project-documents',$1),('project-documents',$2)", [`${projectId}/${first}/unindexed.pdf`,`${otherId}/${first}/keep.pdf`]);
    const remove = (phaseId: string | null, version: number, name: string) => db.query<{result: {project: Project|null}}>("select public.delete_workspace_target($1,$2,$3,$4) result",[projectId,phaseId,version,name]);
    for (const identity of [identities.operator, identities.manager, identities.outsider, null]) {
      await asUser(db,identity);
      await assert.rejects(remove(null,1,"Delete test"), /Global Admin|permission denied/);
      await assert.rejects(db.query("select public.pending_deletion_files()"), /Global Admin|permission denied/);
    }
    await asUser(db,identities.owner,true);
    await assert.rejects(remove(null,1,"Delete test"), /Global Admin/);
    await asUser(db,identities.brian);
    await assert.rejects(remove(first,99,"First phase"),/changed/);
    await assert.rejects(remove(first,1,"Wrong name"),/exact name/);
    const result = (await remove(first,1,"First phase")).rows[0].result;
    assert.equal(result.project?.version,2);
    assert.equal(result.project?.data.phases?.length,1);
    assert.equal(result.project?.data.activePhaseId,second);
    assert.equal(result.project?.data.openings[0].name,"Second phase");
    assert.deepEqual(phaseAncestors(result.project!.data,second),[second,ancestor]);
    assert.deepEqual(result.project?.data.phaseHistory?.[0].resultingPhaseIds,[second]);
    assert.deepEqual(result.project?.data.phaseHistory?.[0].sourcePhase.data.openings,[]);
    assert.equal((await db.query("select * from public.project_documents where phase_id=$1",[first])).rows.length,0);
    assert.equal((await db.query("select * from public.project_documents where phase_id=$1",[ancestor])).rows.length,1);
    assert.equal((await db.query("select * from public.production_work_sessions where phase_id=$1",[first])).rows.length,0);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('project-documents',$1)",[`${projectId}/${first}/late.pdf`]),/row-level security/);
    await assert.rejects(db.query("insert into public.project_documents(project_id,phase_id,file_name,storage_path) values($1,$2,'late.pdf','late')",[projectId,first]),/deleted/);
    await assert.rejects(remove(first,1,"First phase"),/changed/);
    const pending = async () => (await db.query<{jobs: {paths:string[]}[]}>("select public.pending_deletion_files() jobs")).rows[0].jobs;
    assert.equal((await pending())[0].paths.length,2,"bytes remain queued until Storage succeeds");
    assert.equal((await pending())[0].paths.length,2,"retry does not discard pending files");
    // Isolated fixture simulates Storage API success; never delete production
    // storage metadata directly (real app uses storage.remove).
    await db.query("delete from storage.objects where name=$1",[`${projectId}/${first}/plan.pdf`]);
    assert.equal((await pending())[0].paths.length,1);
    await db.query("delete from storage.objects where name=$1",[`${projectId}/${first}/unindexed.pdf`]);
    assert.deepEqual(await pending(),[]);
    const empty = (await remove(second,2,"Second phase")).rows[0].result.project!;
    assert.deepEqual(empty.data.phases,[]);
    assert.deepEqual(empty.data.phaseHistory,[]);
    assert.deepEqual(normalizeProject(empty).data.phases,[]);
    assert.deepEqual(persistActivePhase(empty.data).phases,[]);
    assert.equal((await db.query("select * from public.production_work_sessions where project_id=$1",[projectId])).rows.length,0);
    assert.equal((await pending())[0].paths.length,2,"last phase also removes unshared ancestors");
    await remove(null,3,"Delete test");
    assert.equal((await db.query("select * from public.projects where id=$1",[projectId])).rows.length,0);
    assert.equal((await db.query("select * from public.projects where id=$1",[otherId])).rows.length,1);
    assert.equal((await pending())[0].paths.length,2,"queue survives project deletion");
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('project-documents',$1)",[`${projectId}/project/late.pdf`]),/row-level security/);
    await db.exec("reset role");
    assert.equal((await db.query("select * from access_private.deletion_jobs")).rows.length,3);
    await db.query("update public.workspace_members set active=false where email=$1",[identities.brian.email]);
    await asUser(db,identities.brian);
    await assert.rejects(db.query("select public.pending_deletion_files()"),/Global Admin/);
    await assert.rejects(db.query("delete from access_private.deletion_jobs"),/permission denied/);
  } finally { await db.close(); }
});

test("deleting a whole project also removes time records instead of detaching them", async () => {
  const db = await accessDatabase();
  try {
    const p = newProject();
    await db.query("insert into public.production_work_sessions(worker_email,work_kind) values($1,'shift')",[identities.owner.email]);
    await db.query("insert into public.projects(id,name,data) values($1,'Whole project',$2)",[p.id,JSON.stringify(p.data)]);
    await db.query("insert into public.production_work_sessions(worker_email,project_id,phase_id,work_kind,coded_category,status,ended_at) values($1,$2,$3,'coded','Shop work','completed',now())",[identities.owner.email,p.id,p.data.activePhaseId]);
    await db.query("insert into public.project_documents(project_id,phase_id,file_name,storage_path) values($1,$2,'legacy.pdf','legacy/path.pdf')",[p.id,p.data.activePhaseId]);
    await db.query("insert into storage.objects(bucket_id,name) values('project-documents','legacy/path.pdf')");
    await asUser(db,identities.owner);
    await db.query("select public.delete_workspace_target($1,null,1,'Whole project')",[p.id]);
    assert.equal((await db.query("select * from public.production_work_sessions where work_kind <> 'shift'")).rows.length,0);
    assert.equal((await db.query("select * from public.project_documents")).rows.length,0);
    const jobs = (await db.query<{jobs:{paths:string[]}[]}>("select public.pending_deletion_files() jobs")).rows[0].jobs;
    assert.deepEqual(jobs[0].paths,["legacy/path.pdf"]);
  } finally { await db.close(); }
});
