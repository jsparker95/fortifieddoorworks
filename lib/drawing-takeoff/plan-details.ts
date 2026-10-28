import type { PageIndex } from "./indexing";
import type { Box } from "./geometry";

export type PlanDetail = Box & { mark: string; overviewX: number; overviewY: number };

/** Render the vector source around each target, preserving the larger crop as context. */
export function planDetails(page: PageIndex, overview: Box, marks: string[]): PlanDetail[] {
  const width = Math.min(400, page.width * 2), height = Math.min(400, page.height * 2);
  return [...new Set(marks)].slice(0, 4).flatMap(mark => {
    const matches = page.boxes.filter(box => box.text.trim().toUpperCase() === mark.toUpperCase())
      .map(box => ({ x: (box.x + box.width / 2) * 2, y: (box.y + box.height / 2) * 2 }))
      .filter(point => point.x >= overview.x && point.x <= overview.x + overview.width && point.y >= overview.y && point.y <= overview.y + overview.height)
      .sort((a, b) => Math.hypot(a.x - overview.x - overview.width / 2, a.y - overview.y - overview.height / 2)
        - Math.hypot(b.x - overview.x - overview.width / 2, b.y - overview.y - overview.height / 2));
    const point = matches[0];
    if (!point) return [];
    return [{ mark, x: Math.max(0, Math.min(page.width * 2 - width, point.x - width / 2)),
      y: Math.max(0, Math.min(page.height * 2 - height, point.y - height / 2)), width, height,
      overviewX: (point.x - overview.x) / overview.width * 1000, overviewY: (point.y - overview.y) / overview.height * 1000 }];
  });
}
