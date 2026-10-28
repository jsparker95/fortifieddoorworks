import { Catalog, Kind, ProjectData, Vendor } from "./types";
export type Field = {
  key: string;
  label: string;
  type?: "number" | "checkbox" | "date" | "textarea";
  options?: string[];
  required?: boolean;
  visibleWhen?: { key: string; value: string };
};
export function fields(kind: Kind, d: ProjectData, c: Catalog[], vendors: Vendor[] = []): Field[] {
  const options = (category: string) =>
    c.filter((c) => c.category === category).map((c) => c.value);
  const supplierOptions = vendors.map((vendor) => vendor.name);
  if (kind === "walls")
    return [
      { key: "name", label: "Wall type", required: true },
      { key: "size", label: "Frame depth / wall size", required: true },
      { key: "description", label: "Assembly notes", type: "textarea" },
      { key: "layers", label: "Layers / construction", type: "textarea" },
    ];
  if (kind === "doorTypes")
    return [
      { key: "name", label: "Door type", required: true },
      { key: "brand", label: "Manufacturer", options: options("Door brands") },
      { key: "supplier", label: "Supplier / vendor", options: supplierOptions },
      {
        key: "material",
        label: "Material",
        options: options("Door materials"),
      },
      { key: "window", label: "Window / louver", options: options("Windows") },
      { key: "fire", label: "Fire rating", options: options("Fire ratings") },
      { key: "pr", label: "P.R. / special requirements" },
      { key: "cutsheet", label: "Door cutsheet (blank = automatic match)", options: options("Door cutsheets") },
      { key: "description", label: "Type notes", type: "textarea" },
    ];
  if (kind === "hardware")
    return [
      { key: "group", label: "Hardware group", required: true },
      { key: "installCategory", label: "Installation category", options: ["Lever / lock", "Closer", "Panic hardware", "Weatherstrip / sweep", "Kick plate", "Threshold / transition", "Other"] },
      { key: "brand", label: "Brand", options: options("Hardware brands") },
      { key: "supplier", label: "Supplier / vendor", options: supplierOptions },
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
      options: [...new Set([...options("Frame brands"), ...supplierOptions])],
    },
    { key: "frameSupplier", label: "Frame supplier / vendor", options: supplierOptions },
    { key: "width", label: "Width (e.g. 3/0)", required: true },
    { key: "height", label: "Height (e.g. 7/0)", required: true },
    {
      key: "wall",
      label: "Wall type",
      options: [...d.walls.map((w) => String(w.name)), "NA"],
      required: true,
    },
    { key: "handing", label: "Handing", options: [...new Set([...options("Handing"), "LH", "RH", "LHR", "RHR"])] },
    { key: "frameType", label: "Frame type", options: options("Frame types") },
    { key: "frameMaterial", label: "Frame material" },
    { key: "frameFinish", label: "Frame finish" },
    { key: "frameCutsheet", label: "Frame cutsheet (blank = automatic match)", options: options("Frame cutsheets") },
    { key: "anchor", label: "Anchor", options: options("Anchors") },
    { key: "anchorQty", label: "Anchors per frame", type: "number" },
    { key: "qty", label: "Source quantity / note" },
    { key: "pieceRateHours", label: "Frame piece-rate credit (hours)", type: "number" },
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
    { key: "doorMaterial", label: "Opening door material" },
    { key: "doorFinish", label: "Door finish" },
    { key: "doorThickness", label: "Door thickness" },
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
