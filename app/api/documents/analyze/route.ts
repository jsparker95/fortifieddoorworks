import { createClient } from "@supabase/supabase-js";
import { start, getRun } from "workflow/api";
import { documentExtraction } from "@/workflows/document-extraction";
import { workerClient, updateJob, PUBLICATION_VERSION } from "@/lib/drawing-takeoff/job-store";
import { phaseHasTakeoffData } from "@/lib/drawing-takeoff/phase-import";
import { hasExplicitExtractionRequest } from "@/lib/drawing-takeoff/start-request";
import type { ProjectPhase } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

async function authorize(request: Request, documentId: string, projectId: string, phaseId: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in to analyze this document.");
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) throw new Error("Your session expired. Sign in again.");
  const [{ data: project }, { data: document }] = await Promise.all([
    client.from("projects").select("data").eq("id", projectId).single(),
    client.from("project_documents").select("id").eq("id", documentId).eq("project_id", projectId).single(),
  ]);
  const phase = (project?.data?.phases as ProjectPhase[] | undefined)?.find(p => p.id === phaseId);
  if (!phase || !document) throw new Error("Document or phase not found, or access denied.");
  return { client, user: auth.user, phase };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!hasExplicitExtractionRequest(body)) return Response.json({ error: "Refresh this page, then choose Begin extraction to start processing." }, { status: 400 });
    if (![body.documentId, body.projectId, body.phaseId].every(id => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))) return Response.json({ error: "Document, project and phase are required." }, { status: 400 });
    const { user, phase } = await authorize(request, body.documentId, body.projectId, body.phaseId);
    const pages = [...new Set<number>(Array.isArray(body.manualPages) ? body.manualPages : [])].sort((a, b) => a - b);
    if (pages.length > 36 || pages.some(page => !Number.isInteger(page) || page < 1 || page > 2500)) return Response.json({ error: "Choose up to 36 valid PDF pages." }, { status: 400 });
    const db = workerClient();
    const { data: prior, error: readError } = await db.from("document_extraction_jobs").select("*").eq("document_id", body.documentId).eq("phase_id", body.phaseId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (readError) throw readError;
    if (prior && ["queued", "indexing", "locating", "extracting"].includes(prior.status)) return Response.json({ job: prior }, { status: 202 });
    const resume = !!prior && (["partial", "failed"].includes(prior.status)
      || (prior.status === "complete" && prior.analysis?.publicationVersion !== PUBLICATION_VERSION))
      && JSON.stringify(prior.manual_pages) === JSON.stringify(pages);
    let job = prior;
    if (!resume) {
      const rows = ["openings", "walls", "doorTypes", "hardware"].flatMap(kind => phase.data[kind as keyof typeof phase.data] as Array<Record<string, unknown>> || []);
      const onlyThisDocumentDrafts = rows.length > 0 && rows.every(row => row.sourceDocumentId === body.documentId && row.reviewState === "ai-draft");
      const result = await db.from("document_extraction_jobs").insert({ document_id: body.documentId, project_id: body.projectId, phase_id: body.phaseId,
        created_by: user.id, actor_email: user.email, manual_pages: pages,
        import_enabled: !phaseHasTakeoffData(phase.data) || onlyThisDocumentDrafts }).select().single();
      if (result.error) {
        if (result.error.code === "23505") {
          const { data: running } = await db.from("document_extraction_jobs").select("*").eq("document_id", body.documentId).eq("phase_id", body.phaseId).in("status", ["queued", "indexing", "locating", "extracting"]).maybeSingle();
          if (running) return Response.json({ job: running }, { status: 202 });
          return Response.json({ error: "Analysis already started. Refresh progress." }, { status: 409 });
        }
        throw result.error;
      }
      job = result.data;
    }
    if (resume) {
      const { data: claimed, error: claimError } = await db.from("document_extraction_jobs").update({ status: "queued", error: null, updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", prior.status).select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return Response.json({ error: "This job has already resumed. Refresh progress." }, { status: 409 });
    }
    try {
      const run = await start(documentExtraction, [job.id, resume]);
      await updateJob(job.id, { workflow_run_id: run.runId });
    } catch (error) {
      await updateJob(job.id, { status: "failed", error: "The background job could not start. Retry analysis." });
      throw error;
    }
    return Response.json({ job: { ...job, status: "queued" } }, { status: 202 });
  } catch (error) {
    console.error("[document-start]", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: error instanceof Error ? error.message : "Could not start document analysis." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const documentId = params.get("documentId") || "", projectId = params.get("projectId") || "", phaseId = params.get("phaseId") || "";
    const { client } = await authorize(request, documentId, projectId, phaseId);
    const { data: job, error } = await client.from("document_extraction_jobs").select("*").eq("document_id", documentId).eq("phase_id", phaseId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return Response.json({ job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not read analysis progress." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { client } = await authorize(request, body.documentId, body.projectId, body.phaseId);
    const { data: job, error } = await client.from("document_extraction_jobs").select("id,status,workflow_run_id")
      .eq("document_id", body.documentId).eq("phase_id", body.phaseId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!job || !["queued", "indexing", "locating", "extracting"].includes(job.status)) return Response.json({ stopped: true });
    if (!job.workflow_run_id) return Response.json({ error: "The job is starting. Try stopping it again in a moment." }, { status: 409 });
    await getRun(job.workflow_run_id).cancel();
    await updateJob(job.id, { status: "partial", error: "Processing stopped. Saved results are retained; resume whenever you are ready." });
    return Response.json({ stopped: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not stop extraction." }, { status: 400 }); }
}
