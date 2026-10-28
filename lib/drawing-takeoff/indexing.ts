import type { z } from "zod";
import type { extractionSchema } from "./extraction-schema";
import { compoundScheduleColumns } from "./schedule-columns";

export type Opening = z.infer<typeof extractionSchema>["openings"][number] & {
  doorMaterial?: string; doorFinish?: string; doorThickness?: string; frameMaterial?: string; frameFinish?: string; doorTypeInventoried?: boolean;
  fireRatingInventoried?: boolean; hardwareGroupInventoried?: boolean;
};
export type TextBox = { text: string; x: number; y: number; width: number; height: number };
export type PageIndex = { page: number; text: string; lines: string[]; boxes: TextBox[]; width: number; height: number; rotation: number };
export type PageKind = "door" | "hardware" | "types" | "walls" | "plan";
export type PageFinding = { page: number; kinds: PageKind[]; building: string; evidence: string; method: "text" | "vision"; openingRows: Opening[] };

const dimension = String.raw`\d+\s*['’]\s*-?\s*\d+(?:\s+\d+\/\d+)?\s*["”]`;
// Both separate width/height columns and a combined W x H column are common.
const rowStart = new RegExp(String.raw`\b([A-Z]?\d{1,5}(?:[-][A-Z0-9]+|[A-Z])?)\s+((?:(?:[A-Z][A-Z./-]*|-)\s+){0,4})(${dimension})\s*(?:[xX×]\s*)?(${dimension})`, "g");
const cleanDimension = (s: string) => s.replace(/[’]/g, "'").replace(/[”]/g, '"').trim()
  .replace(/\s*'\s*-?\s*/g, "'-").replace(/\s*"\s*/g, '"').replace(/\s+/g, " ");

/** Inventory literal schedule rows before asking a model to enrich their fields. */
export function inventoryOpeningRows(page: Pick<PageIndex, "page" | "text"> & Partial<Pick<PageIndex, "boxes">>): Opening[] {
  const heading = page.text.search(/\b(?:DOOR|OPENING)\s+(?:AND\s+FRAME\s+)?SCHEDULE\b/i);
  if (heading < 0) return [];
  const remainder = page.text.slice(heading);
  const end = remainder.search(/\bWINDOW\s+SCHEDULE\b|\bDOOR\s+(?:ELEVATION\s+)?TYPES\b/i);
  const section = end < 0 ? remainder : remainder.slice(0, end);
  const matches = [...section.matchAll(rowStart)];
  const rows: Opening[] = matches.flatMap((m, i) => {
    const body = section.slice(m.index, matches[i + 1]?.index ?? Math.min(section.length, m.index + 350));
    // A mark must be in a table that also names material/type/hardware columns.
    if (!/\b(?:MATERIAL|MATL|HARDWARE|HDW|THICKNESS|FRAME)\b/i.test(section.slice(0, m.index))) return [];
    const tail = body.slice(m[0].length);
    const leadingType = /\bTYPE\s+MATL\s+DIMENSIONS\b/i.test(section.slice(0, m.index)) ? m[2].trim().split(/\s+/)[0] : "";
    const code = leadingType && !["-", "N/A"].includes(leadingType) ? leadingType : tail.match(new RegExp(String.raw`^\s*(?:${dimension}\s+)?([A-Z])\s+(?:SOLID|HOLLOW|INSULATED|ALUMINUM|WOOD|METAL)\b`, "i"))?.[1] || "";
    const frameRating = /FRAME\s+TYPE\s+FIRE\s+RATING/i.test(section.slice(0, m.index)) ? body.match(/\b(F[0-9A-Z-]+|W-\d+)\s+(NR|\d+\s*(?:MIN\.?|HOUR|HR))\b/i) : null;
    const hardwareGroupInventoried = /HARDWARE\s+HARDWARE\s+SET/i.test(section.slice(0, m.index));
    const hardwareColumn = hardwareGroupInventoried ? body.match(/\b(?:PANIC|LOCKSET|PUSH\s*\/\s*PULL|PASSAGE|PRIVATE|BI[- ]?FOLD)\b.*?\s+(\d{1,2}(?:-[A-Z])?)(?=\s|$)(?:\s+(\d+\s*(?:MIN\.?|HOUR|HR)))?/i) : null;
    const hardwareGroup = hardwareColumn?.[1] || "";
    const fireRatingInventoried = /FRAME\s+TYPE\s+FIRE\s+RATING/i.test(section.slice(0, m.index))
      || (hardwareGroupInventoried && /FIRE\s+RATING/i.test(section.slice(0, m.index)));
    // Some type codes are reused with different materials. Keep each literal
    // opening's own material/finish/thickness instead of expanding its type.
    const materialColumns = /THICKNESS\s+TYPE\s+DOOR\s+MATERIAL\s+FINISH\s+FRAME\s+MATERIAL/i.test(section.slice(0, m.index))
      ? tail.match(new RegExp(String.raw`^\s*(${dimension})\s+[A-Z]\s+(INSULATED HOLLOW METAL|HOLLOW METAL|SOLID CORE WOOD|ALUMINUM STOREFRONT|INSULATED STEEL|ALUMINUM|WOOD|METAL)\s+(RED PAINT|PAINT|BRONZE)\s+(HOLLOW METAL|ALUMINUM|STEEL|N/A)\b`, "i")) : null;
    return [{ mark: m[1], width: cleanDimension(m[3]), height: cleanDimension(m[4]),
      doorType: code, room: "", handing: "", frameType: frameRating?.[1] || "", wallType: "", hardwareGroup,
      fireRating: frameRating?.[2]?.trim() || hardwareColumn?.[2]?.trim() || "", fireRatingInventoried, hardwareGroupInventoried,
      doorThickness: materialColumns ? cleanDimension(materialColumns[1]) : "", doorMaterial: materialColumns?.[2] || "",
      doorFinish: materialColumns?.[3] || "", frameMaterial: materialColumns?.[4] || "", quantity: "1",
      sourcePage: page.page, evidence: body.trim().slice(0, 500), confidence: 0.9 }];
  }).filter((r, i, rows) => rows.findIndex(other => other.mark === r.mark) === i);
  const columns = page.boxes ? compoundScheduleColumns(page.boxes, rows) : new Map();
  return rows.map(row => ({ ...row, ...columns.get(row.mark) }));
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
  if (!index && /\b(?:DOOR|FRAME)\s+(?:(?:ELEVATION\s+)?TYPES|ELEVATIONS)\b/i.test(text)) kinds.push("types");
  if (!index && /\b(?:WALL|PARTITION)\s+(?:TYPES|TYPE\s+SCHEDULE|ASSEMBLIES)\b/i.test(text)) kinds.push("walls");
  kinds.push(...groundedScheduleKinds(page, openingRows).filter(kind => !kinds.includes(kind)));
  // Ignore index references and specification sentences; match actual drawing titles.
  const titleLines = page.lines.filter(line => line.length < 180 && !/\b(?:REFER|SEE|REFERENCE)\b/i.test(line));
  if (!index && titleLines.some(line => /\bFLOOR\s+PLAN\b|\bLEVEL\s+\d+\s+PLAN\b/i.test(line)
    && !/\b(?:ROOF|REFLECTED|CEILING|POWER|LIGHTING|PLUMBING|SANITARY|HVAC|MECHANICAL|ELECTRICAL|FOUNDATION|FRAMING)\b/i.test(line))) kinds.push("plan");
  const building = text.match(/\bDOOR\s+SCHEDULE\s*[-–]\s*([A-Z][A-Z ]{2,40}?)(?=\s+DOOR\s+SCHEDULE|\s+(?:MARK|VV|WIDTH)\b)/)?.[1]?.trim() || "";
  return { page: page.page, kinds, building, openingRows, method: "text",
    evidence: openingRows.length ? `${openingRows.length} printed opening rows found.` : kinds.length ? `Found ${kinds.join(", ")} content on this sheet.` : index ? "Sheet index; references are not schedule tables." : "No confirmed schedule or architectural plan content." };
}

/** Literal tables and numbered elevations survive an incomplete visual classification. */
export function groundedScheduleKinds(page: PageIndex, rows = inventoryOpeningRows(page)): PageKind[] {
  const kinds: PageKind[] = rows.length >= 2 ? ["door"] : [];
  const codes = new Set(rows.map(row => row.doorType).filter(Boolean));
  const captions = page.boxes.filter(box => /^(?:[A-Z]\d+\s+)?(?:DOOR TYPES|DOOR ELEVATIONS|DOORS)$/i.test(box.text.trim()));
  if (codes.size >= 2 && captions.some(caption => new Set(page.boxes.filter(box => codes.has(box.text.trim())
    && box.x >= caption.x - 50 && box.x < caption.x + page.width / 2
    && box.y > caption.y - 180 && box.y < caption.y + 20).map(box => box.text.trim())).size >= 2)) kinds.push("types");
  if (/\bCONCRETE\s+WALL\s+SCHEDULE\b/i.test(page.text) && /\bCW-\d+[A-Z]?\s+\d+(?:\s+\d+\/\d+)?\s*"/i.test(page.text)) kinds.push("walls");
  return kinds;
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
      sourcePage: row.sourcePage, quantity: "1", evidence: row.evidence, doorType: row.doorTypeInventoried ? row.doorType : row.doorType || model?.doorType || "",
      doorMaterial: row.doorMaterial, doorFinish: row.doorFinish, doorThickness: row.doorThickness, frameMaterial: row.frameMaterial, frameFinish: row.frameFinish,
      frameType: row.frameType || (row.frameMaterial ? "" : model?.frameType || ""),
      hardwareGroup: row.hardwareGroupInventoried ? row.hardwareGroup : row.hardwareGroup || model?.hardwareGroup || "",
      fireRating: row.fireRatingInventoried ? row.fireRating : row.fireRating || model?.fireRating || "",
      handing: model?.handing && ["LH", "RH", "LHR", "RHR"].includes(model.handing.toUpperCase()) && new RegExp(`\\b${model.handing}\\b`, "i").test(row.evidence) ? model.handing.toUpperCase() : "",
      confidence: model ? Math.min(model.confidence, 0.95) : row.confidence };
  });
}

/** Locate printed known marks; the model must still verify the label is a door tag. */
export function openingTagCrops(page: PageIndex, marks: string[], size = 800) {
  const known = new Set(marks.map(mark => mark.trim().toUpperCase()));
  return page.boxes.filter(box => known.has(box.text.trim().toUpperCase())).map((box, index) => {
    const width = Math.min(size, page.width * 2), height = Math.min(size, page.height * 2);
    return { id: `${page.page}:tag:${index}`, mark: box.text.trim(), centerX: (box.x + box.width / 2) * 2, centerY: (box.y + box.height / 2) * 2,
      x: Math.max(0, Math.min(page.width * 2 - width, (box.x + box.width / 2) * 2 - width / 2)),
      y: Math.max(0, Math.min(page.height * 2 - height, (box.y + box.height / 2) * 2 - height / 2)),
      width, height, pageWidth: page.width * 2, pageHeight: page.height * 2 };
  });
}

export function canonicalBuilding(label: string, knownBuildings: string[]) {
  const normalized = label.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const matches = [...new Set(knownBuildings.filter(Boolean))].filter(building => {
    const words = building.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
    return (` ${normalized} `).includes(` ${words} `);
  });
  return matches.length === 1 ? matches[0] : label;
}

/** A model cannot turn an explicitly named MEP sheet into an architectural plan. */
export function confirmedPageKinds(kinds: PageKind[], evidence: string): PageKind[] {
  const servicesPlan = /\b(?:SANITARY|STORM|WATER|GAS|POWER|LIGHTING|HVAC|PLUMBING|MECHANICAL|ELECTRICAL)(?:[\s/&,-]+[A-Z]+){0,4}\s+PLAN\b/i.test(evidence);
  return kinds.filter(kind => kind !== "plan" || !servicesPlan);
}

/** Group nearby targets so one bounded image can answer several doors. */
export function groupedOpeningCrops(page: PageIndex, marks: string[]) {
  const groups: Array<ReturnType<typeof openingTagCrops>[number] & { marks: string[] }> = [];
  for (const tag of openingTagCrops(page, marks, 1000)) {
    const centerX = tag.centerX, centerY = tag.centerY;
    const group = groups.find(crop => crop.marks.length < 4 && centerX >= crop.x + 120 && centerX <= crop.x + crop.width - 120
      && centerY >= crop.y + 120 && centerY <= crop.y + crop.height - 120);
    if (group) { if (!group.marks.includes(tag.mark)) group.marks.push(tag.mark); }
    else groups.push({ ...tag, marks: [tag.mark] });
  }
  return groups;
}

/** Preserve referenced type codes even when their separate diagram is unavailable. */
export function referencedDoorTypes(openings: Array<Opening & {sourceBuilding?: string}>, definitions: Array<{code:string;sourceBuilding?:string}>) {
  const rawCode = (code:string, building:string) => building && code.startsWith(`${building} / `) ? code.slice(building.length + 3) : code;
  const groups = new Map<string, Array<Opening & {sourceBuilding?:string}>>();
  for (const opening of openings) {
    const building=opening.sourceBuilding || '', code=rawCode(opening.doorType,building);
    if (!code) continue;
    if (definitions.some(type => (type.sourceBuilding || '') === building && rawCode(type.code,building) === code)) continue;
    const key=`${building}\u0000${code}`;
    groups.set(key,[...(groups.get(key)||[]),opening]);
  }
  return [...groups.values()].map(rows => {
    const first=rows[0], building=first.sourceBuilding || '';
    const widths=new Set(rows.map(row=>row.width)), heights=new Set(rows.map(row=>row.height));
    return {code:rawCode(first.doorType,building),description:'Type referenced in the door schedule; verify the type diagram.',
      material:first.doorMaterial || first.evidence.match(/\b(?:INSULATED HOLLOW METAL|HOLLOW METAL|SOLID CORE WOOD|ALUMINUM STOREFRONT|ALUMINUM|INSULATED STEEL)\b/i)?.[0] || '',
      manufacturer:'',windowOrLouver:'',fireRating:'',width:widths.size===1?first.width:'',height:heights.size===1?first.height:'',
      sourcePage:first.sourcePage,evidence:first.evidence,confidence:0.75,sourceBuilding:building,sourcePlaceholder:true};
  });
}

/** A repeated opening-table row is not evidence of a separate type definition. */
export function isOpeningRowTypeEvidence(definition: {code:string;evidence:string;sourcePage:number}, openings: Opening[]) {
  const compact = (value:string) => value.toUpperCase().replace(/[\s–—-]+/g, "");
  const evidence = compact(definition.evidence);
  return openings.some(row => row.doorTypeInventoried && row.sourcePage === definition.sourcePage
    && row.doorType && row.width && row.height && row.frameMaterial && row.frameFinish
    && compact(definition.code) === compact(row.mark)
    && evidence.startsWith(compact(`${row.mark}${row.width}${row.height}`))
    && evidence.includes(compact(`${row.frameMaterial}${row.frameFinish}${row.doorThickness || ""}${row.doorType}`)));
}
