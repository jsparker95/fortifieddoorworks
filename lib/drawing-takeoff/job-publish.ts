import { combineExtractionOutputs } from "./extraction-schema";
import { hardwareSetIdentifier, hardwareSetKey } from "./references";
import { inventoryHardwareRows, reconcileHardwareRows } from "./hardware-evidence";
import { canonicalBuilding, referencedDoorTypes, reconcileInventoriedRows, type Opening } from "./indexing";
import { deduplicateDoors, normalizeMark } from "./geometry";
import { resolveOpeningHanding } from "./schedule-evidence";
import { mapAnalysisToPhaseRows, mergePhaseCandidateRows } from "./phase-import";
import { loadJob, updateJob, type ExtractionTask } from "./job-store";
import type { Kind, ProjectPhase } from "../types";

export async function publishProgress(jobId: string, final = false) {
  const { db, job, document } = await loadJob(jobId);
  const { data, error } = await db.from("document_extraction_tasks").select("*").eq("job_id", jobId).neq("kind", "classify").order("task_key");
  if (error) throw error;
  const tasks = (data || []) as ExtractionTask[];
  const output = combineExtractionOutputs(null, null);
  type ScopedOpening = typeof output.openings[number] & { sourceBuilding?: string; handingEvidence?: string };
  const openings = new Map<string, ScopedOpening>((job.analysis?.openings || []).map((row: ScopedOpening) => [`${row.sourcePage}:${normalizeMark(row.mark)}`, row]));
  const scoped = <T extends object>(rows: T[], building: string) => rows.map(row => ({ ...row, sourceBuilding: building }));
  const observations: Array<typeof output.doorwayObservations[number] & { sourceBuilding?: string }> = [];
  const groundedHardwareSets = new Set<string>();
  for (const task of tasks) {
    if (!task.result) continue;
    const result = task.result as unknown as typeof output;
    const building = canonicalBuilding(task.input.building || "", [...openings.values()].map(row => row.sourceBuilding || ""));
    const taskOpenings = task.input.inventory?.length ? reconcileInventoriedRows(task.input.inventory as Opening[], result.openings || []) : result.openings || [];
    for (const row of scoped(taskOpenings, building)) openings.set(`${row.sourcePage}:${normalizeMark(row.mark)}`, row);
    output.doorTypes.push(...scoped(result.doorTypes || [], building));
    const printedHardware = task.kind === "hardware" && task.input.text ? inventoryHardwareRows(task.input.text, task.input.pages[0]) : [];
    for (const row of printedHardware) groundedHardwareSets.add(`${row.sourcePage}:${hardwareSetKey(building ? `${building} / ${row.group}` : row.group)}`);
    const taskHardware = printedHardware.length ? reconcileHardwareRows(task.input.text!, task.input.pages[0], result.hardwareGroups || []) : result.hardwareGroups || [];
    output.hardwareGroups.push(...scoped(taskHardware, building));
    output.walls.push(...scoped(result.walls || [], building));
    output.uncertainties.push(...(result.uncertainties || []));
    observations.push(...scoped(result.doorwayObservations || [], building));
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
  if (!output.openings.length) output.openings = kept.map(door => ({
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
  const analysis = { ...job.analysis, ...output, doorwayObservations: kept, matchedDoorways,
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
        const existing = (phase.data[kind as Kind] || []).filter(row => !(kind === "doorTypes" && row.sourceDocumentId === document.id && row.sourcePlaceholder === true && row.reviewState === "ai-draft" && !names.has(row.name)));
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
    openingCount: output.openings.length, hardwareCount: output.hardwareGroups.length,
    handedCount: output.openings.length - unhanded,
    message: `${completed} of ${tasks.length} sections processed. ${output.openings.length} opening drafts, ${output.hardwareGroups.length} hardware components; ${output.openings.length - unhanded} supported hands.${job.import_enabled ? " Saved to the phase as AI drafts." : " The phase already contained data; review and select candidates below to add them."}` };
  await updateJob(jobId, { status, analysis: phaseAnalysis, progress });
  const { error: saveError } = await db.from("project_documents").update({ analysis: phaseAnalysis, description: job.description, status: final ? "needs_review" : "indexed", phase_id: job.phase_id }).eq("id", document.id);
  if (saveError) throw saveError;
  return progress;
}
