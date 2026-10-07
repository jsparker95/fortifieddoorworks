import { generateText, Output } from "ai";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const extractionSchema = z.object({
  relevantPages: z.array(z.object({ page: z.number().int().positive(), section: z.string(), reason: z.string(), confidence: z.number().min(0).max(1) })).max(60),
  walls: z.array(z.object({ code: z.string(), description: z.string(), finishedThickness: z.string(), layers: z.array(z.string()), sourcePage: z.number().int().positive(), evidence: z.string(), confidence: z.number().min(0).max(1) })).max(150),
  doorTypes: z.array(z.object({ code: z.string(), description: z.string(), material: z.string(), manufacturer: z.string(), windowOrLouver: z.string(), fireRating: z.string(), width: z.string(), height: z.string(), sourcePage: z.number().int().positive(), evidence: z.string(), confidence: z.number().min(0).max(1) })).max(150),
  openings: z.array(z.object({ mark: z.string(), room: z.string(), width: z.string(), height: z.string(), handing: z.string(), doorType: z.string(), frameType: z.string(), wallType: z.string(), hardwareGroup: z.string(), fireRating: z.string(), quantity: z.string(), sourcePage: z.number().int().positive(), evidence: z.string(), confidence: z.number().min(0).max(1) })).max(2000),
  hardwareGroups: z.array(z.object({ group: z.string(), name: z.string(), brand: z.string(), component: z.string(), quantity: z.number().int().nonnegative(), frameModification: z.string(), doorModification: z.string(), doorPrep: z.string(), sourcePage: z.number().int().positive(), evidence: z.string(), confidence: z.number().min(0).max(1) })).max(500),
  specFindings: z.array(z.object({ subject: z.string(), requirement: z.string(), allowedManufacturers: z.array(z.string()), restrictedManufacturers: z.array(z.string()), exclusive: z.boolean(), sourcePage: z.number().int().positive(), evidence: z.string(), confidence: z.number().min(0).max(1) })).max(150),
  uncertainties: z.array(z.string()).max(100),
});

const terms: Array<[RegExp, number, string]> = [
  [/door\s+schedule|opening\s+schedule/i, 12, "Door / opening schedule"],
  [/hardware\s+schedule|hardware\s+group/i, 12, "Hardware schedule"],
  [/wall\s+(type|schedule)|partition\s+type/i, 10, "Wall type / wall schedule"],
  [/division\s+08|08\s+\d{2}\s+\d{2}|hollow\s+metal\s+(doors|frames)|flush\s+wood\s+doors/i, 9, "Division 08 specifications"],
  [/floor\s+plan|door\s+mark|door\s+number/i, 5, "Floor plan / opening marks"],
  [/interior\s+window\s+schedule|sidelight|borrowed\s+light/i, 6, "Window / sidelight schedule"],
  [/manufacturer|acceptable\s+manufacturer|products\s+may\s+be|not\s+limited\s+to/i, 3, "Specifications / manufacturers"],
];

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in to analyze this document." }, { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });

  try {
    const body = await request.json() as { documentId?: string; projectId?: string; phaseId?: string; manualPages?: number[] };
    if (!body.documentId || !body.projectId || !body.phaseId) return Response.json({ error: "Document, project, and phase are required." }, { status: 400 });
    const { data: project, error: projectError } = await supabase.from("projects").select("data").eq("id", body.projectId).single();
    const phases = (project?.data as { phases?: Array<{ id: string }> } | undefined)?.phases || [];
    if (projectError || !phases.some((phase) => phase.id === body.phaseId)) return Response.json({ error: "Project phase not found or access denied." }, { status: 404 });
    const { data: document, error: readError } = await supabase.from("project_documents").select("*").eq("id", body.documentId).eq("project_id", body.projectId).single();
    if (readError || !document) return Response.json({ error: "Document not found or access denied." }, { status: 404 });
    const { data: file, error: downloadError } = await supabase.storage.from("project-documents").download(document.storage_path);
    if (downloadError || !file) throw new Error(downloadError?.message || "PDF could not be downloaded.");
    if (file.size > 100 * 1024 * 1024) throw new Error("PDF exceeds the 100 MB upload limit.");

    const pdfBytes = new Uint8Array(await file.arrayBuffer());
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: pdfBytes, useSystemFonts: true, disableFontFace: true }).promise;
    if (pdf.numPages > 2500) throw new Error("This PDF has more than 2,500 pages. Split it into smaller files before analysis.");
    const pages: Array<{ page: number; text: string; score: number; labels: string[] }> = [];
    let searchablePageCount = 0;
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").slice(0, 10000);
      if (text.trim().length > 20) searchablePageCount++;
      const labels = terms.filter(([pattern]) => pattern.test(text)).map(([, , label]) => label);
      const score = terms.reduce((sum, [pattern, weight]) => sum + (pattern.test(text) ? weight : 0), 0);
      if (score > 0) pages.push({ page: pageNo, text, score, labels });
    }
    const requestedPages = [...new Set((Array.isArray(body.manualPages) ? body.manualPages : []).map(Number))];
    if (requestedPages.length > 36 || requestedPages.some((page) => !Number.isInteger(page) || page < 1 || page > pdf.numPages)) {
      return Response.json({ error: `Choose up to 36 valid page numbers from this ${pdf.numPages}-page PDF.` }, { status: 400 });
    }
    const manual = requestedPages.map((page) => ({ page, text: pages.find((candidate) => candidate.page === page)?.text || "", score: Number.MAX_SAFE_INTEGER, labels: ["Manually selected page"] }));
    const automatic = pages.sort((a, b) => b.score - a.score).filter((page) => !requestedPages.includes(page.page)).slice(0, Math.max(0, 36 - manual.length));
    const ranked = [...manual, ...automatic].sort((a, b) => a.page - b.page);
    await supabase.from("project_documents").update({ page_count: pdf.numPages, status: "indexed" }).eq("id", document.id);
    if (!ranked.length) {
      const analysis = { relevantPages: [], walls: [], doorTypes: [], openings: [], hardwareGroups: [], specFindings: [], uncertainties: ["No searchable schedule text was found. This PDF may be scanned; select key pages manually or upload a text-searchable/OCR PDF."], indexedPageCount: pdf.numPages, scannedPageCount: pdf.numPages - searchablePageCount };
      await supabase.from("project_documents").update({ status: "needs_review", analysis }).eq("id", document.id);
      return Response.json({ analysis });
    }

    const sourcePdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const subset = await PDFDocument.create();
    const copied = await subset.copyPages(sourcePdf, ranked.map((p) => p.page - 1));
    copied.forEach((p) => subset.addPage(p));
    const pageMap = ranked.map((p, index) => `PDF page ${index + 1} below corresponds to original PDF page ${p.page}. Likely section: ${p.labels.join(", ")}. Extracted text: ${p.text.slice(0, 5000)}`).join("\n\n");
    const result = await generateText({
      model: process.env.DOCUMENT_EXTRACTION_MODEL || "google/gemini-3.1-pro-preview",
      output: Output.object({ schema: extractionSchema }),
      system: "You assist Fortified Doorworks with preliminary construction-plan takeoffs. Only extract evidence actually visible in the supplied PDF pages or text. Never infer a dimension, handing, brand, wall construction, fire rating, or hardware quantity if it is not explicit. Keep unknown values as empty strings. Cite original PDF page numbers, not subset page numbers. Evidence must be a short literal excerpt or a concise description of the drawing/table. Distinguish HM hollow metal, wood, aluminum/storefront, and out-of-scope types. This is a candidate extraction for human review; preserve uncertainty.",
      messages: [{ role: "user", content: [
        { type: "text", text: `Find the pages relevant to Fortified Doorworks and extract candidate schedules, wall construction/thickness, opening marks and dimensions/handing, door types, hardware group components/quantities, and Division 08 specification restrictions. Do not approve or invent missing values.\n\nPage map and extracted text:\n${pageMap}` },
        { type: "file", mediaType: "application/pdf", data: await subset.save(), filename: document.file_name },
      ] }],
      abortSignal: AbortSignal.timeout(105_000),
    });
    const modelPages = new Map((result.output.relevantPages || []).map((page) => [page.page, page]));
    const relevantPages = ranked.map((page) => modelPages.get(page.page) || ({ page: page.page, section: page.labels.join(" · ") || "Plan reference", reason: "Matched schedule, Division 08, or drawing terminology during page indexing.", confidence: Math.min(0.95, 0.45 + page.score / 40) }));
    const analysis = { ...result.output, relevantPages, indexedPageCount: pdf.numPages, candidatePageCount: ranked.length, scannedPageCount: pdf.numPages - searchablePageCount };
    const { error: saveError } = await supabase.from("project_documents").update({ status: "needs_review", page_count: pdf.numPages, analysis }).eq("id", document.id);
    if (saveError) throw new Error("Analysis succeeded but results could not be saved. Retry analysis.");
    return Response.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document analysis failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
