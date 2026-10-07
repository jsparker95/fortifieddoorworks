import type { ProjectData, Row, Vendor } from "./types";

/** Resolve the call's supplier defaults without overwriting a project override. */
export function supplierFor(
  kind: "openings" | "doorTypes" | "hardware",
  row: Row,
  data: ProjectData,
  vendors: Vendor[],
): Vendor | undefined {
  const explicitName = String(kind === "openings" ? row.frameSupplier || "" : row.supplier || "").trim();
  if (explicitName) return vendors.find((vendor) => vendor.name.toLowerCase() === explicitName.toLowerCase());
  let defaultName = "";
  if (kind === "hardware") defaultName = "IML";
  if (kind === "openings") {
    const wallSize = data.walls.find((wall) => String(wall.name).toLowerCase() === String(row.wall || "").toLowerCase())?.size;
    defaultName = /5\s*\.\s*25|5\s*1\/4|5¼/.test(String(wallSize || "")) ? "DCI" : "DKS";
  }
  return vendors.find((vendor) => vendor.name.toLowerCase() === defaultName.toLowerCase());
}
