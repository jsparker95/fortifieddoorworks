import type { z } from "zod";
import type { extractionSchema } from "./extraction-schema";
import { hardwareSections } from "./indexing";
import { hardwareSetKey } from "./references";

type Hardware = z.infer<typeof extractionSchema>["hardwareGroups"][number];

/** Quantified printed rows are authoritative for part numbers and quantities. */
export function inventoryHardwareRows(text: string, sourcePage: number): Hardware[] {
  return hardwareSections(text).flatMap(section => {
    const heading = section.match(/^SET\s*(?:NO\.?\s*)?[:#]?\s*(\d+(?:\.\d+)?[A-Z-]*)(?=\s|\()/i);
    if (!heading) return [];
    const items = [...section.matchAll(/\b(\d+)\s+(EA|EACH|PR|PAIR|SETS?)\b/gi)];
    const title = section.slice(0, items[0]?.index ?? section.length).trim();
    return items.flatMap((item, index) => {
      const raw = section.slice(item.index! + item[0].length, items[index + 1]?.index ?? section.length).trim();
      if (!raw) return [];
      const noteIndex = raw.search(/\*?\s*BALANCE\s+OF\s+HARDWARE\s+BY\s+OTHERS/i);
      const body = (noteIndex < 0 ? raw : raw.slice(0, noteIndex)).trim();
      const note = noteIndex < 0 ? "" : raw.slice(noteIndex).replace(/^\s*\*/, "").trim();
      // These tables print a reference such as (HI-1) immediately before the
      // manufacturer column. Preserve its literal spelling, including typos.
      const manufacturer = body.match(/\([A-Z][A-Z0-9]*[-.]\d+[A-Z]?\)\s+([^()]+)$/i);
      const brand = manufacturer?.[1].trim() || "";
      const part = brand ? body.slice(0, body.length - brand.length).trim() : body;
      const unit = item[2].toUpperCase();
      return [{ group: heading[1], name: title, brand,
        component: `${unit === "EA" || unit === "EACH" ? "" : `[${unit}] `}${part}${note ? `; ${note}` : ""}`,
        quantity: Number(item[1]), frameModification: "", doorModification: "", doorPrep: "",
        sourcePage, evidence: `${title}\n${item[1]} ${unit} ${raw}`, confidence: 0.95 }];
    });
  });
}

/** Retain model output only for sets without a readable quantified inventory. */
export function reconcileHardwareRows(text: string, sourcePage: number, generated: Hardware[]) {
  const printed = inventoryHardwareRows(text, sourcePage);
  if (!printed.length) return generated;
  const groups = new Set(printed.map(row => hardwareSetKey(row.group)));
  return [...printed, ...generated.filter(row => !groups.has(hardwareSetKey(row.group)))];
}

/** Stable evidence allows a corrected part label to keep the same draft ID. */
export function sameHardwareSourceLine(left: unknown, right: unknown) {
  const key = (value: unknown) => {
    const line = String(value || "").match(/\b\d+\s+(?:EA|EACH|PR|PAIR|SETS?)\b[\s\S]*/i)?.[0];
    return line?.replace(/\*?\s*BALANCE\s+OF\s+HARDWARE\s+BY\s+OTHERS[\s\S]*/i, "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "";
  };
  const a = key(left), b = key(right);
  return a.length >= 12 && a === b;
}
