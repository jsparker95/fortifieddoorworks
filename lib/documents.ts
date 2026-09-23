import { PDFDocument, StandardFonts, rgb, PDFFont } from "pdf-lib";
import { derive, str, same } from "./production";
import { Project, stages } from "./types";
const clean = (s: unknown) =>
  str(s)
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7E\n]/g, "?");
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of clean(text).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if (
        font.widthOfTextAtSize((line ? line + " " : "") + word, size) <= width
      ) {
        line += (line ? " " : "") + word;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
export async function makeDocument(
  project: Project,
  type: string,
  opts: {
    labelWidth?: number;
    labelHeight?: number;
    labelKind?: string;
    selected?: string[];
    contractor?: string;
    selectedTakeoffOnly?: boolean;
  } = {},
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const d = derive(project.data);
  if (type === "labels") {
    const w = (opts.labelWidth || 4) * 72,
      h = (opts.labelHeight || 2) * 72;
    const selected = opts.selected;
    const items =
      opts.labelKind === "Hardware"
        ? d.frames
        : opts.labelKind === "Frames"
          ? d.frames
          : d.doors;
    for (const item of items.filter(
      (x) => !selected || selected.includes(x.id),
    )) {
      let details: string[];
      if (opts.labelKind === "Hardware") {
        details = d.hardware
          .filter((x) => same(x.group, item.group))
          .map((x) => `${x.qty} x ${x.selectedBrand} ${x.selectedComponent}`);
      } else
        details = [str(item.partName), `Hardware group: ${str(item.group)}`];
      const title = clean(`${opts.labelKind || "Doors"} | ${str(item.name)}`);
      const titleLines = wrap(title, bold, 12, w - 24);
      const contentTop = h - 25 - titleLines.length * 15;
      if (contentTop < 26)
        throw new Error(
          "This label is too small for the opening mark. Increase the label dimensions.",
        );
      let size = 10;
      let lines: string[] = [];
      while (size >= 7) {
        lines = [
          ...wrap(project.name, font, size, w - 24),
          ...details.flatMap((t) => wrap(t, font, size, w - 24)),
        ];
        if (lines.length * (size + 3) <= contentTop - 12 || size === 7) break;
        size -= 0.5;
      }
      const cap = Math.max(1, Math.floor((contentTop - 12) / (size + 3)));
      const chunks = [];
      for (let i = 0; i < lines.length; i += cap)
        chunks.push(lines.slice(i, i + cap));
      for (const [i, chunk] of chunks.entries()) {
        const p = pdf.addPage([w, h]);
        titleLines.forEach((l, n) =>
          p.drawText(l, { x: 12, y: h - 20 - n * 15, size: 12, font: bold }),
        );
        if (chunks.length > 1)
          p.drawText(`${i + 1}/${chunks.length}`, {
            x: w - 25,
            y: 5,
            size: 6,
            font,
          });
        chunk.forEach((l, n) =>
          p.drawText(l, { x: 12, y: contentTop - n * (size + 3), size, font }),
        );
      }
    }
    if (!pdf.getPageCount())
      throw new Error("No openings selected for labels.");
  } else {
    let page = pdf.addPage([612, 792]),
      y = 740;
    const addPage = () => {
      page = pdf.addPage([612, 792]);
      y = 740;
    };
    const write = (text: string, size = 10, heading = false) => {
      const lines = wrap(text, heading ? bold : font, size, 516);
      if (heading && y < 100) addPage();
      for (const line of lines) {
        if (y < 55) addPage();
        page.drawText(line, {
          x: 48,
          y,
          size,
          font: heading ? bold : font,
          color: rgb(0.12, 0.16, 0.2),
        });
        y -= size + 5;
      }
      y -= 4;
    };
    write("FORTIFIED DOORWORKS", 12, true);
    write(type, 23, true);
    write(project.name, 15, true);
    write(
      `Jobsite: ${project.jobsite || "-"} | Contractor: ${opts.contractor || "-"}`,
    );
    write(
      `PM: ${project.pm || "-"} | Start date: ${project.start_date || "-"} | Status: ${project.status}`,
    );
    write(`Generated ${new Date().toISOString().slice(0, 10)}`);
    if (type === "Submittal") {
      write("Project scope", 14, true);
      write(project.scope || "Not entered");
      if (project.cuts) write("Cuts: " + project.cuts);
      write("Document references", 14, true);
      project.data.references.forEach((r) =>
        write(`${r.name} | Page: ${r.page || "-"} | ${r.selection || ""}`),
      );
      write("Door schedule", 14, true);
      project.data.doorTypes.forEach((t) =>
        write(
          `${t.name}: ${t.brand} | ${t.material} | ${t.window || "No window"} | ${t.fire || "No rating entered"} | ${t.pr || ""}`,
        ),
      );
    }
    if (type === "Takeoff" || type === "Submittal") {
      write("Frame takeoff", 14, true);
      d.frameTakeoff
        .filter(
          (r) =>
            !opts.selectedTakeoffOnly ||
            project.data.takeoffSelection?.[
              JSON.stringify(["Frames", "", r.name])
            ],
        )
        .forEach((r) => write(`${r.count} x ${r.name}`));
      write("Door takeoff", 14, true);
      d.doorTakeoff
        .filter(
          (r) =>
            !opts.selectedTakeoffOnly ||
            project.data.takeoffSelection?.[
              JSON.stringify(["Doors", "", r.name])
            ],
        )
        .forEach((r) => write(`${r.count} x ${r.name}`));
      write("Hardware takeoff", 14, true);
      d.hardwareTakeoff
        .filter(
          (r) =>
            !opts.selectedTakeoffOnly ||
            project.data.takeoffSelection?.[
              JSON.stringify(["Hardware", r.brand, r.name])
            ],
        )
        .forEach((r) => write(`${r.count} x ${r.brand} | ${r.name}`));
    }
    if (type === "Build sheet") {
      for (const o of d.frames) {
        write(`${o.name} | ${o.partName}`, 12, true);
        write(
          stages
            .map(
              (s) => `${s}: ${project.data.milestones[o.id]?.[s] || "Pending"}`,
            )
            .join("  /  "),
        );
      }
    }
    if (type === "Opening schedule")
      for (const o of d.doors)
        write(
          `${o.name} | ${o.width} x ${o.height} | ${o.handing} | ${o.partName} | Hardware: ${o.group}`,
        );
    for (const [i, p] of pdf.getPages().entries())
      p.drawText(`Fortified Doorworks  |  ${i + 1} / ${pdf.getPageCount()}`, {
        x: 48,
        y: 28,
        size: 9,
        font,
        color: rgb(0.4, 0.45, 0.5),
      });
  }
  pdf.setTitle(`${project.name} - ${type}`);
  pdf.setAuthor("Fortified Doorworks");
  return pdf.save();
}
export async function downloadDocument(
  project: Project,
  type: string,
  opts: Parameters<typeof makeDocument>[2],
) {
  const bytes = await makeDocument(project, type, opts);
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name.replace(/[^a-z0-9-]/gi, "_")}-${type}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
