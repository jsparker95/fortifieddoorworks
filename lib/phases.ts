import {
  PhaseContent,
  Project,
  ProjectData,
  ProjectPhase,
  emptyPhaseContent,
} from "./types";

const contentFrom = (data: Partial<ProjectData>): PhaseContent => ({
  ...emptyPhaseContent(),
  walls: Array.isArray(data.walls) ? data.walls : [],
  doorTypes: Array.isArray(data.doorTypes) ? data.doorTypes : [],
  hardware: Array.isArray(data.hardware) ? data.hardware : [],
  openings: Array.isArray(data.openings) ? data.openings : [],
  milestones: data.milestones || {},
  references: Array.isArray(data.references) ? data.references : [],
  links: Array.isArray(data.links) ? data.links : [],
  takeoffSelection: data.takeoffSelection || {},
  installRates: data.installRates || {},
  anchorMilestones: data.anchorMilestones || {},
  elevations: Array.isArray(data.elevations) ? data.elevations : [],
  woodDoorOrders: Array.isArray(data.woodDoorOrders) ? data.woodDoorOrders : [],
  machiningSpecs: Array.isArray(data.machiningSpecs) ? data.machiningSpecs : [],
});

/** Upgrade the old one-workbook-per-project JSON shape without losing its contents. */
export function normalizeProject(project: Project): Project {
  const data = project.data as ProjectData;
  let phases = Array.isArray(data.phases) ? data.phases : [];
  if (!phases.length) {
    const id = crypto.randomUUID();
    phases = [
      {
        id,
        name: "Phase 1",
        createdAt: project.updated_at || new Date().toISOString(),
        data: contentFrom(data),
      },
    ];
  } else {
    phases = phases.map((phase, index) => ({
      ...phase,
      id: phase.id || crypto.randomUUID(),
      name: phase.name || `Phase ${index + 1}`,
      createdAt: phase.createdAt || project.updated_at || new Date().toISOString(),
      data: contentFrom(phase.data),
    }));
  }
  const selected = phases.find((phase) => phase.id === data.activePhaseId) || phases[0];
  return {
    ...project,
    data: {
      ...selected.data,
      phases,
      activePhaseId: selected.id,
      phaseHistory: Array.isArray(data.phaseHistory) ? data.phaseHistory : [],
    },
  };
}

export function activePhase(data: ProjectData): ProjectPhase {
  const phases = data.phases || [];
  return (
    phases.find((phase) => phase.id === data.activePhaseId) ||
    phases[0] || {
      id: data.activePhaseId || "legacy-phase",
      name: "Phase 1",
      createdAt: new Date().toISOString(),
      data: contentFrom(data),
    }
  );
}

/** Previous phase IDs whose plans/specifications are inherited by this phase. */
export function phaseAncestors(data: ProjectData, phaseId: string): string[] {
  const known = new Set([phaseId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const event of data.phaseHistory || []) {
      if (event.resultingPhaseIds.some((id) => known.has(id)) && !known.has(event.sourcePhase.id)) {
        known.add(event.sourcePhase.id);
        changed = true;
      }
    }
  }
  return [...known];
}

/** Resolve old printed QR codes through any number of later phase splits. */
export function resolvePhaseForOpening(
  data: ProjectData,
  requestedPhaseId: string,
  openingId: string,
): string | null {
  const phases = data.phases || [];
  const events = data.phaseHistory || [];
  let candidate = requestedPhaseId;
  const visited = new Set<string>();
  while (!visited.has(candidate)) {
    visited.add(candidate);
    if (phases.some((phase) => phase.id === candidate)) return candidate;
    const event = events.find((entry) => entry.sourcePhase.id === candidate);
    const next = event?.resultingPhaseIds.find((id) =>
      event.openingIdsByPhase[id]?.includes(openingId),
    );
    if (!next) return null;
    candidate = next;
  }
  return null;
}

export function selectPhase(project: Project, phaseId: string): Project {
  const data = project.data;
  const phase = (data.phases || []).find((item) => item.id === phaseId);
  if (!phase) return project;
  return {
    ...project,
    data: {
      ...phase.data,
      phases: data.phases,
      activePhaseId: phase.id,
      phaseHistory: data.phaseHistory || [],
    },
  };
}

/** Keep the selected phase's editable data and its persisted phase record in sync. */
export function persistActivePhase(data: ProjectData): ProjectData {
  const current = activePhase(data);
  const content = contentFrom(data);
  const phases = data.phases?.length
    ? data.phases.map((phase) =>
        phase.id === current.id ? { ...phase, data: content } : phase,
      )
    : [{ ...current, data: content }];
  return {
    ...content,
    phases,
    activePhaseId: current.id,
    phaseHistory: data.phaseHistory || [],
  };
}

export function makeSplit(
  project: Project,
  firstName: string,
  secondName: string,
  secondOpeningIds: string[],
): Project {
  const data = persistActivePhase(project.data);
  const source = activePhase(data);
  const selected = new Set(secondOpeningIds);
  if (source.data.openings.length > 1 && (!selected.size || selected.size === source.data.openings.length))
    throw new Error("Assign at least one opening to each phase.");
  if (!firstName.trim() || !secondName.trim() || firstName.trim() === secondName.trim())
    throw new Error("Enter two different phase names.");

  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  const splitContent = (keep: (id: string) => boolean): PhaseContent => {
    const openings = source.data.openings.filter((opening) => keep(opening.id));
    const ids = new Set(openings.map((opening) => opening.id));
    return {
      ...structuredClone(source.data),
      openings,
      elevations: source.data.elevations?.filter((drawing) => ids.has(drawing.openingId)) || [],
      woodDoorOrders: source.data.woodDoorOrders?.filter((record) => ids.has(record.openingId)) || [],
      machiningSpecs: source.data.machiningSpecs?.filter((record) => ids.has(record.openingId)) || [],
      milestones: Object.fromEntries(
        Object.entries(source.data.milestones).filter(([id]) => ids.has(id)),
      ),
      takeoffSelection: {},
    };
  };
  const first: ProjectPhase = {
    id: firstId,
    name: firstName.trim(),
    createdAt: new Date().toISOString(),
    data: splitContent((id) => !selected.has(id)),
  };
  const second: ProjectPhase = {
    id: secondId,
    name: secondName.trim(),
    createdAt: new Date().toISOString(),
    data: splitContent((id) => selected.has(id)),
  };
  const phases = (data.phases || []).flatMap((phase) =>
    phase.id === source.id ? [first, second] : [phase],
  );
  const event = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    sourcePhase: structuredClone(source),
    resultingPhaseIds: [firstId, secondId],
    openingIdsByPhase: {
      [firstId]: first.data.openings.map((opening) => opening.id),
      [secondId]: second.data.openings.map((opening) => opening.id),
    },
  };
  return {
    ...project,
    data: {
      ...second.data,
      phases,
      activePhaseId: second.id,
      phaseHistory: [...(data.phaseHistory || []), event],
    },
  };
}
