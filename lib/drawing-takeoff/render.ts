import type { PDFPageProxy } from "pdfjs-dist";
import { planTiles, validBox, type Box, type Tile } from "./geometry";

/** Browser-side crop rasterization. A caller owns the authenticated PDF and worker lifetime. */
export function planPageTiles(page: PDFPageProxy, options: {
  dpi?: number; tileSize?: number; overlap?: number; maxTiles?: number;
} = {}): { dpi: number; tiles: Tile[] } {
  const dpi = options.dpi ?? 200;
  if (!Number.isFinite(dpi) || dpi < 72 || dpi > 400) throw new Error("Drawing resolution must be between 72 and 400 DPI.");
  const viewport = page.getViewport({ scale: dpi / 72 });
  return { dpi, tiles: planTiles(page.pageNumber, viewport.width, viewport.height, options) };
}

export async function renderPageCrop(page: PDFPageProxy, crop: Box, dpi: number, signal?: AbortSignal): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("Drawing crops must be rendered in the browser.");
  if (!Number.isFinite(dpi) || dpi < 72 || dpi > 400) throw new Error("Drawing resolution must be between 72 and 400 DPI.");
  const viewport = page.getViewport({ scale: dpi / 72 });
  if (!validBox(crop) || crop.x + crop.width > viewport.width + 0.01 || crop.y + crop.height > viewport.height + 0.01) {
    throw new Error("Crop is outside the rendered PDF page.");
  }
  if (Math.ceil(crop.width) * Math.ceil(crop.height) > 4_194_304) throw new Error("Select a crop smaller than four megapixels.");
  signal?.throwIfAborted();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(crop.width); canvas.height = Math.ceil(crop.height);
  const task = page.render({ canvas, viewport, transform: [1, 0, 0, 1, -crop.x, -crop.y], background: "white" });
  const cancel = () => task.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await task.promise;
    signal?.throwIfAborted();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Could not encode the drawing crop.")), "image/png"));
    signal?.throwIfAborted();
    return blob;
  } finally {
    signal?.removeEventListener("abort", cancel);
    // Release the raster even on cancellation; large plans may require hundreds of crops.
    canvas.width = 0; canvas.height = 0;
  }
}

/** Include surrounding tag/room context while retaining the same page coordinate system. */
export function evidenceCrop(box: Box, pageWidth: number, pageHeight: number, padding = 96): Box {
  if (!validBox(box) || !Number.isFinite(pageWidth) || !Number.isFinite(pageHeight)
    || pageWidth <= 0 || pageHeight <= 0 || !Number.isFinite(padding) || padding < 0
    || box.x + box.width > pageWidth || box.y + box.height > pageHeight) throw new Error("Invalid source crop.");
  const x = Math.max(0, box.x - padding), y = Math.max(0, box.y - padding);
  return { x, y, width: Math.min(pageWidth, box.x + box.width + padding) - x,
    height: Math.min(pageHeight, box.y + box.height + padding) - y };
}
