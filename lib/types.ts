export type Row = {
  id: string;
  [key: string]: string | number | boolean | undefined;
};
export type Kind = "walls" | "doorTypes" | "hardware" | "openings";
export const stages = [
  "Frames produced",
  "Frames delivered",
  "Frames installed",
  "Doors produced",
  "Doors delivered",
  "Doors installed",
  "Hardware received",
  "Hardware packaged",
  "Hardware delivered",
  "Hardware installed",
];
export type PhaseContent = {
  walls: Row[];
  doorTypes: Row[];
  hardware: Row[];
  openings: Row[];
  milestones: Record<string, Record<string, string>>;
  references: Row[];
  links: string[];
  takeoffSelection?: Record<string, boolean>;
  /** Phase-specific installation labor assumptions (hours/unit and sell price/unit). */
  installRates?: Record<string, { hours: number; price: number }>;
};
export type ProjectPhase = {
  id: string;
  name: string;
  createdAt: string;
  data: PhaseContent;
};
export type PhaseSplitEvent = {
  id: string;
  at: string;
  sourcePhase: ProjectPhase;
  resultingPhaseIds: string[];
  openingIdsByPhase: Record<string, string[]>;
};
export type ProjectDocument = {
  id: string;
  project_id: string;
  phase_id: string;
  file_name: string;
  storage_path: string;
  document_type: string;
  revision_label: string;
  page_count: number | null;
  status: "uploaded" | "indexed" | "analyzed" | "needs_review" | "failed";
  analysis: Record<string, unknown> | null;
  created_at: string;
};
export type ProductionWorkSession = {
  id: string;
  worker_email: string;
  project_id: string | null;
  phase_id: string | null;
  opening_id: string | null;
  opening_mark: string;
  work_kind: "shift" | "frame" | "door" | "hardware" | "coded";
  coded_category: string;
  status: "running" | "completed" | "pending_approval" | "approved" | "rejected";
  started_at: string;
  ended_at: string | null;
  piece_rate_hours: number;
  notes: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};
export type ProjectData = PhaseContent & {
  /** Peer phases. Each phase is independently splittable; no parent/child tree. */
  phases?: ProjectPhase[];
  activePhaseId?: string;
  phaseHistory?: PhaseSplitEvent[];
};
export type Project = {
  id: string;
  name: string;
  building: string;
  contractor_id: string | null;
  start_date: string | null;
  pm: string;
  jobsite: string;
  scope: string;
  cuts: string;
  status: string;
  source_id: string | null;
  data: ProjectData;
  version: number;
  updated_at: string;
};
export type Contractor = {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
};
export type Catalog = {
  id: string;
  category: string;
  value: string;
  description: string;
};
export type Vendor = {
  id: string;
  name: string;
  lead_time_days: number;
  categories: string[];
  contact: string;
  email: string;
  phone: string;
  notes: string;
  active: boolean;
  updated_at: string;
};
export const statuses = [
  "Planning",
  "Submittal",
  "Approved",
  "In production",
  "Ready to ship",
  "Complete",
  "On hold",
  "Archived",
];
export const emptyPhaseContent = (): PhaseContent => ({
  walls: [],
  doorTypes: [],
  hardware: [],
  openings: [],
  milestones: {},
  references: [],
  links: [],
});
export const emptyData = (): ProjectData => {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const data = emptyPhaseContent();
  return {
    ...data,
    activePhaseId: id,
    phases: [{ id, name: "Phase 1", createdAt, data: structuredClone(data) }],
    phaseHistory: [],
  };
};
export const newProject = (): Project => ({
  id: crypto.randomUUID(),
  name: "",
  building: "",
  contractor_id: null,
  start_date: null,
  pm: "",
  jobsite: "",
  scope: "",
  cuts: "",
  status: "Planning",
  source_id: null,
  data: emptyData(),
  version: 1,
  updated_at: new Date().toISOString(),
});
