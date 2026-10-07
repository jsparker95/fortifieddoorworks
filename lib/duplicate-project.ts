import { activePhase, persistActivePhase } from "./phases";
import type { Project, ProjectData, ProjectPhase, PhaseContent } from "./types";

export function duplicateProject(source: Project): {
  project: Project;
  phaseIds: Map<string, string>;
} {
  const original = persistActivePhase(source.data);
  const phaseIds = new Map<string, string>();
  const openingIds = new Map<string, Map<string, string>>();
  const phaseId = (id: string) => {
    if (!phaseIds.has(id)) phaseIds.set(id, crypto.randomUUID());
    return phaseIds.get(id)!;
  };
  const openingId = (phase: string, id: string) => {
    if (!openingIds.has(phase)) openingIds.set(phase, new Map());
    const map = openingIds.get(phase)!;
    if (!map.has(id)) map.set(id, crypto.randomUUID());
    return map.get(id)!;
  };
  const content = (value: PhaseContent, oldPhaseId: string): PhaseContent => {
    const idMap = new Map(value.openings.map((opening) => [
      opening.id,
      openingId(oldPhaseId, opening.id),
    ]));
    return {
      ...structuredClone(value),
      openings: value.openings.map((opening) => ({ ...opening, id: idMap.get(opening.id)! })),
      milestones: {},
      takeoffSelection: {},
      elevations: (value.elevations || []).map((item) => ({ ...item, openingId: idMap.get(item.openingId) || item.openingId })),
      woodDoorOrders: (value.woodDoorOrders || []).map((item) => ({ ...item, openingId: idMap.get(item.openingId) || item.openingId })),
      machiningSpecs: (value.machiningSpecs || []).map((item) => ({ ...item, openingId: idMap.get(item.openingId) || item.openingId })),
    };
  };
  const phase = (value: ProjectPhase): ProjectPhase => ({
    ...structuredClone(value),
    id: phaseId(value.id),
    data: content(value.data, value.id),
  });

  const phases = (original.phases || []).map(phase);
  const selected = activePhase(original);
  const duplicatedData: ProjectData = {
    ...content(selected.data, selected.id),
    phases,
    activePhaseId: phaseId(selected.id),
    phaseHistory: (original.phaseHistory || []).map((event) => {
      const sourcePhase = phase(event.sourcePhase);
      const remappedOpeningIds: Record<string, string[]> = {};
      for (const [oldId, ids] of Object.entries(event.openingIdsByPhase)) {
        const nextId = phaseId(oldId);
        remappedOpeningIds[nextId] = ids.map((id) => openingId(oldId, id));
      }
      return {
        ...structuredClone(event),
        id: crypto.randomUUID(),
        sourcePhase,
        resultingPhaseIds: event.resultingPhaseIds.map(phaseId),
        openingIdsByPhase: remappedOpeningIds,
      };
    }),
  };

  const now = new Date().toISOString();
  return {
    project: {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      name: `${source.name} — copy`,
      status: "Planning",
      source_id: null,
      data: duplicatedData,
      version: 1,
      updated_at: now,
    },
    phaseIds,
  };
}
