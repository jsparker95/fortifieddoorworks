import {entryContextsForPage} from './room-reference';
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { projectFileSizeError } from "../project-file-upload";
import { chunkRows, findPageContent, hardwareSections, groupedOpeningCrops, canonicalBuilding, confirmedPageKinds, groundedScheduleKinds, type PageFinding, type PageIndex } from "./indexing";
import { pageFromSegment } from "./segment-page";
import { partitionPreparationInputs, type PreparationMode } from "./preparation-policy";
import { planTiles } from "./geometry";
import { planDetails } from "./plan-details";
import { analyzeVectorPlan, VECTOR_VERSION, type VectorPlan } from "./vector-pdf";
import { taskIdsWithinBudget } from "./task-budget";
import { scheduleSearchDescription } from "./search-description";
import { addTasks, listExtractionTasks, getArtifact, loadJob, updateJob, putArtifact, readIndex, PIPELINE_VERSION, type TaskInput } from "./job-store";
import { combineExtractionOutputs } from "./extraction-schema";
import { useSingleNativePlanTask, taskMatchesFindings, currentPlanMarks } from "./plan-task-policy";
import { hardwareImageSections } from "./hardware-sections";
import { canUseHardwareText } from "./hardware-evidence";
import { readHardwareMatrix, type MatrixResult } from "./hardware-matrix";
import { visualScheduleSections } from "./visual-schedule";
import { indexPdf, subsetPdf } from "./pdf-server";
import { screeningCoverage } from "./screening-coverage";
import { hardwareContinuationTasks } from "./hardware-continuation";
import {resolveAnnotationCandidates,catalogOpeningKey} from './annotation-candidates';
import {readHardwareTable} from './hardware-table';

export async function prepareIndex(jobId: string) {
  const { db, job, document } = await loadJob(jobId);
  await updateJob(jobId, { status: "indexing", progress: { message: "Reading every PDF page and preserving schedule text…" } });
  const { data: file, error } = await db.storage.from("project-documents").download(document.storage_path);
  if (error || !file) throw new Error("Could not download the uploaded PDF.");
  const sizeError = projectFileSizeError(file.size);
  if (sizeError) throw new Error(sizeError);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const root = `${document.project_id}/${document.id}/${hash}/v${PIPELINE_VERSION}`;
  const indexPath = `${root}/index.json`;
  let pages;
  try { pages = await readIndex(indexPath); }
  catch { pages = await indexPdf(bytes); await putArtifact(indexPath, JSON.stringify(pages), "application/json"); }
  if (job.manual_pages.some((n: number) => n < 1 || n > pages.length)) throw new Error(`Manual pages must be between 1 and ${pages.length}.`);
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const findings = pages.map(findPageContent);
  const { data: priorScreens, error: priorError } = await db.from("document_extraction_tasks").select("input,result").eq("job_id", jobId).eq("kind", "classify").eq("status", "complete");
  if (priorError) throw priorError;
  const alreadyScreened = new Set<number>((priorScreens || []).flatMap(task => (task.result?.pages || []).map((row: {page:number}) => task.input.pages[row.page - 1])));
  // Diagram-only type sheets may have searchable text but no schedule keywords.
  // Screen each non-index page once, retaining prior successful classifications.
  const uncertain = pages.filter(page => !alreadyScreened.has(page.page) && findings[page.page - 1].evidence !== "Sheet index; references are not schedule tables.");
  const batches = chunkRows(uncertain, 6);
  const tasks = [];
  for (let i = 0; i < batches.length; i++) {
    const nums = batches[i].map(page => page.page);
    const artifact = await putArtifact(`${root}/screen-${nums.join("-")}.pdf`, await subsetPdf(source, nums), "application/pdf");
    tasks.push({ task_key: `classify:${nums.join(",")}`, kind: "classify", input: { pages: nums, artifact } });
  }
  const taskIds = await addTasks(jobId, tasks);
  await updateJob(jobId, { status: "locating", index_path: indexPath,
    progress: { message: `Indexed ${pages.length} pages. Checking ${uncertain.length} pages that need visual classification.`, totalPages: pages.length, uncheckedPages: uncertain.length, sourceRoot: root } });
  const { error: saveError } = await db.from("project_documents").update({ page_count: pages.length, status: "indexed" }).eq("id", document.id);
  if (saveError) throw saveError;
  return taskIds.slice(0, 30);
}

export async function planExtraction(jobId: string) {
  const { db, job, document } = await loadJob(jobId);
  const pages = await readIndex(job.index_path);
  const findings = pages.map(findPageContent);
  const { data: classified, error } = await db.from("document_extraction_tasks").select("input,result,status").eq("job_id", jobId).eq("kind", "classify");
  if (error) throw error;
  const uncheckedPages = screeningCoverage(classified || []).unchecked.length;
  for (const task of classified || []) {
    for (const row of task.result?.pages || []) {
      const actualPage = task.input.pages[row.page - 1];
      const finding = findings[actualPage - 1];
      if (!finding) continue;
      finding.kinds = [...new Set([...finding.kinds, ...row.kinds])] as PageFinding["kinds"];
      finding.building ||= row.building || "";
      finding.method = "vision";
      finding.evidence = row.evidence;
    }
  }
  // Heuristic drawing titles are only candidates. Require visual confirmation
  // before spending calls on tiles, including pages with incidental plan references.
  const screenPages = new Set((classified || []).flatMap(task => task.input.pages as number[]));
  const confirmed = new Map<number, PageFinding["kinds"]>();
  for (const task of classified || []) if (task.status === "complete") for (const row of task.result?.pages || []) confirmed.set(task.input.pages[row.page - 1], confirmedPageKinds(row.kinds, row.evidence));
  for (const finding of findings) if (screenPages.has(finding.page)) finding.kinds = [...new Set([...groundedScheduleKinds(pages[finding.page - 1], finding.openingRows), ...(confirmed.get(finding.page) || [])])];
  const scheduleBuildings = findings.filter(finding => finding.openingRows.length).map(finding => finding.building);
  for (const finding of findings) finding.building = canonicalBuilding(finding.building, scheduleBuildings);
  const selected = findings.filter(finding => finding.kinds.length);
  const schedules = (["hardware", "door", "frame"] as const).map(kind => ({ kind,
    pages: selected.filter(f => f.kinds.includes(kind === "frame" ? "types" : kind)).map(f => f.page),
    description: kind === "door" ? `${selected.reduce((sum, f) => sum + f.openingRows.length, 0)} printed opening rows inventoried before AI enrichment.` : "Confirmed content on the listed sheets.",
    evidence: "Page text/table structure or direct visual inspection; index references excluded.", confidence: 0.9,
  })).filter(row => row.pages.length);
  const description = scheduleSearchDescription(schedules);
  const root = job.index_path.replace(/\/index.json$/, "");
  const literalOpenings=selected.flatMap(f=>f.openingRows.map(row=>({...row,sourceBuilding:f.building})));
  const annotated=resolveAnnotationCandidates(pages,literalOpenings);
  const catalogKeys=new Set(annotated.openingCatalog.map(row=>catalogOpeningKey(row.sourcePage,row.mark)));
  const physicalOpenings=literalOpenings.filter(row=>!catalogKeys.has(catalogOpeningKey(row.sourcePage,row.mark)));
  const knownMarks=currentPlanMarks(physicalOpenings.map(row=>row.mark),{openings:physicalOpenings,openingCatalog:annotated.openingCatalog,annotationOpeningCandidates:annotated.candidates});
  const marksHash = createHash("sha256").update([...knownMarks].sort().join("\n")).digest("hex").slice(0,12);
  const inputs: string[] = [];
  for (const finding of selected) {
    const screen = classified?.find(task => task.input.pages.includes(finding.page));
    if (!screen?.input.artifact) throw new Error(`Missing saved page segment for PDF page ${finding.page}. Re-index this document before retrying.`);
    const inputPath = `${root}/prepare-${finding.page}.json`;
    await putArtifact(inputPath, JSON.stringify({ finding, page: pages[finding.page - 1], knownMarks, marksHash,
      sourceArtifact: screen.input.artifact, sourcePages: screen.input.pages, root, total: selected.length }), "application/json");
    inputs.push(inputPath);
  }
  const analysis = { pipelineVersion: PIPELINE_VERSION, scheduleSearch: { completed: true, schedules, pages: [...new Set(schedules.flatMap(s => s.pages))], summary: description },
    openings:physicalOpenings,openingCatalog:annotated.openingCatalog,annotationOpeningCandidates:annotated.candidates,catalogDoorTypeCandidates:annotated.catalogDefinitions,
    indexWarnings:pages.flatMap(page=>page.warnings||[]),walls: [], doorTypes: [], hardwareGroups: [], doorwayObservations: [],
    relevantPages: selected.map(f => ({ page: f.page, section: f.kinds.join(", "), reason: f.evidence, confidence: 0.9 })),
    indexedPageCount: pages.length, candidatePageCount: selected.length, scannedPageCount: pages.filter(page => !page.text.trim()).length, uncertainties: [] as string[],
  };
  await updateJob(jobId, { status: "extracting", description, analysis,
    progress: { ...job.progress, uncheckedPages, preparingPages: selected.length, preparedPages: 0,
      message: `Schedule search complete. Preparing ${selected.length} relevant pages for extraction…` } });
  const { error: saveError } = await db.from("project_documents").update({ description, analysis, status: "indexed", phase_id: job.phase_id }).eq("id", document.id);
  if (saveError) throw saveError;
  console.info("[document-prepare] planned", { jobId, pages: selected.length, uncheckedPages });
  return partitionPreparationInputs(inputs.map((path, i) => ({ path, kinds: selected[i].kinds })));
}

type PreparationInput = { finding: PageFinding; page: PageIndex; knownMarks: string[]; marksHash: string;
  sourceArtifact: string; sourcePages: number[]; root: string; total: number };

/** Read one saved six-page segment, never the original large PDF. Each page is a durable step. */
export async function preparePage(jobId: string, inputPath: string, ordinal: number, mode: PreparationMode, modeTotal: number) {
  const { db, job } = await loadJob(jobId);
  if (job.status === "partial") throw new Error("Processing stopped. Saved results are retained.");
  const { finding, page, knownMarks:storedMarks, marksHash:storedMarksHash, sourceArtifact, sourcePages, root } = JSON.parse(new TextDecoder().decode(await getArtifact(inputPath))) as PreparationInput;
  const knownMarks=mode==="plans"?currentPlanMarks(storedMarks,job.analysis):storedMarks;
  const entryRoomContexts=mode==="plans"?entryContextsForPage(job.analysis,page.page):[];
  const marksHash=mode==="plans"?createHash("sha256").update(JSON.stringify({knownMarks,entryRoomContexts})).digest("hex").slice(0,12):storedMarksHash;
  console.info("[document-prepare] page started", { jobId, page: page.page, ordinal, mode });
  finding.kinds = finding.kinds.filter(kind => mode === "plans" ? kind === "plan" : kind !== "plan");
  const pageBytes = await pageFromSegment(await getArtifact(sourceArtifact), sourcePages, page.page);
  const artifact = await putArtifact(`${root}/page-${page.page}.pdf`, pageBytes, "application/pdf");
  const common = { pages: [page.page], artifact, building: finding.building };
  const tasks: Array<{ task_key: string; kind: string; input: TaskInput }> = [];
  const vectorWarnings: string[] = [];
  let matrix: MatrixResult | null = null;
  const hardwareTable=finding.kinds.includes('hardware')?readHardwareTable(page):null;
  if(hardwareTable?.hardwareGroups.length&&hardwareTable.complete){
    const hardwareTableArtifact=await putArtifact(`${root}/hardware-table-${page.page}.json`,JSON.stringify(hardwareTable),'application/json');
    tasks.push({task_key:`hardware-table:${page.page}:v1`,kind:'hardware',input:{...common,hardwareTableArtifact}});
  }
  if (finding.kinds.includes("door")) {
    matrix = await readHardwareMatrix(pageBytes, page, finding.openingRows);
    if (matrix?.hardwareGroups.length) {
      const matrixArtifact = await putArtifact(`${root}/matrix-${page.page}.json`, JSON.stringify(matrix), "application/json");
      tasks.push({task_key:`hardware-matrix:${page.page}`,kind:"hardware",input:{...common,matrixArtifact}});
    }
    const chunks = chunkRows(finding.openingRows);
    if (!chunks.length) {
      const sections = visualScheduleSections(page);
      if (sections.length) sections.forEach((section, i) => tasks.push({ task_key: `doors:${page.page}:strip:${i}`, kind: "doors", input: { ...common, scheduleSection: section } }));
      else tasks.push({ task_key: `doors:${page.page}:visual`, kind: "doors", input: { ...common, text: page.text } });
    }
    for (let i = 0; i < chunks.length; i++) tasks.push({ task_key: `doors:${page.page}:${i}`, kind: "doors",
      input: { ...common, inventory: chunks[i], text: `Schedule context: ${page.text.slice(Math.max(0, page.text.search(/\bDOOR\s+SCHEDULE\b/i)), Math.max(0, page.text.search(/\bDOOR\s+SCHEDULE\b/i)) + 600)}\nRows:\n${chunks[i].map(row => row.evidence).join("\n")}` } });
  }
  if (finding.kinds.includes("hardware") && !(hardwareTable?.complete&&hardwareTable.hardwareGroups.length) && (!matrix?.hardwareGroups.length || hardwareSections(page.text).length)) {
    const images=canUseHardwareText(page.text,page.page)?[]:hardwareImageSections(page);
    if(images.length)images.forEach((section,i)=>tasks.push({task_key:`hardware:${page.page}:image:${i}`,kind:"hardware",input:{...common,hardwareSection:section}}));
    else {
      const sets = hardwareSections(page.text);
      const chunks = sets.length ? chunkRows(sets, 2).map(parts => parts.join("\n\n")) : [page.text];
      chunks.forEach((text, i) => tasks.push({ task_key: `hardware:${page.page}:${i}`, kind: "hardware", input: { ...common, text } }));
    }
  }
  for (const kind of ["types", "walls"] as const) if (finding.kinds.includes(kind)) tasks.push({ task_key: `${kind}:${page.page}`, kind, input: { ...common, text: page.text } });
  if (finding.kinds.includes("plan")) {
    const vectorPath = `${root}/vector-v${VECTOR_VERSION}-page-${page.page}-${marksHash}.json`;
    let vector: VectorPlan;
    try {
      vector = JSON.parse(new TextDecoder().decode(await getArtifact(vectorPath)));
      if(vector.version!==VECTOR_VERSION||!Array.isArray(vector.observations))throw new Error("Stale vector artifact");
    } catch {
      try {
        vector = await analyzeVectorPlan(pageBytes,page,knownMarks,(job.analysis?.catalogDoorTypeCandidates||[]).map((row:{code:string})=>row.code),{entryRoomContexts,unverifiedCircleLabels:(job.analysis?.catalogDoorTypeCandidates||[]).some((row:{sourceCatalogFormat?:string})=>row.sourceCatalogFormat==='style-table')});
      } catch {
        // One unsupported drawing must not prevent the schedules from saving.
        vector = { version: VECTOR_VERSION, supported: false, geometryCount: 0, observations: [],
          reason: "Native drawing geometry could not be read; visual detections require manual handing verification." };
      }
      await putArtifact(vectorPath,JSON.stringify(vector),"application/json");
    }
    if(vector.reason)vectorWarnings.push(`PDF page ${page.page}: ${vector.reason}`);
    if(useSingleNativePlanTask(vector,knownMarks)){
      const task_key=`plan:page:${page.page}:native:v${VECTOR_VERSION}:${marksHash}`;
      tasks.push({task_key,kind:"plan",input:{...common,vectorArtifact:vectorPath,targetMarks:knownMarks}});
      // Retain old task inputs for audit while retiring redundant unfinished
      // native crop work from earlier versions of the same resumed job.
      const {error:retireError}=await db.from("document_extraction_tasks").update({status:"complete",result:{...combineExtractionOutputs(null,null),supersededBy:task_key},updated_at:new Date().toISOString()})
        .eq("job_id",jobId).eq("kind","plan").neq("status","complete").neq("task_key",task_key).contains("input",{pages:[page.page]});
      if(retireError)throw retireError;
    }else{
    const tags = groupedOpeningCrops(page, knownMarks);
    const tiles = tags.length ? tags : planTiles(page.page, page.width * 2, page.height * 2, { tileSize: 1024, overlap: 256 });
    for (const tile of tiles) tasks.push({ task_key: `plan:${tile.id}`, kind: "plan", input: { ...common,
      targetMarks: "marks" in tile ? tile.marks : undefined,
      text: `Sheet context: ${page.text}\nKnown opening marks: ${knownMarks.join(", ")}`,
      planDetails: "marks" in tile ? planDetails(page, tile, tile.marks) : [],
      // A known schedule already provides counts. Unsupported geometry is a
      // manual-review result, not a reason to buy vision calls whose hands
      // cannot be independently validated. Drawing-only files retain vision.
      vectorArtifact: vector.supported || knownMarks.length ? vectorPath : undefined,
      crop: { x: tile.x, y: tile.y, width: tile.width, height: tile.height }, pageWidth: tile.pageWidth, pageHeight: tile.pageHeight } });
    }
  }
  await addTasks(jobId, tasks);
  // Refresh literal columns after a parser improvement without repurchasing
  // already completed enrichment for the same source rows.
  for (const task of tasks.filter(task => (task.kind === "doors" && task.input.inventory?.length) || task.kind === "plan")) {
    const { error: inventoryError } = await db.from("document_extraction_tasks").update({ input: task.input }).eq("job_id", jobId).eq("task_key", task.task_key);
    if (inventoryError) throw inventoryError;
  }
  // Older responses used an ambiguous coordinate unit and could be entirely
  // discarded. Retry those sections only when the user explicitly resumes.
  const { data: legacyPlans, error: legacyError } = await db.from("document_extraction_tasks").select("id,task_key,result")
    .eq("job_id", jobId).eq("kind", "plan").eq("status", "complete");
  if (legacyError) throw legacyError;
  const vectorKeys = new Set(tasks.filter(task=>task.input.vectorArtifact).map(task=>task.task_key));
  const invalidPlanIds = (legacyPlans || []).filter(task =>
    (vectorKeys.has(task.task_key)&&task.result?.vectorVersion!==VECTOR_VERSION)
    || (!task.result?.rawPlanResponse && task.result?.doorwayObservations?.length===0
      && task.result?.uncertainties?.some((note:string)=>/invalid citations, geometry/i.test(note)))).map(task => task.id);
  if (invalidPlanIds.length) {
    const { error: retryError } = await db.from("document_extraction_tasks").update({ status: "pending" }).in("id", invalidPlanIds);
    if (retryError) throw retryError;
  }
  await updateJob(jobId, { progress: { ...job.progress, preparedPages: ordinal, preparingPages: modeTotal,
    message: `Prepared ${ordinal} of ${modeTotal} ${mode === "plans" ? "floor-plan" : "schedule and detail"} pages. Most recent: PDF page ${page.page}.` } });
  console.info("[document-prepare] page complete", { jobId, page: page.page, tasks: tasks.length });
  return vectorWarnings;
}

export async function finishPreparation(jobId: string, vectorWarnings: string[], paidLimit: number, schedulesOnly: boolean, preparationFailures: number) {
  const { db, job } = await loadJob(jobId);
  let tasks = (await listExtractionTasks(db, jobId)).filter(task=>!task.result?.supersededBy&&taskMatchesFindings(task,job.analysis?.relevantPages));
  if(!schedulesOnly){
    await addTasks(jobId,hardwareContinuationTasks(tasks));
    tasks=(await listExtractionTasks(db,jobId)).filter(task=>!task.result?.supersededBy&&taskMatchesFindings(task,job.analysis?.relevantPages));
  }
  tasks.sort((a, b) => Number(a.kind === "plan") - Number(b.kind === "plan"));
  const pending = tasks.filter(task => task.status !== "complete" && (!schedulesOnly || task.kind !== "plan"));
  const ids = taskIdsWithinBudget(tasks.filter(task => !schedulesOnly || task.kind !== "plan"), new Map(pending.map(task => [task.task_key, task.id])), paidLimit);
  const selectedIds = new Set(ids);
  const paidTasks = tasks.filter(task => selectedIds.has(task.id) && !task.input.matrixArtifact && !task.input.hardwareTableArtifact && !(task.kind === "plan" && task.input.vectorArtifact)).length;
  await updateJob(jobId, { status: "extracting", analysis: { ...job.analysis,
    uncertainties: [...vectorWarnings, ...(pending.length > ids.length ? [`${pending.length - ids.length} paid extraction sections remain at the per-run model-call limit.`] : [])] },
    progress: { ...job.progress, totalTasks: tasks.length, completedTasks: tasks.filter(task => task.status === "complete").length, skippedTasks: preparationFailures,
      message: `Preparation complete. Processing ${ids.length} sections; native vector sections do not use AI credits.` } });
  return { ids, paidTasks };
}
