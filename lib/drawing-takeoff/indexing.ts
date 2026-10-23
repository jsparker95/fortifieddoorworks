import type { z } from "zod";
import type { extractionSchema } from "./extraction-schema";

export type Opening = z.infer<typeof extractionSchema>["openings"][number];
export type TextBox = { text: string; x: number; y: number; width: number; height: number };
export type PageIndex = { page: number; text: string; lines: string[]; boxes: TextBox[]; width: number; height: number; rotation: number };
export type PageKind = "door" | "hardware" | "types" | "walls" | "plan";
export type PageFinding = { page: number; kinds: PageKind[]; building: string; evidence: string; method: "text" | "vision"; openingRows: Opening[] };

const dimension = String.raw`\d+\s*['’]\s*-?\s*\d+(?:\s+\d+\/\d+)?\s*["”]`;
// Both separate width/height columns and a combined W x H column are common.
const rowStart = new RegExp(String.raw`\b([A-Z]?\d{1,5}(?:[-][A-Z0-9]+|[A-Z])?)\s+((?:(?:[A-Z][A-Z./-]*|-)\s+){0,4})(${dimension})\s*(?:[xX×]\s*)?(${dimension})`, "g");
const cleanDimension = (s: string) => s.replace(/[’]/g, "'").replace(/[”]/g, '"').replace(/\s+/g, "");

/** Inventory literal schedule rows before asking a model to enrich their fields. */
export function inventoryOpeningRows(page: Pick<PageIndex, "page" | "text">): Opening[] {
  const heading = page.text.search(/\b(?:DOOR|OPENING)\s+(?:AND\s+FRAME\s+)?SCHEDULE\b/i);
  if (heading < 0) return [];
  const remainder = page.text.slice(heading);
  const end = remainder.search(/\bWINDOW\s+SCHEDULE\b|\bDOOR\s+(?:ELEVATION\s+)?TYPES\b/i);
  const section = end < 0 ? remainder : remainder.slice(0, end);
  const matches = [...section.matchAll(rowStart)];
  return matches.flatMap((m, i) => {
    const body = section.slice(m.index, matches[i + 1]?.index ?? Math.min(section.length, m.index + 350));
    // A mark must be in a table that also names material/type/hardware columns.
    if (!/\b(?:MATERIAL|MATL|HARDWARE|HDW|THICKNESS|FRAME)\b/i.test(section.slice(0, m.index))) return [];
    const tail = body.slice(m[0].length);
    const code = tail.match(new RegExp(String.raw`^\s*(?:${dimension}\s+)?([A-Z])\s+(?:SOLID|HOLLOW|INSULATED|ALUMINUM|WOOD|METAL)\b`, "i"))?.[1] || "";
    return [{ mark: m[1], width: cleanDimension(m[3]), height: cleanDimension(m[4]),
      doorType: code, room: "", handing: "", frameType: "", wallType: "", hardwareGroup: "", fireRating: "", quantity: "1",
      sourcePage: page.page, evidence: body.trim().slice(0, 500), confidence: 0.9 }];
  }).filter((r, i, rows) => rows.findIndex(other => other.mark === r.mark) === i);
}

export function findPageContent(page: PageIndex): PageFinding {
  const text = page.text;
  const openingRows = inventoryOpeningRows(page);
  const kinds: PageKind[] = [];
  const index = /\b(?:SHEET|DRAWING)\s+INDEX\b|\bINDEX\s+OF\s+(?:SHEETS|DRAWINGS)\b/i.test(text);
  const hardwareSets = [...text.matchAll(/\b(?:SET\s*(?:NO\.?\s*)?[:#]?\s*\d+(?:\.\d+)?[A-Z-]*|HARDWARE\s+SET\s+\d+)\b/gi)];
  const components = /\b(?:HINGE|DEADLATCH|DEADBOLT|LOCKSET|CLOSER|PANIC|THRESHOLD|GASKET)\b/i.test(text);
  if (openingRows.length >= 2) kinds.push("door");
  if (!index && hardwareSets.length >= 2 && components) kinds.push("hardware");
  if (!index && /\b(?:DOOR|FRAME)\s+(?:ELEVATION\s+)?TYPES\b/i.test(text)) kinds.push("types");
  if (!index && /\b(?:WALL|PARTITION)\s+(?:TYPES|TYPE\s+SCHEDULE|ASSEMBLIES)\b/i.test(text)) kinds.push("walls");
  // Ignore index references and specification sentences; match actual drawing titles.
  const titleLines = page.lines.filter(line => line.length < 180 && !/\b(?:REFER|SEE|REFERENCE)\b/i.test(line));
  if (!index && titleLines.some(line => /\bFLOOR\s+PLAN\b|\bLEVEL\s+\d+\s+PLAN\b/i.test(line)
    && !/\b(?:ROOF|REFLECTED|CEILING|POWER|LIGHTING|PLUMBING|SANITARY|HVAC|MECHANICAL|ELECTRICAL|FOUNDATION|FRAMING)\b/i.test(line))) kinds.push("plan");
  const building = text.match(/\bDOOR\s+SCHEDULE\s*[-–]\s*([A-Z][A-Z ]{2,40}?)(?=\s+DOOR\s+SCHEDULE|\s+(?:MARK|VV|WIDTH)\b)/)?.[1]?.trim() || "";
  return { page: page.page, kinds, building, openingRows, method: "text",
    evidence: openingRows.length ? `${openingRows.length} printed opening rows found.` : kinds.length ? `Found ${kinds.join(", ")} content on this sheet.` : index ? "Sheet index; references are not schedule tables." : "No confirmed schedule or architectural plan content." };
}

export function chunkRows<T>(rows: T[], size = 20): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("Chunk size must be a positive integer.");
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

export function hardwareSections(text: string): string[] {
  const headings = [...text.matchAll(/\bSET\s*(?:NO\.?\s*)?[:#]?\s*\d+(?:\.\d+)?[A-Z-]*(?=\s|\()/gi)];
  return headings.map((heading, index) => {
    const tail = text.slice(heading.index, headings[index + 1]?.index);
    const end = tail.search(/\b(?:DOOR|WINDOW)\s+(?:ELEVATION\s+)?(?:SCHEDULE|TYPES)\b/i);
    return end >= 0 ? tail.slice(0, end) : tail;
  }).filter(section => /\b(?:HINGE|CYLINDER|LOCK|CLOSER|HARDWARE|LATCH)\b/i.test(section));
}

/** Enrichment may fill fields, but never remove or renumber a printed row. */
export function reconcileInventoriedRows(inventory: Opening[], generated: Opening[]) {
  return inventory.map(row => {
    const model = generated.find(candidate => candidate.mark.trim().toUpperCase() === row.mark.toUpperCase());
    return { ...row, ...(model || {}), mark: row.mark, width: row.width, height: row.height,
      sourcePage: row.sourcePage, quantity: "1", evidence: row.evidence,
      confidence: model ? Math.min(model.confidence, 0.95) : row.confidence };
  });
}

/** Locate printed known marks; the model must still verify the label is a door tag. */
export function openingTagCrops(page: PageIndex, marks: string[], size = 800) {
  const known = new Set(marks.map(mark => mark.trim().toUpperCase()));
  return page.boxes.filter(box => known.has(box.text.trim().toUpperCase())).map((box, index) => {
    const width = Math.min(size, page.width * 2), height = Math.min(size, page.height * 2);
    return { id: `${page.page}:tag:${index}`, mark: box.text.trim(),
      x: Math.max(0, Math.min(page.width * 2 - width, (box.x + box.width / 2) * 2 - width / 2)),
      y: Math.max(0, Math.min(page.height * 2 - height, (box.y + box.height / 2) * 2 - height / 2)),
      width, height, pageWidth: page.width * 2, pageHeight: page.height * 2 };
  });
}
