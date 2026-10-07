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
          { text: `W ${str(item.width) || "-"}`, color: str(item.width) === "3/0" ? "#FFFFFF" : "#86F85E" },
          { text: `H ${str(item.height) || "-"}`, color: str(item.height) === "7/0" ? "#FFFFFF" : "#FFFF77" },
          { text: `D ${str(item.depth) || "-"}`, color: str(item.depth) === "575" ? "#FFFFFF" : "#00FFFF" },
          { text: `Hd ${str(item.handing) || "-"}`, color: str(item.handing) === "L" ? "#CFE2F3" : str(item.handing) === "R" ? "#EA9999" : "#FFFFFF" },
          { text: `Frame Type ${frameType || "-"}` },
          { text: `Accessories ${str(item.accessories) || "-"}` },
          { text: `Notes ${str(item.notes) || "-"}` },
        ],
      };
    }
    if (kind === "Doors") {
      return {
        item,
        title: str(item.name),
        lines: [
          { text: `W ${str(item.width) || "-"}` },
          { text: `H ${str(item.height) || "-"}` },
          { text: `Hd ${str(item.handing) || "-"}` },
          { text: `Type ${str(item.typ) || "-"}` },
          { text: `Prep ${str(item.prep) || "-"}` },
          { text: `Material ${str(item.material).slice(0, 22) || "-"}` },
          { text: `Window ${str(item.window).slice(0, 22) || "-"}` },
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
          return { text: text.length > 48 ? `${text.slice(0, 47)}...` : text };
        }),
      ],
    };
  }).filter((label) => kind !== "Hardware" || !!str(label.item.group).trim());
}
