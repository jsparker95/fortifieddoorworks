import type { z } from "zod";
import type { extractionSchema } from "./extraction-schema";
import type { PageIndex, TextBox } from "./indexing";

type Wall = z.infer<typeof extractionSchema>["walls"][number];

/** Keep each legible partition diagram's notes inside its own grid cell. */
export function inventoryWallNotes(page: PageIndex): Wall[] {
  const heading = page.boxes.find(box => /^PARTITION\s+TYPES$/i.test(box.text.trim()));
  if (!heading) return [];
  const anchors = page.boxes.filter(box => /^W\d+$/i.test(box.text.trim()) && box.y > heading.y)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (anchors.length < 2) return [];
  const rows: TextBox[][] = [];
  for (const anchor of anchors) {
    const row = rows.find(row => Math.abs(row[0].y - anchor.y) < anchor.height * 3);
    if (row) row.push(anchor); else rows.push([anchor]);
  }
  if (rows.some(row => row.length < 2)) return []; // Unrecognized layout: retain visual extraction.
  return rows.flatMap((row, rowIndex) => row.sort((a, b) => a.x - b.x).flatMap((anchor, column) => {
    const gap = row[column + 1] ? row[column + 1].x - anchor.x : anchor.x - row[column - 1].x;
    const left = anchor.x - anchor.height;
    const right = (row[column + 1]?.x ?? anchor.x + gap) - anchor.height;
    const top = anchor.y - anchor.height * 5;
    const bottom = (rows[rowIndex + 1]?.[0].y ?? page.height) - anchor.height * 5;
    const cell = page.boxes.filter(box => box.x >= left && box.x < right && box.y >= top && box.y < bottom);
    const na = cell.find(box => /^N\s*\/\s*A$/i.test(box.text.trim()) && Math.abs(box.y - anchor.y) < anchor.height * 3);
    if (na) return [{ code: anchor.text.trim(), description: "N/A", finishedThickness: "", layers: [],
      sourcePage: page.page, evidence: `${anchor.text}: ${na.text}`, confidence: 0.98 }];
    const header = cell.find(box => /^NOTES?\s*:/i.test(box.text.trim()));
    if (!header) return [];
    const boxes = cell.filter(box => box.y > header.y + header.height / 2).sort((a, b) => a.y - b.y || a.x - b.x);
    const lines: TextBox[][] = [];
    for (const box of boxes) {
      const line = lines.find(line => Math.abs(line[0].y - box.y) < box.height / 2);
      if (line) line.push(box); else lines.push([box]);
    }
    const notes: string[] = [];
    let lastY = header.y;
    for (const line of lines) {
      const text = line.sort((a, b) => a.x - b.x).map(box => box.text).join(" ").trim();
      if (line[0].y - lastY > header.height * 3) break;
      if (/^\d+\.\s/.test(text)) notes.push(text);
      else if (notes.length && !/^NOTE\s+\d/i.test(text)) notes[notes.length - 1] += ` ${text}`;
      lastY = line[0].y;
    }
    if (!notes.length) return [];
    const rating = cell.filter(box => box.y < header.y && /RATED WALL|ASSEMBLY|UL#|\b(?:MIN\.|HR\b)/i.test(box.text)).sort((a, b) => a.y - b.y).map(box => box.text).join(" ");
    const description = [rating, ...notes].filter(Boolean).join("\n");
    // Stud/CMU sizes and layer thicknesses are not an explicit finished total.
    const finishedThickness = description.match(/(?:FINISHED|OVERALL|TOTAL)\s+(?:WALL\s+)?THICKNESS\s*[:=]?\s*(\d+(?:\s+\d+\/\d+)?\s*["”])/i)?.[1] || "";
    return [{ code: anchor.text.trim(), description, finishedThickness, layers: notes.map(note => note.replace(/^\d+\.\s*/, "")),
      sourcePage: page.page, evidence: `${anchor.text}\n${description}`, confidence: 0.95 }];
  }));
}

export function reconcileWallNotes(page: PageIndex, generated: Wall[]): Wall[] {
  const printed = inventoryWallNotes(page);
  const codes = new Set(printed.map(row => row.code.toUpperCase()));
  return [...printed, ...generated.filter(row => !codes.has(row.code.trim().toUpperCase()))];
}
