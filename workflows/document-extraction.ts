import { sleep } from "workflow";
import { prepareIndex, planExtraction, preparePage, finishPreparation } from "@/lib/drawing-takeoff/job-prepare";
import { extractTask } from "@/lib/drawing-takeoff/job-extract";
import { publishProgress } from "@/lib/drawing-takeoff/job-publish";
import { loadJob, updateJob, PIPELINE_VERSION, MAX_AI_TASKS } from "@/lib/drawing-takeoff/job-store";

async function indexStep(jobId: string) { "use step"; return prepareIndex(jobId); }
async function discoverStep(jobId: string) { "use step"; return planExtraction(jobId); }
async function preparePageStep(jobId: string, inputPath: string, ordinal: number, mode: "schedules" | "plans", modeTotal: number) { "use step"; return preparePage(jobId, inputPath, ordinal, mode, modeTotal); }
preparePageStep.maxRetries = 1;
async function finishPreparationStep(jobId: string, warnings: string[], paidLimit: number, schedulesOnly: boolean, preparationFailures: number) { "use step"; return finishPreparation(jobId, warnings, paidLimit, schedulesOnly, preparationFailures); }
async function extractStep(taskId: string) { "use step"; return extractTask(taskId); }
extractStep.maxRetries = 1;
async function publishStep(jobId: string, final: boolean) { "use step"; return publishProgress(jobId, final); }
async function failStep(jobId: string, message: string) {
  "use step";
  const { job } = await loadJob(jobId);
  await updateJob(jobId, { status: "failed", error: message, progress: { ...job.progress, message: `Processing stopped: ${message}. Saved sections are retained.` } });
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
    const classify = pending ? pending.classify : await indexStep(jobId);
    for (let i = 0; i < classify.length; i += 2) {
      const results = await Promise.allSettled(classify.slice(i, i + 2).map(id => extractStep(id)));
      const blocked = results.flatMap(result => result.status === "fulfilled" && result.value.blockedReason ? [result.value.blockedReason] : [])[0];
      if (blocked) { await pauseStep(jobId, blocked); return; }
    }
    const pageInputs = await discoverStep(jobId);
    await publishStep(jobId, false);
    const warnings: string[] = [];
    let preparationFailures = 0;
    let paidRemaining = MAX_AI_TASKS - 30;
    // Complete and publish schedule extraction before optional plan geometry.
    for (const mode of ["schedules", "plans"] as const) {
      const inputs = pageInputs[mode];
      for (let i = 0; i < inputs.length; i++) {
        await sleep("1s");
        try {
          warnings.push(...await preparePageStep(jobId, inputs[i], i + 1, mode, inputs.length));
        } catch {
          preparationFailures++;
          const page = inputs[i].match(/prepare-(\d+)\.json$/)?.[1] || "unknown";
          warnings.push(`PDF page ${page} could not be prepared after retrying. Other pages continue; this page requires review or retry.`);
        }
      }
      const prepared = await finishPreparationStep(jobId, warnings, paidRemaining, mode === "schedules", preparationFailures);
      paidRemaining -= prepared.paidTasks;
      for (let i = 0; i < prepared.ids.length; i += 2) {
        const results = await Promise.allSettled(prepared.ids.slice(i, i + 2).map(id => extractStep(id)));
        await publishStep(jobId, false);
        const blocked = results.flatMap(result => result.status === "fulfilled" && result.value.blockedReason ? [result.value.blockedReason] : [])[0];
        if (blocked) { await pauseStep(jobId, blocked); return; }
      }
    }
    await publishStep(jobId, true);
  } catch (error) {
    await failStep(jobId, error instanceof Error ? error.message : "Document processing failed.");
  }
}
