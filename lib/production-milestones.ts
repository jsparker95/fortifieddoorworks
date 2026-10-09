import type { ProjectData } from "./types";

type ProductionKind = "frame" | "door" | "hardware";

const milestoneFor: Record<ProductionKind, string> = {
  frame: "Frames produced",
  door: "Doors produced",
  hardware: "Hardware packaged",
};

/** Return an updated project snapshot, or null when its phase/opening is no longer present. */
export function recordProductionMilestone(
  data: ProjectData,
  phaseId: string,
  openingId: string,
  kind: ProductionKind,
  date: string,
): ProjectData | null {
  const phase = data.phases?.find((item) => item.id === phaseId);
  if (!phase || !phase.data.openings.some((opening) => opening.id === openingId)) return null;
  const milestones = {
    ...phase.data.milestones,
    [openingId]: {
      ...phase.data.milestones[openingId],
      [milestoneFor[kind]]: date,
    },
  };
  return {
    ...data,
    ...(data.activePhaseId === phaseId ? { milestones } : {}),
    phases: data.phases?.map((item) => item.id === phaseId ? { ...item, data: { ...item.data, milestones } } : item),
  };
}
