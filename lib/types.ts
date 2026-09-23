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
export type ProjectData = {
  walls: Row[];
  doorTypes: Row[];
  hardware: Row[];
  openings: Row[];
  milestones: Record<string, Record<string, string>>;
  references: Row[];
  links: string[];
  takeoffSelection?: Record<string, boolean>;
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
export const emptyData = (): ProjectData => ({
  walls: [],
  doorTypes: [],
  hardware: [],
  openings: [],
  milestones: {},
  references: [],
  links: [],
});
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
