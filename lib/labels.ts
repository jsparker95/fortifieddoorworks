import { derive, same, str } from "./production";
import { ProjectData, Row } from "./types";

export type ProductionLabelKind = "Frames" | "Doors" | "Hardware";
export type LabelLine = { text: string; color?: string };
export type ProductionLabel = { item: Row; title: string; lines: LabelLine[] };

/** Map app schedule records to the proven fields printed by the old workbook labels. */
export function productionLabels(
  data: ProjectData,
  kind: ProductionLabelKind,
  selected?: string[],
): ProductionLabel[] {
  const derived = derive(data);
  const items = kind === "Frames" ? derived.frames : derived.doors;
  const visible = items.filter((item) => !selected || selected.includes(item.id));
  return visible.map((item) => {
    if (kind === "Frames") {
      const frameType = str(item.frameType);
      return {
        item,
        title: str(item.name),
        lines: [
          { text: str(item.width), color: str(item.width) === "3/0" ? "#FFFFFF" : "#86F85E" },
          { text: str(item.height), color: str(item.height) === "7/0" ? "#FFFFFF" : "#FFFF77" },
          { text: str(item.depth), color: str(item.depth) === "575" ? "#FFFFFF" : "#00FFFF" },
          { text: str(item.handing), color: str(item.handing) === "L" ? "#CFE2F3" : str(item.handing) === "R" ? "#EA9999" : "#FFFFFF" },
          { text: [frameType, str(item.notes), str(item.accessories)].filter(Boolean).join("   ") },
        ],
      };
    }
    if (kind === "Doors") {
      return {
        item,
        title: str(item.name),
        lines: [
          { text: str(item.width), color: str(item.width) === "3/0" ? "#FFFFFF" : "#86F85E" },
          { text: str(item.height), color: str(item.height) === "7/0" ? "#FFFFFF" : "#FFFF77" },
          { text: str(item.handing), color: str(item.handing) === "L" ? "#CFE2F3" : str(item.handing) === "R" ? "#EA9999" : "#FFFFFF" },
          { text: str(item.typ) },
          { text: str(item.prep) },
          { text: `Material ${str(item.material) || "-"}` },
          { text: `Window ${str(item.window) || "-"}` },
        ],
      };
    }
    const parts = derived.hardware.filter((hardware) => same(hardware.group, item.group));
    return {
      item,
      title: str(item.name),
      lines: [
        ...parts.map((hardware) => {
          const text = `${str(hardware.qty) || "0"}ea. ${str(hardware.selectedBrand)} ${str(hardware.selectedComponent)}`.trim();
          return { text };
        }),
      ],
    };
  }).filter((label) => kind !== "Hardware" || !!str(label.item.group).trim());
}
