import { z } from "zod";

// Keep the schema sent to Gemini simple. Large maxItems values and nested
// numeric bounds make its constrained decoder reject the request before it
// reads the PDF. Validate and limit the generated rows after generation.
export const extractionSchema = z.object({
  relevantPages: z.array(z.object({ page: z.number(), section: z.string(), reason: z.string(), confidence: z.number() })),
  walls: z.array(z.object({ code: z.string(), description: z.string(), finishedThickness: z.string(), layers: z.array(z.string()), sourcePage: z.number(), evidence: z.string(), confidence: z.number() })),
  doorTypes: z.array(z.object({ code: z.string(), description: z.string(), material: z.string(), manufacturer: z.string(), windowOrLouver: z.string(), fireRating: z.string(), width: z.string(), height: z.string(), sourcePage: z.number(), evidence: z.string(), confidence: z.number() })),
  openings: z.array(z.object({ mark: z.string(), room: z.string(), width: z.string(), height: z.string(), handing: z.string(), doorType: z.string(), frameType: z.string(), wallType: z.string(), hardwareGroup: z.string(), fireRating: z.string(), quantity: z.string(), sourcePage: z.number(), evidence: z.string(), confidence: z.number() })),
  doorwayObservations: z.array(z.object({
    mark: z.string(), sourcePage: z.number(),
    boundingBox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
    hingeSide: z.enum(["left", "right", "unknown"]),
    swingDirection: z.enum(["toward_reference_side", "away_from_reference_side", "unclear"]),
    handing: z.enum(["LH", "RH", "LHR", "RHR", "", "unclear"]),
    handingEvidence: z.string(), symbolEvidence: z.string(), confidence: z.number(),
  })),
  hardwareGroups: z.array(z.object({ group: z.string(), name: z.string(), brand: z.string(), component: z.string(), quantity: z.number(), frameModification: z.string(), doorModification: z.string(), doorPrep: z.string(), sourcePage: z.number(), evidence: z.string(), confidence: z.number() })),
  specFindings: z.array(z.object({ subject: z.string(), requirement: z.string(), allowedManufacturers: z.array(z.string()), restrictedManufacturers: z.array(z.string()), exclusive: z.boolean(), sourcePage: z.number(), evidence: z.string(), confidence: z.number() })),
  uncertainties: z.array(z.string()),
});

type Extraction = z.infer<typeof extractionSchema>;
export const scheduleExtractionSchema = extractionSchema.pick({
  relevantPages: true, doorTypes: true, openings: true, hardwareGroups: true,
  specFindings: true, uncertainties: true,
});
export const planExtractionSchema = extractionSchema.pick({
  relevantPages: true, walls: true, doorwayObservations: true, uncertainties: true,
});

export function combineExtractionOutputs(
  schedule: z.infer<typeof scheduleExtractionSchema> | null,
  plan: z.infer<typeof planExtractionSchema> | null,
): Extraction {
  return {
    relevantPages: [...(schedule?.relevantPages || []), ...(plan?.relevantPages || [])],
    walls: plan?.walls || [],
    doorTypes: schedule?.doorTypes || [], openings: schedule?.openings || [],
    doorwayObservations: plan?.doorwayObservations || [],
    hardwareGroups: schedule?.hardwareGroups || [], specFindings: schedule?.specFindings || [],
    uncertainties: [...(schedule?.uncertainties || []), ...(plan?.uncertainties || [])],
  };
}

const rowLimits = {
  relevantPages: 60, walls: 150, doorTypes: 150, openings: 2000,
  doorwayObservations: 2000, hardwareGroups: 500, specFindings: 150,
} as const;

function validBox(box: Extraction["doorwayObservations"][number]["boundingBox"]) {
  return Object.values(box).every(Number.isFinite) && box.x >= 0 && box.y >= 0
    && box.width > 0 && box.height > 0 && box.x + box.width <= 1 && box.y + box.height <= 1;
}

function confidence(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function traditionalHanding(row: Extraction["doorwayObservations"][number]): Extraction["doorwayObservations"][number]["handing"] {
  const evidence = row.handingEvidence;
  if (/\b(?:assum\w*|guess\w*|presum\w*|infer\w*)\b/i.test(evidence)
    || !/\b(?:outside|exterior|key(?:ed)? side|corridor side)\b/i.test(evidence)
    || row.hingeSide === "unknown" || row.swingDirection === "unclear") return "";
  if (row.hingeSide === "left") return row.swingDirection === "toward_reference_side" ? "LHR" : "LH";
  return row.swingDirection === "toward_reference_side" ? "RHR" : "RH";
}

export function sanitizeExtraction(output: Extraction, selectedPages: ReadonlySet<number> | readonly number[]) {
  // The model sees a shortened PDF. Resolve its page numbers to the original
  // document before filtering citations or saving them to the phase.
  const ordered: number[] = Array.isArray(selectedPages) ? [...selectedPages] : [...selectedPages].sort((a, b) => a - b);
  const selectedPageNumbers = new Set(ordered);
  const resolvePage = (page: number) => {
    if (!Number.isInteger(page)) return null;
    if (Array.isArray(selectedPages) && page >= 1 && page <= ordered.length) return ordered[page - 1];
    return selectedPageNumbers.has(page) ? page : null;
  };
  const cited = <T extends { sourcePage: number; confidence: number }>(rows: T[], limit: number) =>
    rows.flatMap((row) => {
      const sourcePage = resolvePage(row.sourcePage);
      return sourcePage ? [{ ...row, sourcePage, confidence: confidence(row.confidence) }] : [];
    }).slice(0, limit);
  const citedDoorways = cited(output.doorwayObservations.filter((row) => validBox(row.boundingBox)), rowLimits.doorwayObservations);
  const doorwayObservations = citedDoorways
    .map((row) => ({ ...row, handing: traditionalHanding(row) }));
  const safeOutput = {
    relevantPages: output.relevantPages.flatMap((row) => {
      const page = resolvePage(row.page);
      return page ? [{ ...row, page, confidence: confidence(row.confidence) }] : [];
    }).slice(0, rowLimits.relevantPages),
    walls: cited(output.walls, rowLimits.walls).map((row) => ({ ...row, layers: row.layers.slice(0, 100) })),
    doorTypes: cited(output.doorTypes, rowLimits.doorTypes),
    openings: cited(output.openings, rowLimits.openings),
    doorwayObservations,
    hardwareGroups: cited(output.hardwareGroups, rowLimits.hardwareGroups).map((row) => ({ ...row, quantity: Number.isFinite(row.quantity) ? Math.max(0, Math.floor(row.quantity)) : 0 })),
    specFindings: cited(output.specFindings, rowLimits.specFindings).map((row) => ({ ...row, allowedManufacturers: row.allowedManufacturers.slice(0, 100), restrictedManufacturers: row.restrictedManufacturers.slice(0, 100) })),
    uncertainties: output.uncertainties.slice(0, 100),
  };
  const rejectedCount = (Object.keys(rowLimits) as Array<keyof typeof rowLimits>)
    .reduce((sum, key) => sum + output[key].length - safeOutput[key].length, 0);
  if (rejectedCount) safeOutput.uncertainties.push(`${rejectedCount} extraction item(s) with invalid citations, geometry, or excessive result counts were discarded.`);
  const withheldHandings = doorwayObservations.filter((row, index) => row.handing !== citedDoorways[index].handing).length;
  if (withheldHandings) safeOutput.uncertainties.push(`${withheldHandings} doorway hand(s) were corrected or left undetermined because the reported hinge, swing, and reference side did not support the model's hand.`);
  return safeOutput;
}
