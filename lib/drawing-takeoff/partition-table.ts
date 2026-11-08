import type { PageIndex, TextBox } from './indexing';
import type { z } from 'zod';
import type { extractionSchema } from './extraction-schema';

type Wall = z.infer<typeof extractionSchema>['walls'][number];
const centerX = (box: TextBox) => box.x + box.width / 2;
const centerY = (box: TextBox) => box.y + box.height / 2;
const startsAssembly = (text: string) => /^(?:(?:INTERIOR|EXTERIOR|DEMISING)\s+(?:WALL|PARTITION)|(?:\d+X\d+\s+)?INTERIOR\s+KNEE\s+WALL)\b/i.test(text.trim());

/** Literal two-column partition tables. Require the actual heading, aligned
 * TYPE/DESCRIPTION headers, one code and one assembly paragraph per row, and
 * a shared description margin. Ambiguous layouts retain visual extraction. */
export function partitionTableWallNotes(page: PageIndex): Wall[] {
  const headings = page.boxes.filter(box => /^PARTITION\s+SCHEDULE$/i.test(box.text.trim()));
  if (headings.length !== 1) return [];
  const heading = headings[0];
  const headerBand = page.boxes.filter(box => box.y > heading.y && box.y < heading.y + heading.height * 3);
  const pairs = headerBand.filter(box => /^TYPE$/i.test(box.text.trim())).flatMap(type =>
    headerBand.filter(box => /^DESCRIPTION$/i.test(box.text.trim()) && box.x > type.x + type.width
      && Math.abs(centerY(box) - centerY(type)) < Math.max(type.height, box.height) / 2).map(description => ({ type, description })));
  if (pairs.length !== 1) return [];
  const { type, description } = pairs[0];
  const left = centerX(type), tolerance = Math.max(2, type.width * .2);
  const candidates = page.boxes.filter(box => /^[A-Z](?:\d{1,2})?$/.test(box.text.trim())
    && Math.abs(centerX(box) - left) <= tolerance && box.y > type.y + type.height).sort((a, b) => a.y - b.y);
  const anchors: TextBox[] = [];
  for (const box of candidates) {
    const previous = anchors.at(-1);
    if (previous && box.text === previous.text && Math.abs(box.y - previous.y) < .5) continue;
    if (previous && centerY(box) - centerY(previous) > Math.max(box.height, previous.height) * 6) break;
    anchors.push(box);
  }
  if (anchors.length < 2 || new Set(anchors.map(box => box.text)).size !== anchors.length) return [];
  const band = (i: number) => ({
    top: i ? (centerY(anchors[i - 1]) + centerY(anchors[i])) / 2
      : Math.max(type.y + type.height, centerY(anchors[i]) - (centerY(anchors[i + 1]) - centerY(anchors[i])) / 2),
    bottom: i < anchors.length - 1 ? (centerY(anchors[i]) + centerY(anchors[i + 1])) / 2
      : centerY(anchors[i]) + (centerY(anchors[i]) - centerY(anchors[i - 1])) / 2,
  });
  const firstBand = band(0);
  const starts = page.boxes.filter(box => centerY(box) >= firstBand.top && centerY(box) < firstBand.bottom
    && box.x > type.x + type.width && box.x < description.x && startsAssembly(box.text));
  if (starts.length !== 1) return [];
  const margin = starts[0].x;
  const result: Wall[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const { top, bottom } = band(i), anchor = anchors[i];
    const seen = new Set<string>();
    const boxes = page.boxes.filter(box => Math.abs(box.x - margin) < Math.max(1, anchor.height * .15)
      && centerY(box) >= top && centerY(box) < bottom).sort((a, b) => a.y - b.y || a.x - b.x).filter(box => {
        const key = `${box.text}:${box.x.toFixed(1)}:${box.y.toFixed(1)}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
    if (!boxes.length || boxes.filter(box => startsAssembly(box.text)).length !== 1 || !startsAssembly(boxes[0].text)) return [];
    const notes = boxes.map(box => box.text.trim()).join(' ');
    // Stud dimensions, insulation, gypsum layers and ordered frame depth are
    // distinct values. Only an explicitly printed finished total belongs here.
    const finishedThickness = notes.match(/(?:FINISHED|OVERALL|TOTAL)\s+(?:WALL\s+)?THICKNESS\s*[:=]?\s*(\d+(?:\s+\d+\/\d+)?\s*["”])/i)?.[1] || '';
    result.push({ code: anchor.text.trim(), description: notes, layers: [], finishedThickness, sourcePage: page.page,
      evidence: `PARTITION SCHEDULE, PDF page ${page.page}, printed row ${anchor.text.trim()}: ${notes}`, confidence: .99 });
  }
  return result;
}
