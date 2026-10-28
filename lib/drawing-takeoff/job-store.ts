import { readInPages } from "./paged-rows";
import { createClient } from "@supabase/supabase-js";
import type { PageIndex } from "./indexing";
import type { PlanDetail } from "./plan-details";

export const ARTIFACT_BUCKET = "document-analysis";
export const PIPELINE_VERSION = "5";
export const PUBLICATION_VERSION = "2";
export const MAX_AI_TASKS = 100;
export type TaskInput = { pages: number[]; targetMark?: string; targetMarks?: string[]; artifact?: string; text?: string; building?: string; inventory?: unknown[]; crop?: { x: number; y: number; width: number; height: number }; pageWidth?: number; pageHeight?: number; planDetails?: PlanDetail[]; vectorArtifact?: string };
export type ExtractionTask = { id: string; job_id: string; task_key: string; kind: string; input: TaskInput; status: string; result: Record<string, unknown> | null; attempts: number; error?: Record<string, unknown>; metrics?: Record<string,unknown> };

export function workerClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Background document processing is not configured: missing server database credential.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadJob(jobId: string) {
  const db = workerClient();
  const { data: job, error } = await db.from("document_extraction_jobs").select("*").eq("id", jobId).single();
  if (error || !job) throw new Error("Analysis job no longer exists.");
  const { data: user, error: userError } = await db.auth.admin.getUserById(job.created_by);
  const { data: member } = await db.from("workspace_members").select("active").eq("email", user.user?.email?.toLowerCase() || "").eq("active", true).maybeSingle();
  if (userError || !member) throw new Error("The account that started this analysis no longer has workspace access.");
  const { data: document, error: docError } = await db.from("project_documents").select("*").eq("id", job.document_id).eq("project_id", job.project_id).single();
  if (docError || !document) throw new Error("The source document was removed.");
  return { db, job, document };
}

export async function updateJob(jobId: string, values: Record<string, unknown>) {
  const { error } = await workerClient().from("document_extraction_jobs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", jobId);
  if (error) throw error;
}

export async function putArtifact(path: string, data: Uint8Array | string, contentType: string) {
  const { error } = await workerClient().storage.from(ARTIFACT_BUCKET).upload(path, data, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

export async function getArtifact(path: string) {
  const { data, error } = await workerClient().storage.from(ARTIFACT_BUCKET).download(path);
  if (error || !data) throw new Error(`Analysis artifact could not be read: ${error?.message || "missing file"}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function readIndex(path: string): Promise<PageIndex[]> {
  return JSON.parse(new TextDecoder().decode(await getArtifact(path)));
}

export async function addTasks(jobId: string, tasks: Array<{ task_key: string; kind: string; input: TaskInput }>) {
  if (!tasks.length) return [] as string[];
  const { error } = await workerClient().from("document_extraction_tasks").upsert(tasks.map(task => ({ ...task, job_id: jobId })), { onConflict: "job_id,task_key", ignoreDuplicates: true });
  if (error) throw error;
  const { data, error: readError } = await workerClient().from("document_extraction_tasks").select("id,task_key").eq("job_id", jobId).in("task_key", tasks.map(task => task.task_key));
  if (readError) throw readError;
  const byKey = new Map((data || []).map(task => [task.task_key, task.id as string]));
  return tasks.map(task => byKey.get(task.task_key)!).filter(Boolean);
}

export async function listExtractionTasks(db: ReturnType<typeof workerClient>, jobId: string): Promise<ExtractionTask[]> {
  return readInPages(async (from, to) => {
    const { data, error } = await db.from("document_extraction_tasks").select("*")
      .eq("job_id", jobId).neq("kind", "classify").order("task_key").range(from, to);
    if (error) throw error;
    return (data || []) as ExtractionTask[];
  });
}
