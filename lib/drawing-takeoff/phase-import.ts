import type { Kind, Row } from "@/lib/types";

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
  const name = stablePart(candidateName(kind, row));
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
    sourceEvidence: stringValue(row.evidence),
    extractionConfidence: Number(row.confidence) || 0,
    reviewState,
  };

  if (kind === "openings") return {
    ...stamp,
    name: stringValue(row.mark) || `Unmarked · p. ${sourcePage(row)}`,
    room: stringValue(row.room), width: stringValue(row.width), height: stringValue(row.height),
    handing: stringValue(row.handing), doorType: stringValue(row.doorType),
    frameType: stringValue(row.frameType), wall: stringValue(row.wallType),
    group: stringValue(row.hardwareGroup), fireRating: stringValue(row.fireRating),
    qty: stringValue(row.quantity), hingeSide: stringValue(row.hingeSide),
    swingDirection: stringValue(row.swingDirection), planReviewReasons: Array.isArray(row.planReviewReasons) ? row.planReviewReasons.map(String).join("; ") : stringValue(row.planReviewReasons),
    handingEvidence: stringValue(row.handingEvidence),
    countSource: stringValue(row.countSource),
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
    brand: stringValue(row.brand), qty: Number(row.quantity) || 0,
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
    const index = key ? next.findIndex((row) => row.sourceCandidateKey === key) : -1;
    if (index < 0) {
      next.push(candidate);
    } else if (next[index].reviewState === "ai-draft") {
      next[index] = { ...candidate, id: next[index].id };
    }
  }
  return next;
}
