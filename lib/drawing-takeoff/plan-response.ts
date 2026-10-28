import { z } from "zod";
import { extractionSchema } from "./extraction-schema";

/** Model response coordinates have an explicit unit; stored geometry is always 0–1. */
export const planResponseSchema = z.object({
  coordinateSystem: z.literal("0-1000"),
  doorwayObservations: extractionSchema.shape.doorwayObservations,
});

export function normalizePlanResponse(value: unknown) {
  const raw = planResponseSchema.parse(value);
  return { doorwayObservations: raw.doorwayObservations.map(row => ({ ...row, boundingBox: {
    x: row.boundingBox.x / 1000, y: row.boundingBox.y / 1000,
    width: row.boundingBox.width / 1000, height: row.boundingBox.height / 1000,
  } })) };
}
