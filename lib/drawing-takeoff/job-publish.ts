import {reviewLabelHands} from './review-label-hands';
import { taskMatchesFindings } from "./plan-task-policy";
import { mergeHardwareImageReads } from "./hardware-sections";
import { reconcileHardwareContinuation } from "./hardware-continuation";
import { doorTypeDefinitionSupported, scheduleTypeReferences, wallDefinitionSupported } from "./definition-evidence";
import { mergeVisualScheduleRows } from "./visual-schedule";
import { combineExtractionOutputs } from "./extraction-schema";
import { hardwareSetIdentifier, hardwareSetKey } from "./references";
import { inventoryHardwareRows, reconcileHardwareRows, preserveHardwareIdentity } from "./hardware-evidence";
import { inventoryWallNotes, reconcileWallNotes, wallCaptionAliases } from "./wall-evidence";
import { VECTOR_VERSION } from "./vector-pdf";
import { canonicalBuilding, referencedDoorTypes, reconcileInventoriedRows, isOpeningRowTypeEvidence, type Opening } from "./indexing";
import { deduplicateDoors, normalizeMark } from "./geometry";
import { resolveOpeningHanding } from "./schedule-evidence";
import { mapAnalysisToPhaseRows, mergePhaseCandidateRows, phaseCandidateKey } from "./phase-import";
import { loadJob, listExtractionTasks, readIndex, updateJob, PUBLICATION_VERSION } from "./job-store";
import type { Kind, ProjectPhase } from "../types";
import {catalogOpeningKey} from './annotation-candidates';
import {printedReviewCandidates} from './printed-review-candidates';

export async function publishProgress(jobId: string, final = false) {
  const { db, job, document } = await loadJob(jobId);
  const recordedTasks=await listExtractionTasks(db,jobId);
  const excludedTasks=recordedTasks.filter(task=>!taskMatchesFindings(task,job.analysis?.relevantPages));
  const obsoletePages=new Set(excludedTasks.flatMap(task=>task.input.pages.map(page=>`${task.kind}:${page}`)));
  const tasks = recordedTasks.filter(task=>!task.result?.supersededBy&&taskMatchesFindings(task,job.analysis?.relevantPages));
  const wallPages = job.index_path && tasks.some(task => task.kind === "walls" && task.result) ? await readIndex(job.index_path) : [];
  const output = combineExtractionOutputs(null, null);
  const printedEvidence=tasks.filter(task=>task.kind==='plan'&&task.status==='complete'&&task.result?.vectorVersion===VECTOR_VERSION).flatMap(task=>Array.isArray(task.result?.printedTagReviewEvidence)?task.result.printedTagReviewEvidence.filter(item=>item&&typeof item==='object'&&task.input.pages.includes(Number((item as {page?:unknown}).page))):[]);
  const reviewPages=printedEvidence.length&&job.index_path?(wallPages.length?wallPages:await readIndex(job.index_path)):[];
  const printedCandidates=printedReviewCandidates(printedEvidence,job.analysis?.catalogDoorTypeCandidates||[],reviewPages,job.analysis?.annotationOpeningCandidates||[]);
  const reviewLabels=[...(job.analysis?.annotationOpeningCandidates||[]).filter((row:{sourcePrintedTag?:boolean})=>!row.sourcePrintedTag),...printedCandidates];
  output.uncertainties.push(...(job.analysis?.indexWarnings||[]));
  const catalogKeys=new Set<string>((job.analysis?.openingCatalog||[]).map((row:{mark:string;sourcePage:number})=>catalogOpeningKey(row.sourcePage,row.mark)));
  const catalogPages=new Set<number>((job.analysis?.openingCatalog||[]).map((row:{sourcePage:number})=>row.sourcePage));
  if(catalogKeys.size)output.uncertainties.push('Reusable schedule entries are definitions, not a verified physical door count. Review drawing labels below; additional unlabeled doorways may still be missing.');
  type ScopedOpening = typeof output.openings[number] & { sourceBuilding?: string; handingEvidence?: string };
  const openings = new Map<string, ScopedOpening>((job.analysis?.openings || []).filter((row:ScopedOpening)=>!catalogKeys.has(catalogOpeningKey(row.sourcePage,row.mark))).map((row: ScopedOpening) => [`${row.sourcePage}:${normalizeMark(row.mark)}`, row]));
  const scoped = <T extends object>(rows: T[], building: string) => rows.map(row => ({ ...row, sourceBuilding: building }));
  const observations: Array<typeof output.doorwayObservations[number] & { sourceBuilding?: string }> = [];
  const incompleteHardwareGroups=new Map<string,{page:number;group:string}>();
  const hardwareImageReads: typeof output.hardwareGroups[] = [];
  const hardwareContinuations: typeof output.hardwareGroups[] = [];
  const matrixOpeningGroups: Array<{mark:string;sourcePage:number;group:string}> = [];
  const visualScheduleRows: ScopedOpening[] = [];
  const groundedHardwareSets = new Set<string>();
  const obsoleteWallCaptions = new Set<string>();
  const obsoleteDefinitionKeys = new Set<string>();
  const definitionKey = (kind:'doorTypes'|'walls',row:{code:string;sourcePage:number},building:string) => phaseCandidateKey(document.id,kind,
    {...row,code:row.code&&building&&!row.code.startsWith(`${building} / `)?`${building} / ${row.code}`:row.code},0);
  const imageTypeReferences = new Map<string,string[]>();
  for (const task of tasks) {
    if (!task.result || task.status!=="complete") continue;
    const result = task.result as unknown as typeof output;
    if(task.input.hardwareSection&&Array.isArray(task.result.incompleteHardwareGroups))for(const group of task.result.incompleteHardwareGroups)incompleteHardwareGroups.set(`${task.input.pages[0]}:${group}`,{page:task.input.pages[0],group:String(group)});
    if(task.input.hardwareSection?.continuationGroup&&Array.isArray(task.result.incompleteHardwareGroups)&&task.result.incompleteHardwareGroups.length)output.uncertainties.push(`PDF page ${task.input.pages[0]}: the column continuation for hardware group ${task.input.hardwareSection.continuationGroup} could not be confirmed. Its saved component list may be incomplete; review the source.`);
    if (task.input.matrixArtifact && Array.isArray(task.result.matrixOpeningGroups)) matrixOpeningGroups.push(...task.result.matrixOpeningGroups);
    const building = canonicalBuilding(task.input.building || "", [...openings.values()].map(row => row.sourceBuilding || ""));
    const taskOpenings = task.input.inventory?.length ? reconcileInventoriedRows(task.input.inventory as Opening[], result.openings || []) : result.openings || [];
    for (const row of scoped(taskOpenings, building)) {
      if(catalogKeys.has(catalogOpeningKey(row.sourcePage,row.mark)))continue;
      if (task.input.scheduleSection) visualScheduleRows.push(row);
      else openings.set(`${row.sourcePage}:${normalizeMark(row.mark)}`, row);
    }
    const inventory = tasks.filter(candidate => candidate.kind === "doors" && candidate.input.building === task.input.building)
      .flatMap(candidate => candidate.input.inventory as Opening[] || []);
    const referenceBuilding = task.input.building || '';
    if(!imageTypeReferences.has(referenceBuilding))imageTypeReferences.set(referenceBuilding,scheduleTypeReferences(tasks,referenceBuilding));
    const imageReferences = imageTypeReferences.get(referenceBuilding)!;
    const definitions = (result.doorTypes || []).filter(type => {
      if (!isOpeningRowTypeEvidence(type, inventory) && doorTypeDefinitionSupported(type,inventory,imageReferences)) return true;
      obsoleteDefinitionKeys.add(definitionKey('doorTypes',type,building));
      output.uncertainties.push(`PDF page ${type.sourcePage}: door-type definition ${type.code || '(unmarked)'} was withheld because it conflicts with the opening schedule or describes a detail. Review the source diagram before adding it.`);
      return false;
    });
    output.doorTypes.push(...scoped(definitions, building));
    const printedHardware = task.kind === "hardware" && task.input.text ? inventoryHardwareRows(task.input.text, task.input.pages[0]) : [];
    for (const row of printedHardware) groundedHardwareSets.add(`${row.sourcePage}:${hardwareSetKey(building ? `${building} / ${row.group}` : row.group)}`);
    const taskHardware = (printedHardware.length ? reconcileHardwareRows(task.input.text!, task.input.pages[0], result.hardwareGroups || []) : result.hardwareGroups || []).map(preserveHardwareIdentity);
    if(task.input.hardwareSection?.continuationGroup)hardwareContinuations.push(scoped(taskHardware,building));
    else if(task.input.hardwareSection)hardwareImageReads.push(scoped(taskHardware,building));
    else output.hardwareGroups.push(...scoped(taskHardware, building));
    const wallPage = task.kind === "walls" ? wallPages.find(page => page.page === task.input.pages[0]) : undefined;
    if (wallPage) for (const caption of wallCaptionAliases(inventoryWallNotes(wallPage))) {
      obsoleteWallCaptions.add(`${wallPage.page}:${building ? `${building} / ${caption}` : caption}`.toUpperCase());
    }
    const wallCandidates=wallPage ? reconcileWallNotes(wallPage,result.walls||[]) : result.walls||[];
    const definitionsOfWalls=wallCandidates.filter(row=>{
      if(!wallPage||wallDefinitionSupported(wallPage,row))return true;
      obsoleteWallCaptions.add(`${row.sourcePage}:${building ? `${building} / ${row.code}` : row.code}`.toUpperCase());
      obsoleteDefinitionKeys.add(definitionKey('walls',row,building));
      return false;
    });
    output.walls.push(...scoped(definitionsOfWalls,building));
    output.uncertainties.push(...(result.uncertainties || []));
    const taskObservations=task.kind==="plan"&&task.result.vectorVersion!==VECTOR_VERSION
      ? (result.doorwayObservations||[]).map(row=>({...row,handing:"" as const,hingeSide:"unknown" as const,swingDirection:"unclear" as const,
        handingEvidence:"Vision-only hand was withheld pending independent geometry or manual verification."}))
      :result.doorwayObservations||[];
    observations.push(...scoped(taskObservations, building));
  }
  const baseImageRows=mergeHardwareImageReads(hardwareImageReads);
  for(const continuation of hardwareContinuations){
    const reconciled=reconcileHardwareContinuation(baseImageRows,continuation);
    hardwareImageReads.push(reconciled.rows);
    output.uncertainties.push(...reconciled.uncertainties);
  }
  output.hardwareGroups.push(...mergeHardwareImageReads(hardwareImageReads));
  for(const missing of incompleteHardwareGroups.values())if(!output.hardwareGroups.some(row=>row.sourcePage===missing.page&&row.group===missing.group))output.uncertainties.push(`PDF page ${missing.page}: hardware group ${missing.group} was only partly visible in the saved image sections and needs review.`);
  for (const row of mergeVisualScheduleRows(visualScheduleRows)) openings.set(`${row.sourcePage}:${normalizeMark(row.mark)}`, row);
  for (const link of matrixOpeningGroups) {
    const key=`${link.sourcePage}:${normalizeMark(link.mark)}`,row=openings.get(key);
    if(row&&(!(row as Opening).hardwareGroupInventoried||!row.hardwareGroup))openings.set(key,{...row,hardwareGroup:link.group});
  }
  const detected = deduplicateDoors(observations.map((row, i) => ({ id: String(i), page: row.sourcePage, box: row.boundingBox,
    mark: row.mark, confidence: row.confidence, evidence: row.symbolEvidence, tileId: `crop:${i}` })), 0.4);
  const kept = detected.doors.map(row => observations[Number(row.id)]);
  const rows = [...openings.values()];
  output.doorTypes.push(...referencedDoorTypes(rows, output.doorTypes));
  const matchedDoorways = kept.map(door => {
    const matches = rows.filter(row => normalizeMark(row.mark) === normalizeMark(door.mark)
      && (!door.sourceBuilding || !row.sourceBuilding || door.sourceBuilding === row.sourceBuilding));
    const row = matches.length === 1 ? matches[0] : null;
    return { ...door, evidence: door.symbolEvidence, schedulePage: row?.sourcePage ?? null, scheduleMatches: matches.length,
      scheduleEvidence: row?.evidence || "", width: row?.width || "", height: row?.height || "",
      handing: resolveOpeningHanding(row, door.handing, output.doorTypes),
      reviewReasons: [...(!row ? ["Door tag is unreadable, unmatched, or ambiguous across schedules."] : []), ...(!door.handing ? ["Reference side or swing requires review."] : [])] };
  });
  output.openings = rows.map(row => {
    const matched = matchedDoorways.filter(door => door.schedulePage === row.sourcePage && normalizeMark(door.mark) === normalizeMark(row.mark));
    const hands = [...new Set(matched.map(door => door.handing).filter(Boolean))];
    return { ...row, handing: resolveOpeningHanding(row, hands.length === 1 ? hands[0] : undefined, output.doorTypes),
      handingEvidence: hands.length === 1 ? matched.find(door => door.handing)?.handingEvidence || "" : "", countSource: "schedule" };
  });
  // A drawing-only upload still produces reviewable opening drafts. When a
  // schedule exists, unmatched symbols stay observations to avoid double counting.
  if (!output.openings.length&&!catalogKeys.size&&!printedCandidates.length) output.openings = kept.map(door => ({
    mark: door.mark || `Unmarked p${door.sourcePage} ${Math.round(door.boundingBox.x * 1000)}-${Math.round(door.boundingBox.y * 1000)}`,
    room: "", width: "", height: "", doorType: "", frameType: "", wallType: "", hardwareGroup: "", fireRating: "", quantity: "1",
    handing: door.handing, sourcePage: door.sourcePage, evidence: door.symbolEvidence, confidence: door.confidence,
    sourceBuilding: door.sourceBuilding, handingEvidence: door.handingEvidence, countSource: "plan-symbol",
  }));
  const completed = tasks.filter(task => task.status === "complete").length;
  const failed = tasks.filter(task => task.status === "failed").length;
  const pending = tasks.length - completed - failed;
  const uncertainties: string[] = [...output.uncertainties];
  if (job.progress?.uncheckedPages) uncertainties.push(`${job.progress.uncheckedPages} pages still need visual screening. Resume incomplete sections to continue.`);
  if (pending) uncertainties.push(`${pending} extraction sections are saved and waiting for processing.`);
  for (const task of tasks.filter(task => task.status === "failed")) uncertainties.push(`PDF page ${task.input.pages.join(", ")}, ${task.kind}: ${task.error?.message || "section failed"}. Other results have been retained.`);
  const unhanded = output.openings.filter(row => !row.handing).length;
  if (unhanded) uncertainties.push(`${unhanded} scheduled openings do not yet have a supported swing hand. Non-swing and framed openings may not require one.`);
  const handedReviewLabels=reviewLabelHands(reviewLabels,kept,output.doorTypes);
  const reviewHandCount=handedReviewLabels.filter(row=>row.handing).length;
  const analysis = { ...job.analysis, ...output, publicationVersion: PUBLICATION_VERSION, doorwayObservations: kept, matchedDoorways,
    annotationOpeningCandidates:handedReviewLabels,
    relevantPages: job.analysis?.relevantPages || [],
    uncertainties: [...new Set(uncertainties)], suppressedDuplicateDoorSymbols: detected.suppressed.length,
    serverImported: job.import_enabled, extractionProgress: { completed, failed, pending, total: tasks.length },
  };
  // Resolve references within a building, so identical type/set codes in separate
  // buildings cannot silently point at one another.
  const scopedReference = (building: string, value: string) => building && value && !value.startsWith(`${building} / `) ? `${building} / ${value}` : value;
  const rawReference = (building: string, value: string) => building && value.startsWith(`${building} / `) ? value.slice(building.length + 3) : value;
  const hardwareReference = (building: string, value: string) => {
    const identifier = rawReference(building, value);
    const match = output.hardwareGroups.find(group => ((group as typeof group & {sourceBuilding?:string}).sourceBuilding || "") === building && hardwareSetKey(group.group) === hardwareSetKey(identifier));
    return scopedReference(building, hardwareSetIdentifier(match?.group || identifier));
  };
  const phaseAnalysis = { ...analysis,
    openings: output.openings.map(row => { const building = (row as ScopedOpening).sourceBuilding || ""; return { ...row,
      wallType: scopedReference(building, row.wallType), doorType: scopedReference(building, row.doorType), hardwareGroup: hardwareReference(building, row.hardwareGroup) }; }),
    walls: output.walls.map(row => ({ ...row, code: scopedReference((row as typeof row & { sourceBuilding?: string }).sourceBuilding || "", row.code) })),
    doorTypes: output.doorTypes.map(row => ({ ...row, code: scopedReference((row as typeof row & { sourceBuilding?: string }).sourceBuilding || "", row.code) })),
    hardwareGroups: output.hardwareGroups.map(row => ({ ...row, group: scopedReference((row as typeof row & { sourceBuilding?: string }).sourceBuilding || "", hardwareSetIdentifier(row.group)) })),
  };
  if (job.import_enabled) {
    const additions = mapAnalysisToPhaseRows(document.id, phaseAnalysis);
    let saved = false;
    for (let attempt = 0; attempt < 4 && !saved; attempt++) {
      const { data: project, error: readError } = await db.from("projects").select("data,version").eq("id", job.project_id).single();
      if (readError || !project) throw new Error("The project was removed before draft rows could be saved.");
      const phases = project.data.phases as ProjectPhase[];
      const phase = phases?.find(row => row.id === job.phase_id);
      if (!phase) throw new Error("The target phase was removed before draft rows could be saved.");
      const updated = { ...phase, data: { ...phase.data } };
      for (const [kind, incoming] of Object.entries(additions)) {
        const names = new Set((incoming || []).map(row => row.name));
        const existing = (phase.data[kind as Kind] || []).filter(row => !(row.sourceDocumentId === document.id && row.reviewState === "ai-draft" && (
          (kind === "openings" && obsoletePages.has(`${row.countSource === "plan-symbol" ? "plan" : "doors"}:${row.sourcePage}`))
          || (kind === "openings" && catalogPages.has(Number(row.sourcePage)))
          || (kind === "doorTypes" && !row.sourceCatalogDefinition && obsoletePages.has(`types:${row.sourcePage}`))
          || (kind === "walls" && obsoletePages.has(`walls:${row.sourcePage}`))
          || (kind === "hardware" && obsoletePages.has(`hardware:${row.sourcePage}`))
          || (kind === "doorTypes" && row.sourcePlaceholder === true && !names.has(row.name))
          || ((kind === "doorTypes" || kind === "walls") && !row.sourceCatalogDefinition && row.sourcePlaceholder !== true && obsoleteDefinitionKeys.has(String(row.sourceCandidateKey)))
          || (kind === "walls" && obsoleteWallCaptions.has(`${row.sourcePage}:${row.name}`.toUpperCase()))
        )));
        const incomingKeys = new Set((incoming || []).map(row => row.sourceCandidateKey));
        updated.data[kind as Kind] = mergePhaseCandidateRows(existing, incoming || []).filter(row => !(kind === "hardware"
          && row.sourceDocumentId === document.id && row.reviewState === "ai-draft"
          && groundedHardwareSets.has(`${row.sourcePage}:${hardwareSetKey(String(row.group || ""))}`)
          && !incomingKeys.has(row.sourceCandidateKey)));
      }
      const next = { ...project.data, phases: phases.map(row => row.id === phase.id ? updated : row),
        ...(project.data.activePhaseId === phase.id ? updated.data : {}) };
      const { data: written, error: writeError } = await db.from("projects").update({ data: next }).eq("id", job.project_id).eq("version", project.version).select("id").maybeSingle();
      if (writeError) throw writeError;
      saved = !!written;
    }
    if (!saved) throw new Error("The project is being edited concurrently; draft candidates are saved and importing will retry.");
  }
  const partial = failed > 0 || pending > 0 || job.progress?.uncheckedPages > 0 || job.progress?.skippedTasks > 0;
  const status = final ? partial ? "partial" : "complete" : "extracting";
  const progress = { ...job.progress, completedTasks: completed, failedTasks: failed, totalTasks: tasks.length,
    reviewOpeningCount:reviewLabels.length,
    openingCount: output.openings.length, hardwareCount: output.hardwareGroups.length,
    handedCount: output.openings.length - unhanded,
    message: `${completed} of ${tasks.length} sections processed. ${output.openings.length} opening drafts, ${output.hardwareGroups.length} hardware components; ${output.openings.length - unhanded} handed opening drafts.${reviewHandCount?` ${reviewHandCount} supported ${reviewHandCount===1?"hand is":"hands are"} attached to door labels awaiting review.`:""}${reviewLabels.length?` ${reviewLabels.length} door labels need review before they are added to Openings.`:job.import_enabled ? " Saved to the phase as AI drafts." : " The phase already contained data; review and select candidates below to add them."}` };
  await updateJob(jobId, { status, analysis: phaseAnalysis, progress });
  const { error: saveError } = await db.from("project_documents").update({ analysis: phaseAnalysis, description: job.description, status: final ? "needs_review" : "indexed", phase_id: job.phase_id }).eq("id", document.id);
  if (saveError) throw saveError;
  return progress;
}
