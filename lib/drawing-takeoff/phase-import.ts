import type { Kind, Row } from "@/lib/types";
import { hardwareSetKey } from "./references";
import { sameHardwareSourceLine } from "./hardware-evidence";

type Candidate = Record<string, unknown>;
type PhaseRows = Partial<Record<Kind, Row[]>>;

export function phaseHasTakeoffData(data: Partial<Record<Kind, Row[]>> | undefined) {
  return (["openings", "walls", "doorTypes", "hardware"] as Kind[]).some((kind) => (data?.[kind] || []).length > 0);
}

const stringValue = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
const sourcePage = (row: Candidate) => Math.max(1, Number(row.sourcePage) || 1);

function stablePart(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function candidateName(kind: Kind, row: Candidate) {
  if (kind === "openings") return stringValue(row.mark) || `unmarked page ${sourcePage(row)}`;
  if (kind === "walls" || kind === "doorTypes") return stringValue(row.code || row.name) || `page ${sourcePage(row)}`;
  const group = stringValue(row.group || row.name);
  const component = stringValue(row.component);
  return group || component ? `${group}|${component}` : `page ${sourcePage(row)}`;
}

export function phaseCandidateKey(documentId: string, kind: Kind, row: Candidate, index: number) {
  if(kind==='openings'&&row.sourcePrintedTag===true&&typeof row.sourceLocationKey==='string')return `${documentId}:openings:${row.sourceLocationKey}`;
  const name = stablePart(candidateName(kind, row)) + (kind === "hardware" && row.sourceHardwareLine !== undefined ? `:line-${stringValue(row.sourceHardwareLine)}` : "");
  // The same opening mark or hardware component can appear on separate sheets.
  // Keep those source rows independent while making re-analysis idempotent.
  return `${documentId}:${kind}:${name || `page-${sourcePage(row)}-${index}`}:p${sourcePage(row)}`;
}

export function mapPhaseCandidate(
  documentId: string,
  kind: Kind,
  row: Candidate,
  index: number,
  reviewState: "ai-draft" | "human-reviewed" = "ai-draft",
): Row {
  const stamp = {
    id: crypto.randomUUID(),
    sourceDocumentId: documentId,
    sourceCandidateKey: phaseCandidateKey(documentId, kind, row, index),
    sourcePage: sourcePage(row),
    sourceBuilding: stringValue(row.sourceBuilding),
    sourcePlaceholder: row.sourcePlaceholder === true,
    sourceEvidence: stringValue(row.evidence),
    extractionConfidence: Number(row.confidence) || 0,
    reviewState,
    ...(row.sourcePrintedTag===true?{sourcePrintedTag:true,sourceLocationKey:stringValue(row.sourceLocationKey),sourcePrintedCode:stringValue(row.sourcePrintedCode),sourceVisibility:stringValue(row.sourceVisibility),sourceDoorContext:stringValue(row.sourceDoorContext),sourcePossibleDuplicates:stringValue(row.sourcePossibleDuplicates),sourceOverlapReviewRequired:row.sourceOverlapReviewRequired===true,sourceDuplicateDecision:stringValue(row.sourceDuplicateDecision)}:{}),
    ...(row.sourceCatalogDefinition===true?{sourceCatalogDefinition:true,sourceCatalogCode:stringValue(row.sourceCatalogCode),sourceSchedulePage:Number(row.sourceSchedulePage)||undefined}:{}),
    ...(row.sourceAnnotation===true||row.sourcePrintedTag===true?{sourceAnnotation:row.sourceAnnotation===true,sourceCatalogCode:stringValue(row.sourceCatalogCode),sourceSchedulePage:Number(row.sourceSchedulePage)||undefined,
      sourceAssociationStatus:stringValue(row.associationStatus),sourceAssociationEvidence:stringValue(row.associationEvidence),sourceLabelBounds:stringValue(row.sourceLabelBounds),sourceLabelPages:stringValue(row.sourceLabelPages),sourceCatalogLabelBounds:stringValue(row.sourceCatalogLabelBounds)}:{}),
  };

  if (kind === "openings") return {
    ...stamp,
    name: stringValue(row.mark) || `Unmarked · p. ${sourcePage(row)}`,
    room: stringValue(row.room), width: stringValue(row.width), height: stringValue(row.height),
    handing: stringValue(row.handing), doorType: stringValue(row.doorType),
    frameType: stringValue(row.frameType), wall: stringValue(row.wallType),
    group: stringValue(row.hardwareGroup), fire: stringValue(row.fireRating), fireRating: stringValue(row.fireRating),
    doorMaterial: stringValue(row.doorMaterial), doorFinish: stringValue(row.doorFinish),
    doorThickness: stringValue(row.doorThickness), frameMaterial: stringValue(row.frameMaterial), frameFinish: stringValue(row.frameFinish),
    qty: stringValue(row.quantity), hingeSide: stringValue(row.hingeSide),
    swingDirection: stringValue(row.swingDirection), planReviewReasons: Array.isArray(row.planReviewReasons) ? row.planReviewReasons.map(String).join("; ") : stringValue(row.planReviewReasons),
    handingEvidence: stringValue(row.handingEvidence),
    countSource: stringValue(row.countSource),
    sourceMarkedOut: row.markedOut === true, scopeEvidence: stringValue(row.scopeEvidence),
    scheduleNotes: stringValue(row.scheduleNotes), leafCount: stringValue(row.leafCount), leafWidth: stringValue(row.leafWidth),
  };
  if (kind === "walls") return {
    ...stamp, name: stringValue(row.code) || `Unmarked · p. ${sourcePage(row)}`,
    description: stringValue(row.description), size: stringValue(row.finishedThickness),
    layers: Array.isArray(row.layers) ? row.layers.map(String).join(" / ") : "",
  };
  if (kind === "doorTypes") return {
    ...stamp, name: stringValue(row.code) || `Unmarked · p. ${sourcePage(row)}`,
    description: stringValue(row.description), brand: stringValue(row.manufacturer),
    material: stringValue(row.material), window: stringValue(row.windowOrLouver),
    fire: stringValue(row.fireRating), width: stringValue(row.width), height: stringValue(row.height),
  };
  return {
    ...stamp, group: stringValue(row.group), component: stringValue(row.component || row.name),
    brand: stringValue(row.brand), qty: row.quantityKnown === false ? "" : Number(row.quantity) || 0,
    sourceHardwareLine: row.sourceHardwareLine === undefined ? undefined : stringValue(row.sourceHardwareLine),
    quantityKnown: row.quantityKnown !== false, sourceRequirement: row.sourceRequirement === true,
    frameMod: stringValue(row.frameModification), doorMod: stringValue(row.doorModification),
    doorPrep: stringValue(row.doorPrep),
  };
}

export function mapAnalysisToPhaseRows(documentId: string, analysis: Record<string, unknown>): PhaseRows {
  const rows: PhaseRows = {};
  const keys: Array<[Kind, string]> = [
    ["openings", "openings"], ["walls", "walls"],
    ["doorTypes", "doorTypes"], ["hardware", "hardwareGroups"],
  ];
  for (const [kind, key] of keys) {
    const candidates = Array.isArray(analysis[key]) ? analysis[key] as Candidate[] : [];
    rows[kind] = candidates.flatMap((candidate, index) => candidate.autoImportEligible === false
      ? [] : [mapPhaseCandidate(documentId, kind, candidate, index)]);
  }
  return rows;
}

/** Re-analysis replaces only prior AI drafts; human-reviewed values win. */
export function mergePhaseCandidateRows(existing: Row[], incoming: Row[]): Row[] {
  const next = [...existing];
  for (const candidate of incoming) {
    const key = candidate.sourceCandidateKey;
    const index = key ? next.findIndex((row) => row.sourceCandidateKey === key || (
      (row.sourcePlaceholder === true || candidate.sourcePlaceholder === true) && row.sourceDocumentId === candidate.sourceDocumentId
      && String(key).includes(":doorTypes:") && String(row.sourceCandidateKey).includes(":doorTypes:") && row.name === candidate.name
    ) || (
      String(key).includes(":hardware:") && String(row.sourceCandidateKey).includes(":hardware:")
      && row.sourceDocumentId === candidate.sourceDocumentId && row.sourcePage === candidate.sourcePage
      && row.sourceBuilding === candidate.sourceBuilding
      && (row.sourceHardwareLine === undefined || candidate.sourceHardwareLine === undefined || row.sourceHardwareLine === candidate.sourceHardwareLine) && (row.component === candidate.component || sameHardwareSourceLine(row.sourceEvidence, candidate.sourceEvidence))
      && hardwareSetKey(stringValue(row.group)) === hardwareSetKey(stringValue(candidate.group))
    )) : -1;
    if (index < 0) {
      next.push(candidate);
    } else if (next[index].reviewState === "ai-draft" && !(candidate.sourcePlaceholder === true && next[index].sourcePlaceholder !== true)) {
      next[index] = { ...candidate, id: next[index].id };
    }
  }
  return next;
}
