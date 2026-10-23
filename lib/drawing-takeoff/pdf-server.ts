import { PDFDocument } from "pdf-lib";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import type { PageIndex, TextBox } from "./indexing";

async function openPdf(bytes: Uint8Array) {
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true, disableFontFace: true });
  return { task, pdf: await task.promise };
}

export async function indexPdf(bytes: Uint8Array): Promise<PageIndex[]> {
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-")) throw new Error("The stored file is not a valid PDF. Re-upload the original file.");
  const { task, pdf } = await openPdf(bytes);
  try {
    if (pdf.numPages > 2500) throw new Error("Split documents larger than 2,500 pages before uploading.");
    const pages: PageIndex[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const boxes: TextBox[] = content.items.flatMap(item => {
        if (!("str" in item) || !item.str.trim()) return [];
        const point = view.convertToViewportPoint(item.transform[4], item.transform[5]);
        return [{ text: item.str, x: point[0], y: point[1] - item.height, width: item.width, height: item.height }];
      });
      const lineGroups: TextBox[][] = [];
      for (const box of [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)) {
        const previous = lineGroups.at(-1);
        if (previous && Math.abs(previous[0].y - box.y) < 2) previous.push(box);
        else lineGroups.push([box]);
      }
      pages.push({ page: number, width: view.width, height: view.height, rotation: view.rotation, boxes,
        text: content.items.map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " "),
        lines: lineGroups.map(line => line.sort((a, b) => a.x - b.x).map(box => box.text).join(" ")) });
      page.cleanup();
    }
    return pages;
  } finally { await task.destroy(); }
}

export async function subsetPdf(source: PDFDocument, pages: number[]) {
  const subset = await PDFDocument.create();
  for (const page of await subset.copyPages(source, pages.map(number => number - 1))) subset.addPage(page);
  return subset.save();
}

/** Render only the requested rectangle, keeping even large plan sheets bounded. */
export async function renderCrop(bytes: Uint8Array, crop?: { x: number; y: number; width: number; height: number }) {
  const { task, pdf } = await openPdf(bytes);
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const box = crop || { x: 0, y: 0, width: viewport.width, height: viewport.height };
    const scale = Math.min(1, 1800 / Math.max(box.width, box.height));
    const canvas = createCanvas(Math.ceil(box.width * scale), Math.ceil(box.height * scale));
    const context = canvas.getContext("2d");
    await page.render({ canvas: canvas as never, canvasContext: context as never,
      viewport, transform: [scale, 0, 0, scale, -box.x * scale, -box.y * scale], background: "white" }).promise;
    return canvas.toBuffer("image/png");
  } finally { await task.destroy(); }
}
