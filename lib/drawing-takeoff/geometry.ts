/** All coordinates use the displayed page: top-left origin, x right, y down. */
export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };
export type Tile = Box & { id: string; page: number; pageWidth: number; pageHeight: number };
export type DoorDetection = {
  id: string; page: number; box: Box; confidence: number;
  mark?: string; evidence: string; tileId: string;
  hinge?: Point; closedJamb?: Point; openLeafTip?: Point;
};

function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number.`);
}
export function validBox(box: Box): boolean {
  return [box.x, box.y, box.width, box.height].every(Number.isFinite)
    && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0;
}

/** Plan bounded overlapping crops without allocating a full-resolution page bitmap. */
export function planTiles(page: number, width: number, height: number, options: {
  tileSize?: number; overlap?: number; maxTiles?: number;
} = {}): Tile[] {
  if (!Number.isInteger(page) || page < 1) throw new Error("PDF page numbers start at 1.");
  positive(width, "Page width"); positive(height, "Page height");
  const size = options.tileSize ?? 1024, overlap = options.overlap ?? 192;
  const limit = options.maxTiles ?? 256;
  positive(size, "Tile size"); positive(limit, "Tile limit");
  if (!Number.isFinite(overlap) || overlap < 0 || overlap >= size) throw new Error("Overlap must be smaller than the tile size.");
  const stride = size - overlap;
  const cols = Math.max(1, Math.ceil((width - size) / stride) + 1);
  const rows = Math.max(1, Math.ceil((height - size) / stride) + 1);
  if (cols * rows > limit) throw new Error(`Page ${page} requires ${cols * rows} tiles, above the ${limit}-tile limit. Reduce resolution or select a smaller region.`);
  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = Math.min(col * stride, Math.max(0, width - size));
    const y = Math.min(row * stride, Math.max(0, height - size));
    tiles.push({ id: `${page}:${row}:${col}`, page, x, y,
      width: Math.min(size, width), height: Math.min(size, height), pageWidth: width, pageHeight: height });
  }
  return tiles;
}

/** Model boxes are normalized to their individual crop, not to the full sheet. */
export function tileBoxToPage(tile: Tile, local: Box): Box {
  if (!validBox(local) || local.x + local.width > 1.000001 || local.y + local.height > 1.000001) {
    throw new Error("Detection box must fit inside its tile in normalized coordinates.");
  }
  return { x: tile.x + local.x * tile.width, y: tile.y + local.y * tile.height,
    width: local.width * tile.width, height: local.height * tile.height };
}

export function intersectionOverUnion(a: Box, b: Box): number {
  if (!validBox(a) || !validBox(b)) return 0;
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = width * height;
  return intersection / (a.width * a.height + b.width * b.height - intersection);
}

/** Keep punctuation: 101-A and 101A may be different architect-assigned marks. */
export function normalizeMark(mark: string): string {
  return mark.trim().toUpperCase().replace(/\s+/g, "");
}

/** Suppress overlapping detections only when their explicit door marks do not conflict. */
export function deduplicateDoors(detections: DoorDetection[], threshold = 0.5): {
  doors: DoorDetection[]; suppressed: DoorDetection[]; conflicts: Array<[string, string]>;
} {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) throw new Error("Overlap threshold must be between 0 and 1.");
  const doors: DoorDetection[] = [], suppressed: DoorDetection[] = [], conflicts: Array<[string, string]> = [];
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
  for (const candidate of sorted) {
    if (!validBox(candidate.box) || !Number.isInteger(candidate.page) || candidate.page < 1
      || !Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) {
      throw new Error(`Invalid detection ${candidate.id}.`);
    }
    let duplicate = false;
    for (const previous of doors) {
      if (previous.page !== candidate.page || intersectionOverUnion(previous.box, candidate.box) < threshold) continue;
      const left = normalizeMark(previous.mark || ""), right = normalizeMark(candidate.mark || "");
      if (left && right && left !== right) { conflicts.push([previous.id, candidate.id]); continue; }
      duplicate = true; break;
    }
    (duplicate ? suppressed : doors).push(candidate);
  }
  return { doors, suppressed, conflicts };
}

/** Describe the drawn swing only. This does not establish regular/reverse handing. */
export function observeSwing(door: Pick<DoorDetection, "hinge" | "closedJamb" | "openLeafTip">): {
  rotation: "clockwise" | "counterclockwise" | "unknown"; angleDegrees: number | null;
} {
  const { hinge, closedJamb, openLeafTip } = door;
  if (!hinge || !closedJamb || !openLeafTip || ![hinge, closedJamb, openLeafTip].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
    return { rotation: "unknown", angleDegrees: null };
  }
  const closed = { x: closedJamb.x - hinge.x, y: closedJamb.y - hinge.y };
  const open = { x: openLeafTip.x - hinge.x, y: openLeafTip.y - hinge.y };
  const lengths = Math.hypot(closed.x, closed.y) * Math.hypot(open.x, open.y);
  if (lengths < 1e-8) return { rotation: "unknown", angleDegrees: null };
  const cross = closed.x * open.y - closed.y * open.x;
  const dot = closed.x * open.x + closed.y * open.y;
  const angle = Math.atan2(cross, dot) * 180 / Math.PI;
  if (Math.abs(angle) < 5 || Math.abs(angle) > 175) return { rotation: "unknown", angleDegrees: null };
  return { rotation: cross > 0 ? "clockwise" : "counterclockwise", angleDegrees: Math.abs(angle) };
}
