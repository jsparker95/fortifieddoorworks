import { sleep } from "workflow";
import { prepareIndex, planExtraction, preparePage, finishPreparation } from "@/lib/drawing-takeoff/job-prepare";
import { extractTask } from "@/lib/drawing-takeoff/job-extract";
import { publishProgress } from "@/lib/drawing-takeoff/job-publish";
import { loadJob, updateJob, PIPELINE_VERSION } from "@/lib/drawing-takeoff/job-store";

async function indexStep(jobId: string) { "use step"; return prepareIndex(jobId); }
async function discoverStep(jobId: string) { "use step"; return planExtraction(jobId); }
async function preparePageStep(jobId: string, inputPath: string, ordinal: number) { "use step"; return preparePage(jobId, inputPath, ordinal); }
async function finishPreparationStep(jobId: string, warnings: string[]) { "use step"; return finishPreparation(jobId, warnings); }
async function extractStep(taskId: string) { "use step"; return extractTask(taskId); }
extractStep.maxRetries = 1;
async function publishStep(jobId: string, final: boolean) { "use step"; return publishProgress(jobId, final); }
async function failStep(jobId: string, message: string) {
  "use step";
  await updateJob(jobId, { status: "failed", error: message, progress: { message: `Processing stopped: ${message}. Saved sections are retained.` } });
}
async function pauseStep(jobId: string, message: string) {
  "use step";
  await updateJob(jobId, { status: "partial", error: message });
}
async function pendingStep(jobId: string) {
  "use step";
  const { db, job } = await loadJob(jobId);
  const { data: screening, error: screeningError } = await db.from("document_extraction_tasks").select("id").eq("job_id", jobId).eq("kind", "classify").neq("status", "complete").limit(30);
  if (screeningError) throw screeningError;
  if (!job.index_path || job.analysis?.pipelineVersion !== PIPELINE_VERSION) return null;
  await updateJob(jobId, { status: "locating", error: null });
  return { classify: (screening || []).map(task => task.id as string), tasks: null as string[] | null };
}

export async function documentExtraction(jobId: string, resume = false) {
  "use workflow";
  try {
    const pending = resume ? await pendingStep(jobId) : null;
    let tasks = pending?.tasks ?? null;
    if (!tasks) {
      const classify = pending ? pending.classify : await indexStep(jobId);
      for (let i = 0; i < classify.length; i += 2) {
        const results = await Promise.allSettled(classify.slice(i, i + 2).map(id => extractStep(id)));
        const blocked = results.flatMap(result => result.status === "fulfilled" && result.value.blockedReason ? [result.value.blockedReason] : [])[0];
        if (blocked) { await pauseStep(jobId, blocked); return; }
      }
      const pageInputs = await discoverStep(jobId);
      // Save literal schedule rows before any expensive plan geometry work.
      await publishStep(jobId, false);
      const warnings: string[] = [];
      // Force a continuation between pages so a large source cannot accumulate
      // PDF parsers and vector buffers inside one inline function invocation.
      for (let i = 0; i < pageInputs.length; i++) {
        await sleep("1s");
        warnings.push(...await preparePageStep(jobId, pageInputs[i], i + 1));
      }
      tasks = await finishPreparationStep(jobId, warnings);
      await publishStep(jobId, false);
    }
    for (let i = 0; i < tasks.length; i += 2) {
      const results = await Promise.allSettled(tasks.slice(i, i + 2).map(id => extractStep(id)));
      await publishStep(jobId, false);
      const blocked = results.flatMap(result => result.status === "fulfilled" && result.value.blockedReason ? [result.value.blockedReason] : [])[0];
      if (blocked) { await pauseStep(jobId, blocked); return; }
    }
    await publishStep(jobId, true);
  } catch (error) {
    await failStep(jobId, error instanceof Error ? error.message : "Document processing failed.");
  }
}
