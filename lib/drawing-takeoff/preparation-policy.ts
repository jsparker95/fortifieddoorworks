import type { PageKind } from "./indexing";
export type PreparationMode = "schedules" | "plans";
export function partitionPreparationInputs(inputs: Array<{ path: string; kinds: PageKind[] }>) {
  return {
    schedules: inputs.filter(row => row.kinds.some(kind => kind !== "plan")).map(row => row.path),
    plans: inputs.filter(row => row.kinds.includes("plan")).map(row => row.path),
  };
}
