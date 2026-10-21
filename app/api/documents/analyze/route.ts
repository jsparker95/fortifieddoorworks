import { generateText, Output } from "ai";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { matchSchedule, type ScheduleOpening } from "@/lib/drawing-takeoff/matching";
import { deduplicateDoors, normalizeMark, type DoorDetection } from "@/lib/drawing-takeoff/geometry";
import { selectDrawingPages, selectExtractionPageGroups, type IndexedDrawingPage } from "@/lib/drawing-takeoff/page-selection";
import { combineExtractionOutputs, planExtractionSchema, sanitizeExtraction, scheduleExtractionSchema } from "@/lib/drawing-takeoff/extraction-schema";
import { isNonSwingDoor, reconcileHardwareWithPrintedSchedule, reconcileOpeningsWithPrintedSchedule, resolveOpeningHanding } from "@/lib/drawing-takeoff/schedule-evidence";

export const runtime = "nodejs";
export const maxDuration = 120;

const scheduleSearchSchema = z.object({
  schedules: z.array(z.object({
    kind: z.enum(["hardware", "door", "frame"]),
    found: z.boolean(),
    pages: z.array(z.number().int().positive()).max(36),
    description: z.string().max(500),
    evidence: z.string().max(1000),
    confidence: z.number().min(0).max(1),
  })).max(3),
});

const MAX_VISUALLY_SCREENED_SCANNED_PAGES = 8;
const MAX_AUTOMATICALLY_SELECTED_PAGES = 10;
const DEFAULT_EXTRACTION_MODEL = "google/gemini-2.5-flash";

const terms: Array<[RegExp, number, string]> = [
  [/door\s+schedule|opening\s+schedule/i, 12, "Door / opening schedule"],
  [/hardware\s+schedule|hardware\s+group/i, 12, "Hardware schedule"],
  [/frame\s+(?:type\s+)?schedule|frame\s+type\s+schedule/i, 12, "Frame schedule"],
  [/wall\s+(type|schedule)|partition\s+type/i, 10, "Wall type / wall schedule"],
  [/division\s+08|08\s+\d{2}\s+\d{2}|hollow\s+metal\s+(doors|frames)|flush\s+wood\s+doors/i, 9, "Division 08 specifications"],
  [/\b(?:overall\s+)?(?:main|first|second|third|ground)\s+(?:level\s+)?floor\s+plan\b|architectural\s+floor\s+plan|door\s+mark|door\s+number/i, 5, "Floor plan / opening marks"],
  [/egress\s+plan|egress\s+door|exit\s+door\s+width|occupancy\s+schedule/i, 7, "Egress plan / door count"],
  [/interior\s+window\s+schedule|sidelight|borrowed\s+light/i, 6, "Window / sidelight schedule"],
  [/manufacturer|acceptable\s+manufacturer|products\s+may\s+be|not\s+limited\s+to/i, 3, "Specifications / manufacturers"],
];

export async function POST(request: Request) {
  let failureStage = "request validation";
  let verifiedDocumentId = "";
  let verifiedProjectId = "";
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in to analyze this document." }, { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });

  try {
    failureStage = "request validation";
    const body = await request.json() as { documentId?: string; projectId?: string; phaseId?: string; manualPages?: number[]; stage?: "locate" | "extract" };
    const stage = body.stage || "extract";
    if (stage !== "locate" && stage !== "extract") return Response.json({ error: "Choose a valid analysis step." }, { status: 400 });
    if (!body.documentId || !body.projectId || !body.phaseId) return Response.json({ error: "Document, project, and phase are required." }, { status: 400 });
    const { data: project, error: projectError } = await supabase.from("projects").select("data").eq("id", body.projectId).single();
    const phases = (project?.data as { phases?: Array<{ id: string }> } | undefined)?.phases || [];
    if (projectError || !phases.some((phase) => phase.id === body.phaseId)) return Response.json({ error: "Project phase not found or access denied." }, { status: 404 });
    const { data: document, error: readError } = await supabase.from("project_documents").select("*").eq("id", body.documentId).eq("project_id", body.projectId).single();
    if (readError || !document) return Response.json({ error: "Document not found or access denied." }, { status: 404 });
    verifiedDocumentId = document.id;
    verifiedProjectId = body.projectId;
    const priorAnalysis = document.analysis && typeof document.analysis === "object" ? document.analysis as Record<string, unknown> : {};
    const priorScheduleSearch = priorAnalysis.scheduleSearch as { completed?: boolean; pages?: number[] } | undefined;
    if (stage === "extract" && !priorScheduleSearch?.completed) {
      return Response.json({ error: "Complete the schedule page search before extracting phase data." }, { status: 409 });
    }
    failureStage = "downloading stored PDF";
    const { data: file, error: downloadError } = await supabase.storage.from("project-documents").download(document.storage_path);
    if (downloadError || !file) throw new Error(downloadError?.message || "PDF could not be downloaded.");
    if (file.size > 100 * 1024 * 1024) throw new Error("PDF exceeds the 100 MB upload limit.");

    const pdfBytes = new Uint8Array(await file.arrayBuffer());
    // Storage metadata can say application/pdf even when the stored bytes are an
    // HTML error page, an empty object, or another file type. Catch that before
    // pdf.js returns its low-level "No PDF header found" error.
    const pdfHeader = new TextDecoder().decode(pdfBytes.subarray(0, Math.min(pdfBytes.length, 1024)));
    if (!pdfHeader.includes("%PDF-")) {
      throw new Error("This stored file does not contain a PDF header. Re-upload the original PDF and try again.");
    }
    failureStage = "indexing PDF pages with PDF.js";
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // pdf.js may transfer the supplied typed array to its worker. Use a copy so
    // the original bytes remain available for pdf-lib below.
    const pdf = await pdfjs.getDocument({ data: pdfBytes.slice(), useSystemFonts: true, disableFontFace: true }).promise;
    if (pdf.numPages > 2500) throw new Error("This PDF has more than 2,500 pages. Split it into smaller files before analysis.");
    const allPages: IndexedDrawingPage[] = [];
    const scannedPageNumbers: number[] = [];
    let searchablePageCount = 0;
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").slice(0, 10000);
      if (text.trim().length > 20) searchablePageCount++;
      else scannedPageNumbers.push(pageNo);
      const labels = terms.filter(([pattern]) => pattern.test(text)).map(([, , label]) => label);
      const score = terms.reduce((sum, [pattern, weight]) => sum + (pattern.test(text) ? weight : 0), 0);
      const indexedPage = { page: pageNo, text, score, labels };
      allPages.push(indexedPage);
    }
    const manualPages = [...new Set((Array.isArray(body.manualPages) ? body.manualPages : []).map(Number))];
    if (manualPages.length > 36 || manualPages.some((page) => !Number.isInteger(page) || page < 1 || page > pdf.numPages)) {
      return Response.json({ error: `Choose up to 36 valid page numbers from this ${pdf.numPages}-page PDF.` }, { status: 400 });
    }
    const savedSchedulePages = stage === "extract" && Array.isArray(priorScheduleSearch?.pages) ? priorScheduleSearch.pages.map(Number).filter((page) => Number.isInteger(page) && page >= 1 && page <= pdf.numPages) : [];
    const requestedPages = manualPages;
    // Reserve slots for scanned/image-only sheets and inspect every page in
    // short plan PDFs, even if the title block does not match search terms.
    const { ranked: selectedPages } = selectDrawingPages(
      allPages, scannedPageNumbers, requestedPages, pdf.numPages,
      MAX_AUTOMATICALLY_SELECTED_PAGES, MAX_VISUALLY_SCREENED_SCANNED_PAGES,
    );
    const pageMapByNumber = new Map(selectedPages.map((page) => [page.page, page]));
    if (stage === "extract") {
      for (const pageNo of savedSchedulePages) {
        if (pageMapByNumber.size >= 36 || pageMapByNumber.has(pageNo)) continue;
        const page = allPages[pageNo - 1];
        if (page) pageMapByNumber.set(pageNo, { ...page, labels: [...new Set([...page.labels, "Schedule located in step 1"])] });
      }
    }
    const ranked = [...pageMapByNumber.values()].sort((a, b) => a.page - b.page);
    let visuallyReviewedScannedPages = new Set(ranked.map((page) => page.page).filter((page) => scannedPageNumbers.includes(page))).size;
    await supabase.from("project_documents").update({ page_count: pdf.numPages, phase_id: body.phaseId, status: "indexed" }).eq("id", document.id);
    if (!ranked.length) {
      if (stage === "locate") {
        const description = "Schedule search completed. No likely hardware, door, or frame schedule pages were found in the pages selected for review.";
        const scheduleSearch = { completed: true, schedules: [], pages: [], summary: description, indexedAt: new Date().toISOString() };
        const analysis = { ...priorAnalysis, scheduleSearch, indexedPageCount: pdf.numPages, candidatePageCount: 0, relevantPages: [] };
        const { error: saveError } = await supabase.from("project_documents").update({ status: "indexed", analysis, description }).eq("id", document.id).eq("project_id", body.projectId);
        if (saveError) throw new Error("Schedule search completed but the result could not be saved. Retry the search.");
        return Response.json({ stage, analysis, description });
      }
      const analysis = { ...priorAnalysis, scheduleSearch: priorScheduleSearch, relevantPages: [], walls: [], doorTypes: [], openings: [], doorwayObservations: [], hardwareGroups: [], specFindings: [], uncertainties: ["No searchable schedule text was found. Select key pages manually or upload an OCR PDF."], indexedPageCount: pdf.numPages, scannedPageCount: pdf.numPages - searchablePageCount, candidatePageCount: 0, pageCoverage: { totalScannedPages: scannedPageNumbers.length, visuallyReviewedScannedPages: 0, unreviewedScannedPages: scannedPageNumbers.length } };
      await supabase.from("project_documents").update({ status: "needs_review", analysis }).eq("id", document.id);
      return Response.json({ analysis });
    }

    failureStage = "loading source PDF and selecting pages with pdf-lib";
    const sourcePdf = await PDFDocument.load(pdfBytes.slice(), { ignoreEncryption: true });
    const subset = await PDFDocument.create();
    const copied = await subset.copyPages(sourcePdf, ranked.map((p) => p.page - 1));
    copied.forEach((p) => subset.addPage(p));
    const pageMap = ranked.map((p, index) => `PDF page ${index + 1} below corresponds to original PDF page ${p.page}. Likely section: ${p.labels.join(", ")}. Extracted text: ${p.text.slice(0, 5000)}`).join("\n\n");
    if (stage === "locate") {
      failureStage = "sending selected pages for schedule page search";
      const result = await generateText({
        model: process.env.DOCUMENT_EXTRACTION_MODEL || DEFAULT_EXTRACTION_MODEL,
        output: Output.object({ schema: scheduleSearchSchema }),
        system: "You inspect construction plan PDFs and locate only schedule sheets. Determine whether hardware schedules, door/opening schedules, and frame schedules are present in the supplied pages. Cite original PDF page numbers only, using the page map. For each schedule, include a short description and direct visual/text evidence. Do not guess pages from nearby sheet numbering. If not visible or uncertain, set found false and return no pages. The findings remain provisional for human review.",
        messages: [{ role: "user", content: [
          { type: "text", text: `Find the page numbers of hardware, door/opening, and frame schedules in this PDF. Search both extracted text and the page images. Include only original PDF pages that actually show the schedule; distinguish door schedules from frame schedules. Page map:\n${pageMap}` },
          { type: "file", mediaType: "application/pdf", data: await subset.save(), filename: document.file_name },
        ] }],
        abortSignal: AbortSignal.timeout(105_000),
      });
      const selectedPageNumbers = new Set(ranked.map((page) => page.page));
      const schedules = result.output.schedules.map((schedule) => ({ ...schedule, pages: [...new Set(schedule.pages.filter((page) => selectedPageNumbers.has(page)))], found: schedule.pages.some((page) => selectedPageNumbers.has(page)) }))
        .filter((schedule) => schedule.found);
      const pages = [...new Set(schedules.flatMap((schedule) => schedule.pages))].sort((a, b) => a - b);
      const labels = { hardware: "Hardware", door: "Door / opening", frame: "Frame" } as const;
      const description = (["hardware", "door", "frame"] as const).map((kind) => {
        const found = schedules.find((schedule) => schedule.kind === kind);
        return found
          ? `${labels[kind]} schedule found on PDF ${found.pages.length === 1 ? "page" : "pages"} ${found.pages.join(", ")}${found.description ? `: ${found.description}` : ""}.`
          : `${labels[kind]} schedule not identified in the pages reviewed.`;
      }).join(" ").slice(0, 1800);
      const scheduleSearch = { completed: true, schedules, pages, summary: description, indexedAt: new Date().toISOString() };
      const analysis = { ...priorAnalysis, scheduleSearch, indexedPageCount: pdf.numPages, candidatePageCount: ranked.length, relevantPages: ranked.filter((page) => schedules.some((schedule) => schedule.pages.includes(page.page))).map((page) => ({ page: page.page, section: page.labels.join(" · ") || "Schedule sheet", reason: "Schedule page identified during the first analysis step.", confidence: Math.max(...schedules.filter((schedule) => schedule.pages.includes(page.page)).map((schedule) => schedule.confidence)) })) };
      failureStage = "saving schedule page search";
      const { error: saveError } = await supabase.from("project_documents").update({ status: "indexed", phase_id: body.phaseId, page_count: pdf.numPages, analysis, description }).eq("id", document.id).eq("project_id", body.projectId);
      if (saveError) throw new Error("Schedule search completed but the result could not be saved. Retry the search.");
      return Response.json({ stage, analysis, description });
    }
    failureStage = "sending schedule and plan pages for AI extraction";
    const { schedulePages, planPages } = selectExtractionPageGroups(ranked, savedSchedulePages, requestedPages);
    const extractionPages = [...new Set([...schedulePages, ...planPages].map((page) => page.page))];
    visuallyReviewedScannedPages = extractionPages.filter((page) => scannedPageNumbers.includes(page)).length;
    const makeSubset = async (pages: IndexedDrawingPage[]) => {
      const pdf = await PDFDocument.create();
      const copied = await pdf.copyPages(sourcePdf, pages.map((page) => page.page - 1));
      copied.forEach((page) => pdf.addPage(page));
      return pdf.save();
    };
    const mapFor = (pages: IndexedDrawingPage[]) => pages.map((page, index) =>
      `Supplied PDF page ${index + 1} is original PDF page ${page.page}. Extracted text: ${page.text.slice(0, 5000)}`).join("\n\n");
    const [scheduleResult, planResult] = await Promise.all([
      schedulePages.length ? generateText({
        model: process.env.DOCUMENT_EXTRACTION_MODEL || DEFAULT_EXTRACTION_MODEL,
        output: Output.object({ schema: scheduleExtractionSchema }),
        system: "Extract every visible door/opening schedule row, door type, hardware set component, and specification finding from the supplied construction schedule pages. Preserve printed marks, sizes, materials, group numbers, and manufacturer names. A pair and an overhead door are distinct types; never invent handing when the schedule says to refer to the floor plan. Use the page number within the supplied shortened PDF for sourcePage and relevantPages.page; the server maps it to the original PDF. Return empty arrays for categories not present. Cite concise evidence. All data is provisional.",
        messages: [{ role: "user", content: [
          { type: "text", text: `Extract all schedule rows and every hardware component, including sets shared by several door marks. sourcePage must be 1 through ${schedulePages.length}, the position in the supplied PDF. Page map:\n${mapFor(schedulePages)}` },
          { type: "file", mediaType: "application/pdf", data: await makeSubset(schedulePages), filename: document.file_name },
        ] }],
        abortSignal: AbortSignal.timeout(105_000),
      }) : Promise.resolve(null),
      planPages.length ? generateText({
        model: process.env.DOCUMENT_EXTRACTION_MODEL || DEFAULT_EXTRACTION_MODEL,
        output: Output.object({ schema: planExtractionSchema }),
        system: "Inspect construction floor plans for wall types and individual doorway symbols. Return one doorway observation only for a clearly visible door symbol, with a tight normalized bounding box (x,y,width,height; top-left origin, values 0–1). Do not treat detail callouts, room numbers, grids, or schedule rows as door marks. If the mark or outside/key-side reference is unclear, leave the mark or handing empty. Use traditional handing viewed from outside/key side: hinges left/right and swing toward the observer means LHR/RHR. Never assume a reference side. Use the page number within the supplied shortened PDF for sourcePage and relevantPages.page; the server maps it to the original PDF. Evidence must describe what is visible. All data is provisional.",
        messages: [{ role: "user", content: [
          { type: "text", text: `Scan the supplied floor-plan pages and extract wall types and clearly supported doorway observations. sourcePage must be 1 through ${planPages.length}, the position in the supplied PDF. Page map:\n${mapFor(planPages)}` },
          { type: "file", mediaType: "application/pdf", data: await makeSubset(planPages), filename: document.file_name },
        ] }],
        abortSignal: AbortSignal.timeout(105_000),
      }) : Promise.resolve(null),
    ]);
    const scheduleOutput = scheduleResult ? sanitizeExtraction(combineExtractionOutputs(scheduleResult.output, null), schedulePages.map((page) => page.page)) : null;
    const planOutput = planResult ? sanitizeExtraction(combineExtractionOutputs(null, planResult.output), planPages.map((page) => page.page)) : null;
    const safeOutput = combineExtractionOutputs(scheduleOutput, planOutput);
    const verifiedSchedule = reconcileOpeningsWithPrintedSchedule(safeOutput.openings, schedulePages);
    safeOutput.openings = verifiedSchedule.openings;
    safeOutput.uncertainties.push(...verifiedSchedule.uncertainties);
    const verifiedHardware = reconcileHardwareWithPrintedSchedule(safeOutput.hardwareGroups, schedulePages);
    safeOutput.hardwareGroups = verifiedHardware.hardwareGroups;
    safeOutput.uncertainties.push(...verifiedHardware.uncertainties);
    const modelPages = new Map(safeOutput.relevantPages.map((page) => [page.page, page]));
    const relevantPages = ranked.filter((page) => extractionPages.includes(page.page)).flatMap((page) => {
      const found = modelPages.get(page.page);
      if (found) return [found];
      if (requestedPages.includes(page.page)) return [{ page: page.page, section: "Manually selected", reason: "Included at your request for visual review.", confidence: 1 }];
      if (page.score > 0) return [{ page: page.page, section: page.labels.join(" · "), reason: "Matched schedule, Division 08, or drawing terminology during page indexing.", confidence: Math.min(0.95, 0.45 + page.score / 40) }];
      return [];
    });
    const scheduleRows = safeOutput.openings as ScheduleOpening[];
    const visualDoors = safeOutput.doorwayObservations.map((door, index) => ({
      id: `vision:${door.sourcePage}:${index}`, page: door.sourcePage, box: door.boundingBox,
      confidence: door.confidence, mark: door.mark, evidence: door.symbolEvidence, tileId: `pdf-page:${door.sourcePage}`,
    } satisfies DoorDetection));
    const deduplicated = deduplicateDoors(visualDoors, 0.75);
    const matched = matchSchedule(deduplicated.doors, scheduleRows);
    const observationFor = (detection: DoorDetection) => safeOutput.doorwayObservations[Number(detection.id.split(":").at(-1))];
    const handingFor = (opening: typeof matched.openings[number]) => {
      return resolveOpeningHanding(opening.schedule, observationFor(opening.detection)?.handing, safeOutput.doorTypes);
    };
    const reviewReasonsFor = (opening: typeof matched.openings[number]) => {
      const reasons = opening.reviewReasons.filter((reason) => !(reason.startsWith("Handing requires") && handingFor(opening)));
      if (isNonSwingDoor(opening.schedule, safeOutput.doorTypes)) reasons.push("Conventional swing handing does not apply to the scheduled door type; plan hand observation was left for review.");
      else if (observationFor(opening.detection)?.handing && observationFor(opening.detection)?.handing !== "unclear") reasons.push("Handing read from the plan; verify the reference side before release.");
      return [...new Set(reasons)];
    };
    const matchedDoorways = matched.openings.map((opening) => {
      const observation = observationFor(opening.detection);
      return {
      sourcePage: opening.detection.page, mark: opening.detection.mark || "",
      boundingBox: opening.detection.box, confidence: opening.detection.confidence,
      evidence: opening.detection.evidence, schedulePage: opening.schedule?.sourcePage ?? null,
      scheduleEvidence: opening.schedule?.evidence ?? "", scheduleMatches: opening.scheduleMatches.length,
      width: opening.schedule?.width || "", height: opening.schedule?.height || "",
      hingeSide: observation?.hingeSide || "unknown",
      swingDirection: observation?.swingDirection || "unclear",
      handing: handingFor(opening), handingEvidence: observation?.handingEvidence || "",
      reviewReasons: reviewReasonsFor(opening),
    };
    });
    const planCountByMark = new Map<string, number>();
    for (const door of deduplicated.doors) {
      const mark = normalizeMark(door.mark || "");
      if (mark) planCountByMark.set(mark, (planCountByMark.get(mark) || 0) + 1);
    }
    const scheduledOpenings = safeOutput.openings.map((row) => {
      const planMatches = matched.openings.filter((opening) => opening.scheduleMatches.length === 1 && normalizeMark(opening.schedule?.mark || "") === normalizeMark(row.mark));
      const planMatch = planMatches[0];
      const planCount = planCountByMark.get(normalizeMark(row.mark)) || 0;
      const observation = planMatch ? observationFor(planMatch.detection) : null;
      return { ...row, handing: resolveOpeningHanding(row, observation?.handing, safeOutput.doorTypes),
        handingEvidence: observation?.handingEvidence || "", quantity: row.quantity || (planCount ? String(planCount) : ""), countSource: row.quantity ? "schedule" : planCount ? "plan symbols" : "unknown",
        ...(planMatch ? { planPage: planMatch.detection.page, planEvidence: planMatch.detection.evidence,
          planBoundingBox: planMatch.detection.box, planReviewReasons: [...new Set(planMatches.flatMap(reviewReasonsFor))] } : {}) };
    });
    const unmatchedByMark = new Map<string, typeof matched.openings>();
    for (const opening of matched.openings.filter((item) => !item.schedule)) {
      const mark = normalizeMark(opening.detection.mark || "");
      const key = mark || `unmarked:${opening.detection.page}`;
      unmatchedByMark.set(key, [...(unmatchedByMark.get(key) || []), opening]);
    }
    const unscheduledDoorCandidates = [...unmatchedByMark.values()].map((group) => {
      const opening = group[0];
      const observation = observationFor(opening.detection);
      return { mark: opening.detection.mark || "", room: "", width: "", height: "",
        doorType: "", frameType: "", wallType: "", hardwareGroup: "", fireRating: "", quantity: String(group.length),
        countSource: "plan symbols", autoImportEligible: false, sourcePage: opening.detection.page,
        evidence: group.map((item) => item.detection.evidence).filter(Boolean).join("; "),
        confidence: Math.min(...group.map((item) => item.detection.confidence)),
        planBoundingBox: opening.detection.box,
        handing: handingFor(opening), hingeSide: observation?.hingeSide || "unknown", swingDirection: observation?.swingDirection || "unclear",
        handingEvidence: observation?.handingEvidence || "", planReviewReasons: [...new Set(group.flatMap(reviewReasonsFor))] };
    });
    const uncertainties = [...safeOutput.uncertainties];
    if (!safeOutput.openings.length) uncertainties.push("No door/opening schedule rows were found in the selected pages. Plan symbols can still create count candidates, but schedule names, dimensions, types, and quantities need the missing schedule or manual review.");
    if (!safeOutput.hardwareGroups.length) uncertainties.push("No hardware schedule groups were found in the selected pages. Hardware components and quantities were not inferred.");
    if (!safeOutput.doorTypes.length) uncertainties.push("No door type schedule was found in the selected pages.");
    if (visuallyReviewedScannedPages < scannedPageNumbers.length) uncertainties.push(`${scannedPageNumbers.length - visuallyReviewedScannedPages} scanned/image-only page(s) were not visually screened. Add their page numbers and analyze again if they contain relevant schedules or plans.`);
    const analysis = { ...safeOutput, scheduleSearch: priorScheduleSearch, uncertainties: [...new Set(uncertainties)], openings: [...scheduledOpenings, ...unscheduledDoorCandidates], relevantPages, matchedDoorways, doorwayDetectionConflicts: deduplicated.conflicts.length, suppressedDuplicateDoorSymbols: deduplicated.suppressed.length,
      unmatchedSchedule: matched.unmatchedSchedule.map((row) => ({ mark: row.mark, sourcePage: row.sourcePage, evidence: row.evidence })),
      indexedPageCount: pdf.numPages, candidatePageCount: extractionPages.length, scannedPageCount: pdf.numPages - searchablePageCount, pageCoverage: { totalScannedPages: scannedPageNumbers.length, visuallyReviewedScannedPages, unreviewedScannedPages: Math.max(0, scannedPageNumbers.length - visuallyReviewedScannedPages) } };
    failureStage = "saving extracted results";
    const { error: saveError } = await supabase.from("project_documents").update({ status: "needs_review", phase_id: body.phaseId, page_count: pdf.numPages, analysis }).eq("id", document.id).eq("project_id", body.projectId);
    if (saveError) throw new Error("Analysis succeeded but results could not be saved. Retry analysis.");
    return Response.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document analysis failed.";
    const publicMessage = /free tier|upgrade to paid credits|credit balance|insufficient credits/i.test(message)
      ? "The selected AI model is unavailable on this Vercel AI Gateway credit tier. Select an eligible lower-cost model or add Gateway credits in Vercel, then retry."
      : message;
    console.error(`[documents/analyze] Failed during ${failureStage}: ${message}`);
    if (verifiedDocumentId && verifiedProjectId) {
      const { error: statusError } = await supabase.from("project_documents").update({ status: "failed" })
        .eq("id", verifiedDocumentId).eq("project_id", verifiedProjectId);
      if (statusError) console.error("[documents/analyze] Could not mark the document as failed:", statusError.message);
    }
    return Response.json({ error: `Failed during ${failureStage}: ${publicMessage}` }, { status: 500 });
  }
}
