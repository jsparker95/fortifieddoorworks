import type { Point } from "./geometry";
import type { TextBox } from "./indexing";
import { distance, handFromVector, type VectorDoor } from "./vector-geometry";

export type RegionMap = { ids: Uint32Array; areas: number[]; border: boolean[]; width: number; height: number; scale: number };

/** Seal drawn swing openings, then identify enclosed circulation regions. */
export function planRegions(pixels: Uint8ClampedArray, width: number, height: number, scale: number, doors: VectorDoor[], dilate: boolean): RegionMap {
  const count = width * height, mask = new Uint8Array(count);
  for (let i = 0; i < count; i++) mask[i] = 0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2] < 100 ? 1 : 0;
  if (dilate) {
    const original = mask.slice();
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (original[i]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mask[i + dy * width + dx] = 1;
    }
  }
  for (const door of doors) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(door.jamb.x - door.hinge.x), Math.abs(door.jamb.y - door.hinge.y)) * scale * 2));
    for (let step = 0; step <= steps; step++) {
      const x = Math.round((door.hinge.x + (door.jamb.x - door.hinge.x) * step / steps) * scale);
      const y = Math.round((door.hinge.y + (door.jamb.y - door.hinge.y) * step / steps) * scale);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < width && yy >= 0 && yy < height) mask[yy * width + xx] = 1;
      }
    }
  }
  const ids = new Uint32Array(count), queue = new Uint32Array(count), areas = [0], border = [false];
  let id = 0;
  for (let start = 0; start < count; start++) {
    if (mask[start] || ids[start]) continue;
    id++; let head = 0, tail = 1, touchesBorder = false;
    queue[0] = start; ids[start] = id;
    while (head < tail) {
      const i = queue[head++], x = i % width;
      if (x === 0 || x === width - 1 || i < width || i >= count - width) touchesBorder = true;
      const neighbors = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i >= width ? i - width : -1, i < count - width ? i + width : -1];
      for (const next of neighbors) if (next >= 0 && !mask[next] && !ids[next]) { ids[next] = id; queue[tail++] = next; }
    }
    areas[id] = tail; border[id] = touchesBorder;
  }
  return { ids, areas, border, width, height, scale };
}

function regionAt(map: RegionMap, point: Point) {
  const x = Math.round(point.x * map.scale), y = Math.round(point.y * map.scale);
  return x >= 0 && x < map.width && y >= 0 && y < map.height ? map.ids[y * map.width + x] : 0;
}

function labelRegion(map: RegionMap, box: TextBox) {
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const seeds = box.width > box.height
    ? [{ x: middle.x, y: box.y - 2 }, { x: middle.x, y: box.y + box.height + 2 }]
    : [{ x: box.x - 2, y: middle.y }, { x: box.x + box.width + 2, y: middle.y }];
  const ids = [...new Set(seeds.map(point => regionAt(map, point)).filter(id => id && map.areas[id] > Math.max(16, 100 * map.scale * map.scale)))];
  return ids.length === 1 ? ids[0] : 0;
}

export function regionReferences(map: RegionMap, boxes: TextBox[], doors: VectorDoor[], allowExterior: boolean) {
  const labels = boxes.filter(box => /^(?:CORRIDOR|HALLWAY|HALL)(?:\s+[A-Z0-9-]+)?$/i.test(box.text.trim()))
    .map(box => ({ ...box, region: labelRegion(map, box) }))
    .filter(box => box.region && !map.border[box.region] && map.areas[box.region] < map.width * map.height * 0.15);
  const interior = new Set(labels.map(box => box.region));
  for (const box of boxes.filter(box => /^(?:BUNK|OFFICE|STORAGE|FITNESS|DINING|APPARATUS BAY|TRAINING ROOM|GEAR ROOM|LAUNDRY|MECHANICAL|UTILITY|TOILET|MEN|WOMEN|VESTIBULE|MED|EMS)\b/i.test(box.text.trim()) && box.text.length < 80)) {
    const id = labelRegion(map, box); if (id) interior.add(id);
  }
  const exterior = new Set<number>();
  if (allowExterior && doors.length) {
    const minX = Math.min(...doors.map(door => door.hinge.x)), maxX = Math.max(...doors.map(door => door.hinge.x));
    const minY = Math.min(...doors.map(door => door.hinge.y)), maxY = Math.max(...doors.map(door => door.hinge.y));
    const offset = Math.max(...doors.map(door => door.radius)) * 2;
    const votes = new Map<number, Set<string>>();
    for (let i = 0; i <= 20; i++) for (const [side, point] of [
      ["top", { x: minX + (maxX - minX) * i / 20, y: minY - offset }],
      ["bottom", { x: minX + (maxX - minX) * i / 20, y: maxY + offset }],
      ["left", { x: minX - offset, y: minY + (maxY - minY) * i / 20 }],
      ["right", { x: maxX + offset, y: minY + (maxY - minY) * i / 20 }],
    ] as const) {
      const id = regionAt(map, point);
      if (!id || interior.has(id) || !map.border[id] || map.areas[id] < 1000 * map.scale * map.scale) continue;
      if (!votes.has(id)) votes.set(id, new Set());
      votes.get(id)!.add(side);
    }
    for (const [id, sides] of votes) if (sides.size >= 2) exterior.add(id);
  }
  return { labels, exterior };
}

export function referenceHand(map: RegionMap, references: ReturnType<typeof regionReferences>, door: VectorDoor) {
  if (door.paired) return null;
  const middle = { x: (door.hinge.x + door.jamb.x) / 2, y: (door.hinge.y + door.jamb.y) / 2 };
  const axis = { x: door.jamb.x - door.hinge.x, y: door.jamb.y - door.hinge.y };
  const normal = { x: -axis.y / door.radius, y: axis.x / door.radius };
  const sides = [1, -1].map(sign => {
    const ids = new Set<number>();
    for (const offset of [0.15, 0.35, 0.6, 1.1]) for (const tangent of [-0.2, 0, 0.2]) {
      const id = regionAt(map, { x: middle.x + sign * normal.x * door.radius * offset + axis.x * tangent,
        y: middle.y + sign * normal.y * door.radius * offset + axis.y * tangent });
      if (id) ids.add(id);
    }
    const labels = references.labels.filter(label => ids.has(label.region))
      .sort((a, b) => distance(middle, { x: a.x + a.width / 2, y: a.y + a.height / 2 }) - distance(middle, { x: b.x + b.width / 2, y: b.y + b.height / 2 }));
    return { sign, labels, outside: [...ids].some(id => references.exterior.has(id)) };
  });
  const outside = sides.filter(side => side.outside);
  if (outside.length > 1) return null;
  const candidates = outside.length === 1 ? outside : sides.filter(side => side.labels.length);
  if (candidates.length !== 1) return null;
  const chosen = candidates[0];
  const hand = handFromVector(door, { x: normal.x * chosen.sign, y: normal.y * chosen.sign });
  return hand ? { ...hand, reference: chosen.outside ? "outside the building" : `corridor side (${chosen.labels[0].text})`, referenceKind: chosen.outside ? "exterior" : "corridor" } : null;
}
