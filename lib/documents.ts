import { PDFDocument, StandardFonts, rgb, PDFFont } from "pdf-lib";
import { derive, str, same } from "./production";
import { activePhase } from "./phases";
import { Project, stages } from "./types";
import QRCode from "qrcode";
import { productionLabels } from "./labels";
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
  const phase = activePhase(project.data);
  if (type === "labels") {
    const w = (opts.labelWidth || 4) * 72,
      h = (opts.labelHeight || 2) * 72;
    const selected = opts.selected;
    const legacyKind = opts.labelKind === "Frames" || opts.labelKind === "Doors" || opts.labelKind === "Hardware"
      ? opts.labelKind
      : null;
    const legacyLabels = legacyKind ? productionLabels(phase.data, legacyKind, selected) : [];
    const items =
      opts.labelKind === "Anchors"
        ? [{ id: "anchor-package", name: "Anchor package" }]
        : legacyKind
        ? legacyLabels.map((label) => label.item)
        : opts.labelKind === "Frames"
          ? d.frames
          : d.doors;
    for (const item of items.filter(
      (x) => opts.labelKind === "Anchors" || legacyKind || !selected || selected.includes(x.id),
    )) {
      let details: string[];
      const legacyLabel = legacyLabels.find((label) => label.item.id === item.id);
      if (legacyLabel) {
        details = [
          project.name,
          `Contractor: ${opts.contractor || "-"}`,
          `Phase: ${phase.name}`,
          ...legacyLabel.lines.map((line) => line.text),
        ];
      } else if (opts.labelKind === "Anchors") {
        details = [
          `Contractor: ${opts.contractor || "-"}`,
          `Jobsite: ${project.jobsite || "-"}`,
          ...d.anchorTakeoff.map((anchor) => `${anchor.count} x ${anchor.size} ${anchor.name}`),
        ];
      } else if (opts.labelKind === "Frames") {
        details = [
          `Contractor: ${opts.contractor || "-"}`,
          `Jobsite: ${project.jobsite || "-"}`,
          `${str(item.width)} x ${str(item.height)} | Jamb: ${str(item.depth) || "-"}`,
          `Handing: ${str(item.handing) || "Non-handed"}`,
          same(item.brand, "NA") ? "Frame provided by others" : `Frame manufacturer: ${str(item.brand) || "Not specified"}`,
          `Frame: ${str(item.frameType) || "-"}`,
          `Anchor: ${str(item.anchor) || (/\bkd\b|knockdown/i.test(str(item.frameType)) ? "Short lag" : "Wood stud anchor")} · ${str(item.anchorQty) || (Number.parseInt(str(item.height).match(/^\s*(\d+)/)?.[1] || "7", 10) >= 8 ? "8" : "6")}`,
          `Accessories: ${str(item.accessories) || "None"}`,
        ];
      } else {
        details = [
          `Contractor: ${opts.contractor || "-"}`,
          `Jobsite: ${project.jobsite || "-"}`,
          `${str(item.width)} x ${str(item.height)} | ${str(item.handing) || "Non-handed"}`,
          same(item.brand, "NA") ? "Door provided by others" : `${str(item.material) || "Door"} | ${str(item.brand) || "Brand TBD"}`,
          `Window / louver: ${str(item.window) || "None"}`,
          `Fire rating: ${str(item.fire) || "Not specified"}`,
          `Hardware group: ${str(item.group) || "-"}`,
          `Prep: ${str(item.prep) || "-"}`,
        ];
      }
      const qrSide = Math.min(54, h - 18, w * 0.32);
      const textWidth = Math.max(72, w - qrSide - 26);
      const title = clean(`${opts.labelKind || "Doors"} | ${str(item.name)}`);
      const titleLines = wrap(title, bold, 12, textWidth);
      const contentTop = h - 25 - titleLines.length * 15;
      if (contentTop < 26)
        throw new Error(
          "This label is too small for the opening mark. Increase the label dimensions.",
        );
      let size = 10;
      let lines: string[] = [];
      while (size >= 7) {
        lines = legacyKind
          ? details.flatMap((t) => wrap(t, font, size, textWidth))
          : opts.labelKind === "Hardware"
          ? details.flatMap((t) => wrap(t, font, size, textWidth))
          : [
              ...wrap(project.name, font, size, textWidth),
              ...wrap(`Phase: ${phase.name}`, font, size, textWidth),
              ...details.flatMap((t) => wrap(t, font, size, textWidth)),
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
        if (legacyKind) {
          const originalLines = legacyLabel?.lines || [];
          chunk.forEach((line, n) => {
            const source = originalLines.find((entry) => clean(entry.text) === line && entry.color);
            if (!source?.color) return;
            const hex = source.color.slice(1);
            const color = rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
            p.drawRectangle({ x: 8, y: contentTop - n * (size + 3) - 2, width: Math.min(textWidth, font.widthOfTextAtSize(line, size) + 8), height: size + 3, color, opacity: 0.8 });
            p.drawText(line, { x: 12, y: contentTop - n * (size + 3), size, font });
          });
        }
        const appUrl =
          typeof window === "undefined" ? "https://fortifieddoorworks.app" : window.location.origin;
        const scanUrl = new URL(appUrl);
        scanUrl.searchParams.set("project", project.id);
        scanUrl.searchParams.set("phase", phase.id);
        scanUrl.searchParams.set("item", item.id);
        scanUrl.searchParams.set("kind", opts.labelKind || "Doors");
        const dataUrl = await QRCode.toDataURL(scanUrl.toString(), {
          width: 180,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        const qrBytes = Uint8Array.from(
          atob(dataUrl.split(",")[1]),
          (character) => character.charCodeAt(0),
        );
        const qr = await pdf.embedPng(qrBytes);
        const actualQrSide = Math.min(qrSide, h - 16);
        p.drawImage(qr, {
          x: w - actualQrSide - 8,
          y: (h - actualQrSide) / 2,
          width: actualQrSide,
          height: actualQrSide,
        });
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
      const doorsById = new Map(d.doors.map((door) => [door.id, door]));
      for (const frame of d.frames) {
        const door = doorsById.get(frame.id);
        write(`${str(frame.name)}:`, 12, true);
        if (same(frame.brand, "NA")) write("Frame provided by others");
        else write(`1ea. ${str(frame.brand) || "Frame manufacturer TBD"} ${feetInches(frame.width)} x ${feetInches(frame.height)} x ${jambInches(frame.depth)}\" HM Frame${frame.fire ? ` (${str(frame.fire)}H)` : ""}`);
        if (!door || same(door.brand, "NA")) write("Door provided by others");
        else write(`1ea. ${str(door.brand)} ${feetInches(door.width)} x ${feetInches(door.height)} ${str(door.material)}${door.fire ? ` (${str(door.fire)}H)` : ""}`);
        d.hardware.filter((hardware) => same(hardware.group, frame.group)).forEach((hardware) =>
          write(`${str(hardware.qty) || "1"}ea. ${str(hardware.selectedBrand)} ${str(hardware.selectedComponent)}`),
        );
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
  a.download = `${project.name.replace(/[^a-z0-9-]/gi, "_")}-${type}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
