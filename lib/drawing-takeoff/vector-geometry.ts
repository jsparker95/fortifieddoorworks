import type { Point } from "./geometry";

export type VectorPath = { points: Point[] };
export type VectorDoor = { hinge: Point; jamb: Point; leaf: Point; radius: number; paired: boolean };
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function circle(a: Point, b: Point, c: Point) {
  const denominator = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(denominator) < 1e-6) return null;
  const aa = a.x * a.x + a.y * a.y, bb = b.x * b.x + b.y * b.y, cc = c.x * c.x + c.y * c.y;
  return { x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / denominator,
    y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / denominator };
}

/** CAD exports often flatten a swing arc into a short circular polyline. */
function quarterArc(points: Point[]) {
  if (points.length < 5) return null;
  const start = points[0], end = points.at(-1)!;
  const hinge = circle(start, points[Math.floor(points.length / 2)], end);
  if (!hinge) return null;
  const radius = distance(hinge, start);
  if (radius < 8 || radius > 500 || points.some(point => Math.abs(distance(hinge, point) - radius) > Math.max(0.08, radius * 0.01))) return null;
  const cosine = ((start.x - hinge.x) * (end.x - hinge.x) + (start.y - hinge.y) * (end.y - hinge.y)) / (radius * radius);
  const angle = Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
  if (angle < 80 || angle > 100) return null;
  return { hinge, start, end, radius };
}

function curvedRuns(points: Point[]) {
  const runs: Point[][] = [];
  let run: Point[] = [], sign = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const u = { x: b.x - a.x, y: b.y - a.y }, v = { x: c.x - b.x, y: c.y - b.y };
    const angle = Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y) * 180 / Math.PI;
    const nextSign = Math.sign(angle);
    const curved = Math.abs(angle) >= 1 && Math.abs(angle) <= 35
      && Math.min(distance(a, b), distance(b, c)) > 0.05
      && Math.max(distance(a, b), distance(b, c)) / Math.min(distance(a, b), distance(b, c)) < 3;
    if (!curved || (sign && sign !== nextSign)) {
      if (run.length >= 5) runs.push(run);
      run = []; sign = 0;
    }
    if (curved) { if (!run.length) run = [a, b]; run.push(c); sign = nextSign; }
  }
  if (run.length >= 5) runs.push(run);
  return runs;
}

/** Require both a quarter arc and a radial straight leaf; arc direction alone is insufficient. */
export function detectVectorDoors(paths: VectorPath[]): VectorDoor[] {
  const lines = paths.flatMap(path => path.points.slice(1).map((b, i) => ({ a: path.points[i], b, length: distance(path.points[i], b) }))).filter(line => line.length > 3);
  const support = (hinge: Point, end: Point, radius: number) => {
    const tolerance = Math.max(0.3, radius * 0.035);
    const matches = new Set<string>();
    for (const line of lines) {
      if (Math.abs(line.length - radius) > tolerance * 2) continue;
      if (Math.min(distance(line.a, hinge) + distance(line.b, end), distance(line.b, hinge) + distance(line.a, end)) < tolerance * 2) {
        const parts = [line.a, line.b].map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).sort();
        matches.add(parts.join("/"));
      }
    }
    return matches.size;
  };
  const doors: VectorDoor[] = [];
  for (const path of paths) {
    const whole = quarterArc(path.points);
    for (const arc of whole ? [whole] : curvedRuns(path.points).map(quarterArc).filter((arc): arc is NonNullable<typeof arc> => !!arc)) {
      const first = support(arc.hinge, arc.start, arc.radius), last = support(arc.hinge, arc.end, arc.radius);
      if (first === last) continue;
      const leaf = first > last ? arc.start : arc.end, jamb = first > last ? arc.end : arc.start;
      if (doors.some(door => distance(door.hinge, arc.hinge) < 0.2 && distance(door.leaf, leaf) < 0.2 && distance(door.jamb, jamb) < 0.2)) continue;
      doors.push({ hinge: arc.hinge, jamb, leaf, radius: arc.radius, paired: false });
    }
  }
  for (const door of doors) door.paired = doors.some(other => other !== door
    && Math.abs(other.radius - door.radius) / door.radius < 0.15
    && distance(other.jamb, door.jamb) < Math.max(1, door.radius * 0.06)
    && distance(other.hinge, door.hinge) > door.radius * 1.5);
  return doors;
}

/** Viewpoint conversion uses screen-space vectors, avoiding model left/right arithmetic. */
export function handFromVector(door: VectorDoor, referenceNormal: Point) {
  const midpoint = { x: (door.hinge.x + door.jamb.x) / 2, y: (door.hinge.y + door.jamb.y) / 2 };
  const length = Math.hypot(referenceNormal.x, referenceNormal.y);
  if (door.paired || length < 1e-6) return null;
  const normal = { x: referenceNormal.x / length, y: referenceNormal.y / length };
  const left = { x: -normal.y, y: normal.x };
  const hingeProjection = (door.hinge.x - midpoint.x) * left.x + (door.hinge.y - midpoint.y) * left.y;
  const swingProjection = (door.leaf.x - door.hinge.x) * normal.x + (door.leaf.y - door.hinge.y) * normal.y;
  if (Math.abs(hingeProjection) < door.radius * 0.3 || Math.abs(swingProjection) < door.radius * 0.7) return null;
  const hingeSide = hingeProjection > 0 ? "left" as const : "right" as const;
  const swingDirection = swingProjection > 0 ? "toward_reference_side" as const : "away_from_reference_side" as const;
  const handing = `${hingeSide === "left" ? "L" : "R"}H${swingProjection > 0 ? "R" : ""}` as "LH" | "RH" | "LHR" | "RHR";
  return { hingeSide, swingDirection, handing };
}
