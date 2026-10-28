import type { VectorPath } from "./vector-geometry";
import type { Point } from "./geometry";

/** Reassemble CAD arcs exported as separately stroked straight segments. */
export function joinedVectorPaths(paths: VectorPath[]): VectorPath[] {
  const key = (p: Point) => `${Math.round(p.x * 20)},${Math.round(p.y * 20)}`;
  const nodes = new Map<string, { point: Point; edges: number[] }>();
  const edges: Array<{ a: string; b: string }> = [], known = new Set<string>();
  for (const path of paths) for (let i = 1; i < path.points.length; i++) {
    const p = path.points[i - 1], q = path.points[i], a = key(p), b = key(q);
    if (a === b) continue;
    const id = [a, b].sort().join("/"); if (known.has(id)) continue;
    if (edges.length >= 200_000) return [];
    known.add(id); const index = edges.length; edges.push({ a, b });
    for (const [k, point] of [[a, p], [b, q]] as const) {
      if (!nodes.has(k)) nodes.set(k, { point, edges: [] });
      nodes.get(k)!.edges.push(index);
    }
  }
  const used = new Set<number>(), joined: VectorPath[] = [];
  const trace = (start: string, edge: number) => {
    const points = [nodes.get(start)!.point]; let at = start, next: number | undefined = edge;
    while (next !== undefined && !used.has(next)) {
      used.add(next); const e = edges[next]; at = e.a === at ? e.b : e.a;
      const node = nodes.get(at)!; points.push(node.point);
      if (node.edges.length !== 2) break;
      next = node.edges.find(i => !used.has(i));
    }
    if (points.length >= 5) joined.push({ points });
  };
  for (const [k, node] of nodes) if (node.edges.length !== 2) for (const e of node.edges) if (!used.has(e)) trace(k, e);
  for (let i = 0; i < edges.length; i++) if (!used.has(i)) trace(edges[i].a, i);
  return joined;
}
