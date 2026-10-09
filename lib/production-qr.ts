export type ProductionWorkKind = "frame" | "door" | "hardware";

export function productionWorkKindForLabel(value: string | null): ProductionWorkKind | null {
  switch (value?.toLowerCase()) {
    case "frame": case "frames": return "frame";
    case "door": case "doors": return "door";
    case "hardware": return "hardware";
    default: return null;
  }
}
