import { PDFDocument, PDFFont, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix } from "pdf-lib";
import { activePhase } from "./phases";
import { str } from "./production";
import { submittalOpenings } from "./submittal";
import type { Project } from "./types";

type Text = { text: string; x: number; y: number; size: number; bold?: boolean; red?: boolean; scaleX?: number };
export type SubmittalPage = { kind: "cover" | "openings" | "divider"; text: Text[]; rule?: boolean };
type Fonts = { regular: PDFFont; bold: PDFFont };
const printable = (value: string) => value
  .replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7E\n]/g, "?");

function lines(text: string, font: PDFFont, size: number, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of printable(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
      if (line) { result.push(line); line = ""; }
      for (const character of word) {
        if (font.widthOfTextAtSize(line + character, size) > width) { result.push(line); line = ""; }
        line += character;
      }
    }
    result.push(line);
  }
  return result;
}

/** Letterhead cover, plain opening lists, then the sample's intentionally blank separator. */
export function submittalLayout(project: Project, fonts: Fonts, contractor = "", generatedAt = new Date()): SubmittalPage[] {
  const pages: SubmittalPage[] = [];
  let page: SubmittalPage;
  let y = 720;
  const addPage = (kind: SubmittalPage["kind"]) => {
    page = { kind, text: [] }; pages.push(page); y = 720;
  };
  const place = (text: string, x: number, baseline: number, size: number, bold = false, red = false) => {
    page.text.push({ text: printable(text), x, y: baseline, size, bold, red });
  };
  const write = (text: string, size = 10, bold = false, x = 72, width = 468) => {
    for (const line of lines(text, bold ? fonts.bold : fonts.regular, size, width)) {
      if (y < 60) addPage(page.kind);
      place(line, x, y, size, bold); y -= size + 4;
    }
  };
  const section = (title: string) => {
    if (y < 110) addPage(page.kind);
    write(title, 11, true); y -= 14;
  };
  const phase = activePhase(project.data);
  addPage("cover"); page!.rule = true;
  place("Fortified Doorworks, LLC.", 72, 670, 36);
  page!.text[0].scaleX = 0.8;
  ["728 West 1940 South", "Bldg 21 Ste #104", "Logan, UT 84321", "(435) 770-3806", "brian@fortifieddoor.com", "billing@fortifieddoor.com"]
    .forEach((text, index) => place(text, 72, 607 - index * 13, 9));
  place(`Submittal: ${generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, 72, 505, 9, false, true);
  y = 461;
  write(`Submittal: ${project.name}`, 11, true); y -= 4;
  write(`Phase: ${phase.name}`, 10);
  y -= 18;
  write(`General Contractor: ${contractor || "Not assigned"}`, 11, true);
  const metadata = [project.jobsite && `Jobsite: ${project.jobsite}`, project.pm && `Project manager: ${project.pm}`,
    project.start_date && `Start date: ${project.start_date}`, `Status: ${project.status}`].filter(Boolean) as string[];
  metadata.forEach((text) => write(text, 9)); y -= 18;
  section("General Notes:");
  const notes = [project.scope, project.cuts].flatMap((note) => note.split(/\n+/)).filter((note) => note.trim());
  if (!notes.length) write("No general notes entered.");
  notes.forEach((note, index) => { write(`${index + 1}.  ${note}`, 10, false, 90, 450); y -= 8; });
  if (phase.data.references.length || phase.data.links.length) {
    y -= 16; section("Document References:");
    phase.data.references.forEach((reference) => write([reference.name, reference.page && `Page: ${reference.page}`, reference.selection].filter(Boolean).join(" | ")));
    phase.data.links.forEach((link) => write(str(link)));
  }
  if (phase.data.doorTypes.some((door) => door.reviewState !== "ai-draft")) {
    y -= 16; section("Door Schedule:");
    phase.data.doorTypes.filter((door) => door.reviewState !== "ai-draft").forEach((door) =>
      write(`${str(door.name)}: ${[door.brand, door.material, door.window, door.fire, door.pr].map(str).filter(Boolean).join(" | ")}`));
  }
  const openings = submittalOpenings({ ...project.data, ...phase.data });
  if (openings.length) addPage("openings");
  for (const opening of openings) {
    const itemLines = opening.items.flatMap((item) => lines(item, fonts.regular, 10, 468));
    const headingLines = lines(`${opening.name}:`, fonts.bold, 11, 468);
    const height = headingLines.length * 15 + itemLines.length * 14 + 22;
    // Keep ordinary opening blocks together; exceptionally long blocks continue on another page.
    if (y < 720 && height > y - 60) addPage("openings");
    write(`${opening.name}:`, 11, true);
    for (const item of itemLines) {
      if (y < 60) {
        addPage("openings"); write(`${opening.name} (continued):`, 11, true);
      }
      place(item, 72, y, 10); y -= 14;
    }
    y -= 22;
  }
  addPage("divider");
  const separator = "This page intentionally left blank";
  place(separator, (612 - fonts.bold.widthOfTextAtSize(separator, 11)) / 2, 715, 11, true);
  return pages;
}

export function drawSubmittal(pdf: PDFDocument, project: Project, fonts: Fonts, contractor?: string) {
  for (const layout of submittalLayout(project, fonts, contractor)) {
    const page = pdf.addPage([612, 792]);
    if (layout.rule) page.drawLine({ start: { x: 72, y: 650 }, end: { x: 540, y: 650 }, thickness: 3, color: rgb(0.25, 0.25, 0.25) });
    for (const text of layout.text) {
      const scale = text.scaleX || 1;
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(scale, 0, 0, 1, 0, 0));
      page.drawText(text.text, {
        x: text.x / scale, y: text.y, size: text.size, font: text.bold ? fonts.bold : fonts.regular,
        color: text.red ? rgb(0.7, 0.08, 0.12) : rgb(0.12, 0.12, 0.12),
      });
      page.pushOperators(popGraphicsState());
    }
  }
}
