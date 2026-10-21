import type { z } from "zod";
import { extractionSchema } from "./extraction-schema";

type Opening = z.infer<typeof extractionSchema>["openings"][number];
type Hardware = z.infer<typeof extractionSchema>["hardwareGroups"][number];
type CitedOpening = Opening & { autoImportEligible?: boolean };
type PrintedRow = { mark: string; width: string; height: string; doorType: string; hardwareGroup: string; sourcePage: number; evidence: string; handingUnspecified: boolean };

const openingSize = /\b([A-Z]?\d{1,5}[A-Z]?)\s+(\d+'\s*-\s*\d+(?:\s+\d+\/\d+)?")\s*[X×]\s*(\d+'\s*-\s*\d+(?:\s+\d+\/\d+)?")/gi;

export function printedDoorScheduleRows(pages: Array<{ page: number; text: string }>): PrintedRow[] {
  const rows: PrintedRow[] = [];
  for (const page of pages) {
    const start = page.text.search(/\bDOOR\s+(?:AND\s+FRAME\s+)?SCHEDULE\b/i);
    if (start < 0) continue;
    const schedule = page.text.slice(start, start + 15000);
    const headerEnd = schedule.search(/\bFIRE\s+RATING\b/i);
    const afterHeader = headerEnd >= 0 ? schedule.slice(headerEnd + "FIRE RATING".length) : schedule;
    const footer = afterHeader.search(/\bHEAD\s+WIDTH\b|\bGENERAL\s+NOTES\b|\bDOOR\s+TYPES\b/i);
    const body = footer >= 0 ? afterHeader.slice(0, footer) : afterHeader;
    const matches = [...body.matchAll(openingSize)].slice(0, 200);
    for (let index = 0; index < matches.length; index++) {
      const match = matches[index];
      const mark = match[1].toUpperCase();
      const rowText = body.slice(match.index, matches[index + 1]?.index ?? Math.min(body.length, match.index + 350));
      const doorType = rowText.slice(match[0].length).match(/(?:\s+X\s+[^ ]+)?\s+([A-Z])\s+(?:REFER\s+TO\s+FLOOR\s+PLAN|SECTIONAL|SWING|SLIDING|ALUMINUM|HOLLOW|SOLID|INSULATED)/i)?.[1] || "";
      rows.push({ mark, width: match[2].replace(/\s+/g, ""), height: match[3].replace(/\s+/g, ""), doorType,
        hardwareGroup: "", sourcePage: page.page, evidence: `Printed door schedule row ${mark}: ${rowText.slice(0, 180).trim()}`,
        handingUnspecified: /REFER\s+TO\s+FLOOR\s+PLAN|SECTIONAL\s+OVERHEAD/i.test(rowText) });
    }
    const sets = [...page.text.matchAll(/SET\s+NO\.?\s*(\d+[A-Z]?)\s*\(\s*DR\.?\s*([^)]*)\)/gi)];
    for (const set of sets) {
      const group = set[1];
      const marks: string[] = set[2].match(/\b\d+[A-Z]?\b/gi) || [];
      for (const row of rows.filter((row) => row.sourcePage === page.page && marks.includes(row.mark))) row.hardwareGroup = group;
    }
  }
  return rows;
}

export function reconcileOpeningsWithPrintedSchedule(
  modelRows: Opening[], pages: Array<{ page: number; text: string }>,
) {
  const printed = printedDoorScheduleRows(pages);
  if (printed.length < 2) return { openings: modelRows as CitedOpening[], uncertainties: [] as string[] };
  const used = new Set<number>();
  const openings: CitedOpening[] = printed.map((row) => {
    const index = modelRows.findIndex((candidate, i) => !used.has(i) && candidate.sourcePage === row.sourcePage && candidate.mark.trim().toUpperCase() === row.mark);
    if (index >= 0) used.add(index);
    const model = index >= 0 ? modelRows[index] : null;
    return {
      mark: row.mark, room: model?.room || "", width: row.width, height: row.height,
      handing: row.handingUnspecified ? "" : model?.handing || "", doorType: row.doorType || model?.doorType || "",
      frameType: model?.frameType || "", wallType: model?.wallType || "",
      hardwareGroup: row.hardwareGroup || model?.hardwareGroup || "",
      fireRating: model?.fireRating || "", quantity: "1", sourcePage: row.sourcePage,
      evidence: row.evidence, confidence: model ? Math.min(model.confidence, 0.95) : 0.75,
    };
  });
  const unverified = modelRows.flatMap((row, index) => used.has(index) ? [] : [{ ...row, autoImportEligible: false }]);
  const uncertainties = unverified.length
    ? [`${unverified.length} AI door row(s) did not match a printed door schedule mark and require manual review.`] : [];
  return { openings: [...openings, ...unverified], uncertainties };
}

/** Prefer literal searchable schedule text to model-generated part numbers. */
export function printedHardwareScheduleRows(pages: Array<{ page: number; text: string }>): Hardware[] {
  const rows: Hardware[] = [];
  for (const page of pages) {
    const heading = page.text.search(/\bDOOR\s+HARDWARE\s+SCHEDULE\b/i);
    if (heading < 0) continue;
    const end = page.text.slice(heading + 1).search(/\bDOOR\s+TYPES\b|\bDOOR\s+SCHEDULE\b/i);
    const section = page.text.slice(heading, end < 0 ? undefined : heading + 1 + end);
    const sets = [...section.matchAll(/SET\s+NO\.?\s*(\d+[A-Z]?)\s*\(\s*DR\.?\s*([^)]*)\)/gi)];
    if (sets.length < 2) continue;
    for (let index = 0; index < sets.length; index++) {
      const set = sets[index];
      const group = set[1];
      const body = section.slice(set.index + set[0].length, sets[index + 1]?.index ?? section.length);
      const items = [...body.matchAll(/\b(\d{1,2})\s+([A-Z][A-Z /-]{2,48}):\s*/g)];
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const item = items[itemIndex];
        const raw = body.slice(item.index + item[0].length, items[itemIndex + 1]?.index ?? body.length).trim();
        const leader = raw.match(/\.{3,}\s*([A-Z][A-Z ]{1,30})(?=\s|$)/);
        const brand = leader?.[1]?.trim() || "";
        const specification = (leader ? raw.slice(0, leader.index).trim() : raw).replace(/\.{3,}.*$/, "").trim();
        if (!specification || specification.length > 500) continue;
        const component = `${item[2].trim()}: ${specification}`;
        rows.push({ group, name: `Hardware set ${group}`, brand, component,
          quantity: Number(item[1]), frameModification: "", doorModification: "", doorPrep: "",
          sourcePage: page.page, evidence: `Printed hardware set ${group}: ${item[1]} ${component}${brand ? ` · ${brand}` : ""}`,
          confidence: 0.95 });
      }
      if (!items.length && /REQUIRED\s+HARDWARE\s+FURNISHED\s+WITH\s+OVERHEAD\s+DOOR\s+SYSTEM/i.test(body)) {
        rows.push({ group, name: `Hardware set ${group}`, brand: "", component: "Hardware furnished with overhead door system; components unspecified", quantity: 0,
          frameModification: "", doorModification: "", doorPrep: "", sourcePage: page.page,
          evidence: `Printed hardware set ${group}: required hardware furnished with overhead door system`, confidence: 0.95 });
      }
    }
  }
  return rows;
}

export function reconcileHardwareWithPrintedSchedule(modelRows: Hardware[], pages: Array<{ page: number; text: string }>) {
  const printed = printedHardwareScheduleRows(pages);
  if (printed.length < 2) return { hardwareGroups: modelRows, uncertainties: [] as string[] };
  return { hardwareGroups: printed,
    uncertainties: [`Hardware set components were copied from searchable printed schedule text; AI part-number guesses were excluded.`] };
}
