import type { Project } from "@/lib/types";

export const projectSortColumns = [
  { label: "Project", key: "name" },
  { label: "Building", key: "building" },
  { label: "Contractor", key: "contractor" },
  { label: "Project manager", key: "pm" },
  { label: "Status", key: "status" },
  { label: "Openings", key: "openings" },
  { label: "Production", key: "progress" },
] as const;

export type ProjectSortColumnKey = (typeof projectSortColumns)[number]["key"];
export type ProjectSortKey = ProjectSortColumnKey | "updated_at";
export type ProjectSortDirection = "asc" | "desc";
export type SortableProject = Project & {
  computed: { frames: unknown[]; progress: number };
};

function projectSortValue(
  project: SortableProject,
  key: ProjectSortKey,
  contractorName: string,
): string | number {
  switch (key) {
    case "name":
      return project.name;
    case "building":
      return project.building || "Independent project";
    case "contractor":
      return contractorName || "Not assigned";
    case "pm":
      return project.pm || "Not assigned";
    case "status":
      return project.status;
    case "openings":
      return project.computed.frames.length;
    case "progress":
      return project.computed.progress;
    case "updated_at":
      return project.updated_at;
  }
}

export function compareProjects(
  left: SortableProject,
  right: SortableProject,
  key: ProjectSortKey,
  direction: ProjectSortDirection,
  contractors: ReadonlyMap<string, string>,
): number {
  const leftValue = projectSortValue(
    left,
    key,
    left.contractor_id ? contractors.get(left.contractor_id) || "" : "",
  );
  const rightValue = projectSortValue(
    right,
    key,
    right.contractor_id ? contractors.get(right.contractor_id) || "" : "",
  );
  const compared =
    typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), undefined, {
          numeric: true,
          sensitivity: "base",
        });
  return direction === "asc" ? compared : -compared;
}
