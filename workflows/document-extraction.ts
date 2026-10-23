import { prepareIndex, prepareExtraction } from "@/lib/drawing-takeoff/job-prepare";
import { extractTask } from "@/lib/drawing-takeoff/job-extract";
import { publishProgress } from "@/lib/drawing-takeoff/job-publish";
import { loadJob, updateJob, MAX_AI_TASKS } from "@/lib/drawing-takeoff/job-store";

async function indexStep(jobId: string) { "use step"; return prepareIndex(jobId); }
async function discoverStep(jobId: string) { "use step"; return prepareExtraction(jobId); }
async function extractStep(taskId: string) { "use step"; await extractTask(taskId); }
extractStep.maxRetries = 1;
async function publishStep(jobId: string, final: boolean) { "use step"; return publishProgress(jobId, final); }
async function failStep(jobId: string, message: string) {
  "use step";
  await updateJob(jobId, { status: "failed", error: message, progress: { message: `Processing stopped: ${message}. Saved sections are retained.` } });
}
async function pendingStep(jobId: string) {
  "use step";
  const { db, job } = await loadJob(jobId);
  const { data: screening, error: screeningError } = await db.from("document_extraction_tasks").select("id").eq("job_id", jobId).eq("kind", "classify").neq("status", "complete").limit(30);
  if (screeningError) throw screeningError;
  if (screening?.length) return { classify: screening.map(task => task.id as string), tasks: null };
  if (!job.analysis?.scheduleSearch?.completed) return null;
  const { data, error } = await db.from("document_extraction_tasks").select("id").eq("job_id", jobId).neq("kind", "classify").neq("status", "complete").order("task_key").limit(MAX_AI_TASKS);
  if (error) throw error;
  await updateJob(jobId, { status: "extracting", error: null });
  return { classify: [] as string[], tasks: (data || []).map(task => task.id as string) };
}

export async function documentExtraction(jobId: string, resume = false) {
  "use workflow";
  try {
    const pending = resume ? await pendingStep(jobId) : null;
    let tasks = pending?.tasks ?? null;
    if (!tasks) {
      const classify = pending?.classify.length ? pending.classify : await indexStep(jobId);
      for (let i = 0; i < classify.length; i += 2) await Promise.allSettled(classify.slice(i, i + 2).map(id => extractStep(id)));
      tasks = await discoverStep(jobId);
      await publishStep(jobId, false);
    }
    for (let i = 0; i < tasks.length; i += 2) {
      await Promise.allSettled(tasks.slice(i, i + 2).map(id => extractStep(id)));
      await publishStep(jobId, false);
    }
    await publishStep(jobId, true);
  } catch (error) {
    await failStep(jobId, error instanceof Error ? error.message : "Document processing failed.");
  }
}
