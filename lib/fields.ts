import { Catalog, Kind, ProjectData } from "./types";
export type Field = {
  key: string;
  label: string;
  type?: "number" | "checkbox" | "date" | "textarea";
  options?: string[];
  required?: boolean;
};
export function fields(kind: Kind, d: ProjectData, c: Catalog[]): Field[] {
  const options = (category: string) =>
    c.filter((c) => c.category === category).map((c) => c.value);
  if (kind === "walls")
    return [
      { key: "name", label: "Wall type", required: true },
      { key: "size", label: "Frame depth / wall size", required: true },
    ];
  if (kind === "doorTypes")
    return [
      { key: "name", label: "Door type", required: true },
      { key: "brand", label: "Manufacturer", options: options("Door brands") },
      {
        key: "material",
        label: "Material",
        options: options("Door materials"),
      },
      { key: "window", label: "Window / louver", options: options("Windows") },
      { key: "fire", label: "Fire rating", options: options("Fire ratings") },
      { key: "pr", label: "P.R. / special requirements" },
    ];
  if (kind === "hardware")
    return [
      { key: "group", label: "Hardware group", required: true },
      { key: "brand", label: "Brand", options: options("Hardware brands") },
      {
        key: "component",
        label: "Component",
        options: options("Hardware components"),
        required: true,
      },
      {
        key: "qty",
        label: "Quantity per opening",
        type: "number",
        required: true,
      },
      { key: "frameMod", label: "Frame modification" },
      { key: "doorMod", label: "Door modification" },
      { key: "doorPrep", label: "Door prep" },
      {
        key: "veBrand",
        label: "Alternate brand",
        options: options("Hardware brands"),
      },
      {
        key: "veComponent",
        label: "Alternate component",
        options: options("Hardware components"),
      },
      { key: "veSelected", label: "Use alternate hardware", type: "checkbox" },
    ];
  return [
    { key: "name", label: "Opening mark", required: true },
    {
      key: "brand",
      label: "Frame manufacturer",
      options: options("Frame brands"),
    },
    { key: "width", label: "Width (e.g. 3/0)", required: true },
    { key: "height", label: "Height (e.g. 7/0)", required: true },
    {
      key: "wall",
      label: "Wall type",
      options: [...d.walls.map((w) => String(w.name)), "NA"],
      required: true,
    },
    { key: "handing", label: "Handing", options: options("Handing") },
    { key: "frameType", label: "Frame type", options: options("Frame types") },
    { key: "anchor", label: "Anchor", options: options("Anchors") },
    { key: "qty", label: "Source quantity / note" },
    { key: "pr", label: "P.R. / special requirements" },
    {
      key: "doorType",
      label: "Door schedule type",
      options: [...d.doorTypes.map((t) => String(t.name)), "NA"],
      required: true,
    },
    {
      key: "fire",
      label: "Opening fire rating",
      options: options("Fire ratings"),
    },
    {
      key: "group",
      label: "Hardware group",
      options: [...new Set(d.hardware.map((h) => String(h.group)))],
      required: true,
    },
    { key: "notes", label: "Notes", type: "textarea" },
    {
      key: "deleted",
      label: "Exclude opening from production",
      type: "checkbox",
    },
  ];
}
