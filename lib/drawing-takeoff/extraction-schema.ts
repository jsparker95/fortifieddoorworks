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

export function sanitizeExtraction(output: Extraction, selectedPageNumbers: ReadonlySet<number>) {
  const onSelectedPage = (row: { sourcePage: number }) => selectedPageNumbers.has(row.sourcePage);
  const cited = <T extends { sourcePage: number; confidence: number }>(rows: T[], limit: number) =>
    rows.filter(onSelectedPage).slice(0, limit).map((row) => ({ ...row, confidence: confidence(row.confidence) }));
  const safeOutput = {
    relevantPages: output.relevantPages.filter((row) => selectedPageNumbers.has(row.page))
      .slice(0, rowLimits.relevantPages).map((row) => ({ ...row, confidence: confidence(row.confidence) })),
    walls: cited(output.walls, rowLimits.walls).map((row) => ({ ...row, layers: row.layers.slice(0, 100) })),
    doorTypes: cited(output.doorTypes, rowLimits.doorTypes),
    openings: cited(output.openings, rowLimits.openings),
    doorwayObservations: cited(output.doorwayObservations.filter((row) => validBox(row.boundingBox)), rowLimits.doorwayObservations),
    hardwareGroups: cited(output.hardwareGroups, rowLimits.hardwareGroups).map((row) => ({ ...row, quantity: Number.isFinite(row.quantity) ? Math.max(0, Math.floor(row.quantity)) : 0 })),
    specFindings: cited(output.specFindings, rowLimits.specFindings).map((row) => ({ ...row, allowedManufacturers: row.allowedManufacturers.slice(0, 100), restrictedManufacturers: row.restrictedManufacturers.slice(0, 100) })),
    uncertainties: output.uncertainties.slice(0, 100),
  };
  const rejectedCount = (Object.keys(rowLimits) as Array<keyof typeof rowLimits>)
    .reduce((sum, key) => sum + output[key].length - safeOutput[key].length, 0);
  if (rejectedCount) safeOutput.uncertainties.push(`${rejectedCount} extraction item(s) with invalid citations, geometry, or excessive result counts were discarded.`);
  return safeOutput;
}
