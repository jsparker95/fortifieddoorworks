import { PDFDocument, StandardFonts, rgb, PDFFont, degrees } from "pdf-lib";
import { derive, str } from "./production";
import { activePhase } from "./phases";
import { Project, stages } from "./types";
import QRCode from "qrcode";
import { productionLabels } from "./labels";
import { submittalOpenings } from "./submittal";
const clean = (s: unknown) =>
  str(s)
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7E\n]/g, "?");
const feetInches = (value: unknown) => {
  const parts = str(value).split("/");
  return parts.length === 2 ? `${parts[0]}'-${parts[1]}\"` : str(value);
};
const jambInches = (value: unknown) => {
  const encoded = Number.parseFloat(str(value));
  return Number.isFinite(encoded) && encoded >= 100
    ? (encoded / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
    : str(value);
};
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

const points = (inches: number) => inches * 72;
const labelPdfColor = (hex: string) => {
  const value = hex.replace("#", "");
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  );
};

async function publicPng(path: string) {
  const url = typeof window === "undefined"
    ? `https://fortifieddoorworks.app/${path}`
    : new URL(`/${path}`, window.location.origin).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the ${path} label artwork.`);
  return new Uint8Array(await response.arrayBuffer());
}

function drawTopText(
  page: ReturnType<PDFDocument["addPage"]>,
  pageHeight: number,
  text: string,
  xIn: number,
  topIn: number,
  size: number,
  font: PDFFont,
) {
  if (!text) return;
  page.drawText(clean(text), {
    x: points(xIn),
    y: pageHeight - points(topIn),
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawWrappedTopText(
  page: ReturnType<PDFDocument["addPage"]>,
  pageHeight: number,
  text: string,
  xIn: number,
  topIn: number,
  size: number,
  widthIn: number,
  font: PDFFont,
) {
  wrap(text, font, size, points(widthIn)).forEach((line, index) => {
    drawTopText(page, pageHeight, line, xIn, topIn + index * 0.14, size, font);
  });
}

function drawTopRect(
  page: ReturnType<PDFDocument["addPage"]>,
  pageHeight: number,
  xIn: number,
  topIn: number,
  widthIn: number,
  heightIn: number,
  fill: string,
) {
  page.drawRectangle({
    x: points(xIn),
    y: pageHeight - points(topIn + heightIn),
    width: points(widthIn),
    height: points(heightIn),
    color: labelPdfColor(fill),
  });
}

async function addOpeningQr(
  pdf: PDFDocument,
  page: ReturnType<PDFDocument["addPage"]>,
  pageHeight: number,
  project: Project,
  phaseId: string,
  openingId: string,
  kind: string,
  xIn: number,
  topIn: number,
  sideIn: number,
) {
  const appUrl = typeof window === "undefined"
    ? "https://fortifieddoorworks.app"
    : window.location.origin;
  const scanUrl = new URL(appUrl);
  scanUrl.searchParams.set("project", project.id);
  scanUrl.searchParams.set("phase", phaseId);
  scanUrl.searchParams.set("item", openingId);
  scanUrl.searchParams.set("kind", kind);
  const dataUrl = await QRCode.toDataURL(scanUrl.toString(), {
    width: 180,
    margin: 1,
    errorCorrectionLevel: "H",
  });
  const qrBytes = Uint8Array.from(
    atob(dataUrl.split(",")[1]),
    (character) => character.charCodeAt(0),
  );
  const qr = await pdf.embedPng(qrBytes);
  page.drawImage(qr, {
    x: points(xIn),
    y: pageHeight - points(topIn + sideIn),
    width: points(sideIn),
    height: points(sideIn),
  });
}

async function addPageAt(pdf: PDFDocument, index: number, width: number, height: number) {
  while (pdf.getPageCount() <= index) pdf.addPage([width, height]);
  return pdf.getPages()[index];
}

async function drawLegacyFrameOrDoorLabels(
  pdf: PDFDocument,
  project: Project,
  phaseId: string,
  contractor: string,
  kind: "Frames" | "Doors",
  labels: ReturnType<typeof productionLabels>,
  font: PDFFont,
) {
  const pageWidth = 612;
  const pageHeight = 792;
  const logoHeightIn = kind === "Frames" ? 0.2 : 0.3;
  const logoWidthIn = 7.75728 * logoHeightIn;
  const logo = await pdf.embedPng(await publicPng("production-label-logo.png"));
  for (const [index, label] of labels.entries()) {
    const pageIndex = Math.floor(index / 20);
    const row = index % 10;
    const column = Math.floor((index % 20) / 10);
    const page = await addPageAt(pdf, pageIndex, pageWidth, pageHeight);
    const x = 0.25 + column * 4.1875;
    const top = 0.5625 + row;
    page.drawImage(logo, {
      x: points(x),
      y: pageHeight - points(top + logoHeightIn),
      width: points(logoWidthIn),
      height: points(logoHeightIn),
    });
    if (kind === "Frames") {
      drawTopText(page, pageHeight, label.title, x + logoWidthIn + 0.15, top + logoHeightIn, 18, font);
      drawTopText(page, pageHeight, `${project.name} | ${contractor}`, x, top + logoHeightIn + 0.16, 10, font);
      const fields = [
        { x: x - 0.05, textX: x, top: top + logoHeightIn + 0.27, textTop: top + logoHeightIn + 0.4, line: label.lines[0] },
        { x: x + 0.25, textX: x + 0.3, top: top + logoHeightIn + 0.27, textTop: top + logoHeightIn + 0.4, line: label.lines[1] },
        { x: x + 0.55, textX: x + 0.6, top: top + logoHeightIn + 0.27, textTop: top + logoHeightIn + 0.4, line: label.lines[2] },
        { x: x + 0.95, textX: x + 1, top: top + logoHeightIn + 0.27, textTop: top + logoHeightIn + 0.4, line: label.lines[3] },
      ];
      for (const field of fields) {
        drawTopRect(page, pageHeight, field.x, field.top, 0.3, 0.2, field.line.color || "#FFFFFF");
        drawTopText(page, pageHeight, field.line.text, field.textX, field.textTop, 10, font);
      }
      drawTopText(page, pageHeight, label.lines[4]?.text || "", x, top + logoHeightIn + 0.6, 10, font);
    } else {
      drawTopText(page, pageHeight, label.title, x, top + logoHeightIn + 0.5, 20, font);
      drawTopText(page, pageHeight, `${project.name} | ${contractor}`, x, top + logoHeightIn + 0.16, 10, font);
      const fields = [
        { x: x + 0.95, textX: x + 1, line: label.lines[0] },
        { x: x + 1.25, textX: x + 1.3, line: label.lines[1] },
        { x: x + 1.55, textX: x + 1.6, line: label.lines[2] },
        { x: x + 1.85, textX: x + 1.9, line: label.lines[3] },
        { x: x + 2.15, textX: x + 2.2, line: label.lines[4] },
      ];
      for (const field of fields) {
        drawTopRect(page, pageHeight, field.x, top + logoHeightIn + 0.2, 0.3, 0.2, field.line.color || "#FFFFFF");
        drawTopText(page, pageHeight, field.line.text, field.textX, top + logoHeightIn + 0.36, 10, font);
      }
      drawWrappedTopText(
        page,
        pageHeight,
        label.lines[5]?.text.replace(/^Material /, "") || "",
        x + 1,
        top + logoHeightIn + 0.51,
        10,
        1.45,
        font,
      );
      drawWrappedTopText(
        page,
        pageHeight,
        label.lines[6]?.text.replace(/^Window /, "") || "",
        x + 2.5,
        top + logoHeightIn + 0.51,
        10,
        0.65,
        font,
      );
    }
    await addOpeningQr(
      pdf,
      page,
      pageHeight,
      project,
      phaseId,
      label.item.id,
      kind,
      x + 3.2,
      top + 0.04,
      0.75,
    );
  }
}

async function drawLegacyHardwareLabels(
  pdf: PDFDocument,
  project: Project,
  phaseId: string,
  contractor: string,
  labels: ReturnType<typeof productionLabels>,
  font: PDFFont,
) {
  const pageWidth = 792;
  const pageHeight = 612;
  const slotWidth = 3.34375;
  const slotHeight = 4.1875;
  const logoHeight = 0.8;
  const logoWidth = 1.45 * logoHeight;
  const lineHeight = 0.2;
  const labelLinesPerStockLabel = 14;
  const textWidth = points(slotWidth - 0.1);
  const logo = await pdf.embedPng(await publicPng("production-hardware-logo.png"));
  let labelIndex = 0;

  for (const label of labels) {
    const itemLines = label.lines.flatMap((line) => wrap(line.text, font, 10, textWidth));
    const chunks: string[][] = [];
    if (!itemLines.length) chunks.push([]);
    for (let start = 0; start < itemLines.length; start += labelLinesPerStockLabel) {
      chunks.push(itemLines.slice(start, start + labelLinesPerStockLabel));
    }
    for (const [continuation, lines] of chunks.entries()) {
      const pageIndex = Math.floor(labelIndex / 6);
      const row = labelIndex % 2;
      const column = Math.floor((labelIndex % 6) / 2);
      const page = await addPageAt(pdf, pageIndex, pageWidth, pageHeight);
      const x = 0.5625 + column * slotWidth;
      const top = 0.25 + row * slotHeight;
      page.drawImage(logo, {
        x: points(x + 0.4),
        y: pageHeight - points(top + logoHeight),
        width: points(logoWidth),
        height: points(logoHeight),
      });
      const title = chunks.length > 1
        ? `${label.title} (${continuation + 1}/${chunks.length})`
        : label.title;
      page.drawText(clean(title), {
        x: points(x + 0.2),
        y: pageHeight - points(top + logoHeight),
        size: 18,
        font,
        rotate: degrees(90),
        color: rgb(0, 0, 0),
      });
      drawTopText(page, pageHeight, `${project.name} | ${contractor}`, x, top + logoHeight + 0.2, 10, font);
      page.drawLine({
        start: { x: points(x), y: pageHeight - points(top + logoHeight + 0.25) },
        end: { x: points(x + slotWidth - 0.1), y: pageHeight - points(top + logoHeight + 0.25) },
        thickness: points(0.02),
        color: rgb(0, 0, 0),
      });
      lines.forEach((line, lineIndex) =>
        drawTopText(page, pageHeight, line, x, top + 1.25 + lineIndex * lineHeight, 10, font),
      );
      await addOpeningQr(
        pdf,
        page,
        pageHeight,
        project,
        phaseId,
        label.item.id,
        "Hardware",
        x + logoWidth + 0.85,
        top,
        0.8,
      );
      labelIndex++;
    }
  }
}
export async function makeDocument(
  project: Project,
  type: string,
  opts: {
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
  const phase = activePhase(project.data);
  if (type === "labels") {
    const labelKind = opts.labelKind || "Doors";
    const contractor = opts.contractor || "";
    if (labelKind === "Frames" || labelKind === "Doors") {
      const labels = productionLabels(phase.data, labelKind, opts.selected);
      if (!labels.length) throw new Error("No openings selected for labels.");
      await drawLegacyFrameOrDoorLabels(
        pdf,
        project,
        phase.id,
        contractor,
        labelKind,
        labels,
        font,
      );
    } else if (labelKind === "Hardware") {
      const labels = productionLabels(phase.data, "Hardware", opts.selected);
      if (!labels.length) throw new Error("No openings selected for labels.");
      await drawLegacyHardwareLabels(pdf, project, phase.id, contractor, labels, font);
    } else {
      const w = points(4);
      const h = points(2);
      const p = pdf.addPage([w, h]);
      const details = [
        project.name,
        `Contractor: ${contractor || "-"}`,
        `Phase: ${phase.name}`,
        `Jobsite: ${project.jobsite || "-"}`,
        ...d.anchorTakeoff.map((anchor) => `${anchor.count} x ${anchor.size} ${anchor.name}`),
      ];
      const labelWidth = points(4);
      const contentWidth = labelWidth - 70;
      const lines = details.flatMap((line) => wrap(line, font, 10, contentWidth));
      p.drawText("Anchors | Anchor package", { x: 12, y: h - 20, size: 12, font: bold });
      lines.forEach((line, index) => p.drawText(line, { x: 12, y: h - 42 - index * 14, size: 10, font }));
      const scanUrl = new URL(typeof window === "undefined" ? "https://fortifieddoorworks.app" : window.location.origin);
      scanUrl.searchParams.set("project", project.id);
      scanUrl.searchParams.set("phase", phase.id);
      scanUrl.searchParams.set("item", "anchor-package");
      scanUrl.searchParams.set("kind", "Anchors");
      const qrData = await QRCode.toDataURL(scanUrl.toString(), { width: 180, margin: 1, errorCorrectionLevel: "H" });
      const qr = await pdf.embedPng(Uint8Array.from(atob(qrData.split(",")[1]), (character) => character.charCodeAt(0)));
      p.drawImage(qr, { x: w - 66, y: (h - 54) / 2, width: 54, height: 54 });
    }
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
    write(`Phase: ${phase.name}`, 12, true);
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
      write("Doorways", 14, true);
      for (const opening of submittalOpenings(phase.data)) {
        write(`${opening.name}:`, 12, true);
        opening.items.forEach((item) => write(item));
        y -= 6;
      }
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
    if (type === "Elevation drawings") {
      const drawings = phase.data.elevations || [];
      if (!drawings.length) throw new Error("Add at least one sidelight or borrowed-light elevation first.");
      const openingById = new Map(project.data.openings.map((opening) => [opening.id, opening]));
      const wallByName = new Map(project.data.walls.map((wall) => [str(wall.name).toLowerCase(), wall]));
      for (const [index, drawing] of drawings.entries()) {
        if (index) addPage();
        const opening = openingById.get(drawing.openingId);
        if (!opening) continue;
        write(`${opening.name} | ${drawing.kind}`, 17, true);
        write(`Overall: ${drawing.widthIn} x ${drawing.heightIn} in | Wall: ${str(opening.wall) || "-"} | Jamb: ${str(wallByName.get(str(opening.wall).toLowerCase())?.size) || "-"}`);
        write(`Welds: ${drawing.weldCount} | Glass stop: ${drawing.glassStopFeet} linear ft | Chair rail: ${drawing.chairRailIn} in`);
        if (drawing.notes) write(`Production notes: ${drawing.notes}`);
        const scale = Math.min(430 / Math.max(1, drawing.widthIn), 270 / Math.max(1, drawing.heightIn));
        const frameW = drawing.widthIn * scale, frameH = drawing.heightIn * scale;
        const x = 90, baseY = 155;
        page.drawRectangle({ x, y: baseY, width: frameW, height: frameH, borderColor: rgb(0.12, 0.16, 0.2), borderWidth: 5 });
        const mullions = Math.max(0, Math.min(8, Math.floor(drawing.verticalMullions)));
        const rails = Math.max(0, Math.min(8, Math.floor(drawing.horizontalRails)));
        if (drawing.kind === "Door + sidelight") {
          const doorW = Math.min(drawing.widthIn - 1, Math.max(1, drawing.doorWidthIn)) * scale;
          const doorH = Math.min(drawing.heightIn, Math.max(1, drawing.doorHeightIn)) * scale;
          page.drawRectangle({ x, y: baseY, width: doorW, height: doorH, borderColor: rgb(0.16, 0.35, 0.55), borderWidth: 2 });
          page.drawText("DOOR", { x: x + doorW / 2 - 13, y: baseY + doorH / 2, size: 9, font });
          const sideX = x + doorW;
          page.drawRectangle({ x: sideX, y: baseY + 4, width: frameW - doorW, height: frameH - 8, color: rgb(0.91, 0.95, 0.98), borderColor: rgb(0.16, 0.35, 0.55), borderWidth: 2 });
          for (let m = 1; m <= mullions; m++) page.drawLine({ start: { x: sideX + (frameW - doorW) * m / (mullions + 1), y: baseY }, end: { x: sideX + (frameW - doorW) * m / (mullions + 1), y: baseY + frameH }, thickness: 3, color: rgb(0.16, 0.35, 0.55) });
        } else {
          page.drawRectangle({ x: x + 4, y: baseY + 4, width: frameW - 8, height: frameH - 8, color: rgb(0.91, 0.95, 0.98), borderColor: rgb(0.16, 0.35, 0.55), borderWidth: 2 });
          for (let m = 1; m <= mullions; m++) page.drawLine({ start: { x: x + frameW * m / (mullions + 1), y: baseY }, end: { x: x + frameW * m / (mullions + 1), y: baseY + frameH }, thickness: 3, color: rgb(0.16, 0.35, 0.55) });
        }
        for (let rail = 1; rail <= rails; rail++) {
          const ry = baseY + frameH * rail / (rails + 1);
          page.drawLine({ start: { x, y: ry }, end: { x: x + frameW, y: ry }, thickness: 3, color: rgb(0.16, 0.35, 0.55) });
        }
        if (drawing.chairRailIn > 0 && drawing.chairRailIn < drawing.heightIn) {
          const cy = baseY + drawing.chairRailIn * scale;
          page.drawLine({ start: { x, y: cy }, end: { x: x + frameW, y: cy }, thickness: 2, color: rgb(0.55, 0.28, 0.12) });
        }
        page.drawLine({ start: { x, y: baseY + frameH + 18 }, end: { x: x + frameW, y: baseY + frameH + 18 }, thickness: 0.75, color: rgb(0.2, 0.25, 0.3) });
        page.drawText(`${drawing.widthIn} in`, { x: x + frameW / 2 - 20, y: baseY + frameH + 24, size: 9, font });
        page.drawText(`${drawing.heightIn} in`, { x: x - 50, y: baseY + frameH / 2, size: 9, font });
      }
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
    if (type === "Wood door order form") {
      const orders = phase.data.woodDoorOrders || [];
      if (!orders.length) throw new Error("Add at least one wood door order first.");
      for (const order of orders) {
        const opening = project.data.openings.find((item) => item.id === order.openingId);
        if (!opening) continue;
        write(`${opening.name} | Wood door order`, 17, true);
        write(`Project: ${project.name} | Phase: ${phase.name} | Quantity: ${opening.qty || 1}`);
        write(`Opening size: ${feetInches(opening.width)} x ${feetInches(opening.height)} | Handing: ${str(opening.handing) || "TBD"}`);
        write(`Manufacturer: ${order.manufacturer || "TBD"} | Species: ${order.species || "TBD"} | Grade: ${order.grade || "TBD"}`);
        write(`Cut: ${order.cut || "TBD"} | Finish: ${order.finish || "TBD"} | Core: ${order.core || "TBD"}`);
        write(`Thickness: ${order.thickness || "TBD"} | Glazing: ${order.glazing || "None specified"}`);
        if (order.notes) write(`Notes: ${order.notes}`);
        y -= 12;
      }
    }
    if (type === "Door machining specifications") {
      const specs = phase.data.machiningSpecs || [];
      if (!specs.length) throw new Error("Add at least one machining specification first.");
      for (const spec of specs) {
        const opening = project.data.openings.find((item) => item.id === spec.openingId);
        if (!opening) continue;
        write(`${opening.name} | Door machining`, 17, true);
        write(`Project: ${project.name} | Phase: ${phase.name} | Size: ${feetInches(opening.width)} x ${feetInches(opening.height)} | Handing: ${str(opening.handing) || "TBD"}`);
        write(`Hinges: ${spec.hingeCount || "TBD"} | Hinge locations: ${spec.hingeLocations || "Per standard"}`);
        write(`Lock backset: ${spec.lockBackset || "TBD"} | Lock height: ${spec.lockHeight || "TBD"}`);
        write(`Closer preparation: ${spec.closerPrep || "None specified"} | Exit device: ${spec.exitDevicePrep || "None specified"}`);
        write(`Other preparation: ${spec.otherPrep || "None specified"}`);
        if (spec.notes) write(`Notes: ${spec.notes}`);
        y -= 12;
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
  a.download = documentDownloadFilename(project.name, type, opts?.labelKind);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function documentDownloadFilename(
  projectName: string,
  type: string,
  labelKind?: string,
) {
  const safeProjectName = projectName.replace(/[^a-z0-9-]/gi, "_");
  if (type !== "labels") return `${safeProjectName}-${type}.pdf`;
  const safeLabelKind = (labelKind || "Doors").replace(/[^a-z0-9-]/gi, "_");
  return `${safeProjectName}-${safeLabelKind}-labels.pdf`;
}
