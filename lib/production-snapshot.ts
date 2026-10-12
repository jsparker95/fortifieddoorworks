import { derive } from "./production";
import type { ProjectPhase } from "./types";
import { stages } from "./types";

const deliveryStages = new Set([
  "Frames delivered",
  "Doors delivered",
  "Hardware delivered",
]);
const installationStages = new Set([
  "Frames installed",
  "Doors installed",
  "Hardware installed",
]);

export type ProductionSnapshotRow = {
  stage: string;
  count: number;
  total: number;
};

export function summarizeProductionSnapshot(
  phases: readonly ProjectPhase[],
  delivering: boolean,
  installing: boolean,
): ProductionSnapshotRow[] {
  const openings = phases.flatMap((phase) =>
    derive(phase.data).frames.map((frame) => ({
      id: frame.id,
      milestones: phase.data.milestones[frame.id] || {},
    })),
  );
  const visibleStages = stages.filter(
    (stage) =>
      (!deliveryStages.has(stage) || delivering) &&
      (!installationStages.has(stage) || installing),
  );

  return visibleStages.map((stage) => ({
    stage,
    count: openings.filter((opening) => opening.milestones[stage]).length,
    total: openings.length,
  }));
}
