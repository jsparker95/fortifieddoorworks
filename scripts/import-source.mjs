import fs from "node:fs";
import crypto from "node:crypto";
const files = fs
  .readdirSync("discovery")
  .filter((n) => n.endsWith(".json") && !n.includes("-sample"));
const projects = [],
  catalogs = [],
  contractors = [];
const stages = [
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
const cat = (category, value, description = "") => {
  if (
    value &&
    !catalogs.some((c) => c.category === category && c.value === value)
  )
    catalogs.push({ id: crypto.randomUUID(), category, value, description });
};
for (const file of files) {
  const src = JSON.parse(fs.readFileSync("discovery/" + file, "utf8"));
  const sample = JSON.parse(
    fs.readFileSync("discovery/" + src.spreadsheetId + "-sample.json", "utf8"),
  ).sample;
  const rows = (name) =>
    src.sheets
      .find((s) => s.properties.title === name)
      ?.data[0]?.rowData?.map((r) =>
        (r.values || []).map((c) => c.formattedValue || ""),
      ) || [];
  const map = (name, keys, skip = 1) =>
    rows(name)
      .slice(skip)
      .filter((r) => r[0] && r[0] !== "0")
      .map((r) =>
        Object.fromEntries([
          ["id", crypto.randomUUID()],
          ...keys.map((k, i) => [k, r[i] || ""]),
        ]),
      );
  const walls = map("Walls", ["name", "size"]);
  const doorTypes = map("Door Sch", [
    "name",
    "brand",
    "material",
    "window",
    "fire",
    "pr",
  ]);
  const rawhardware = rows("Hardware")
    .slice(1)
    .filter((r) => r[4] && r[6]);
  const hardware = rawhardware.map((r) => ({
    id: crypto.randomUUID(),
    group: r[4],
    brand: r[5],
    component: r[6],
    qty: Number(r[7] || 0),
    frameMod: r[8] || "",
    doorMod: r[9] || "",
    doorPrep: r[10] || "",
    veBrand: r[11] || "",
    veComponent: r[12] || "",
    veSelected: r[13] === "TRUE",
  }));
  const openings = map("Frames", [
    "name",
    "brand",
    "width",
    "height",
    "wall",
    "sourceDepth",
    "handing",
    "frameType",
    "notes",
    "anchor",
    "qty",
    "pr",
    "doorType",
    "fire",
    "group",
    "deleted",
    "sourceAcc",
    "sourcePartName",
  ]);
  openings.forEach((o) => {
    o.deleted = o.deleted === "TRUE";
  });
  const milestones = {};
  rows("Build Sheet")
    .slice(2)
    .filter((r) => r[0])
    .forEach((r) => {
      const o = openings.find((o) => o.name === r[0]);
      if (!o) return;
      milestones[o.id] = {};
      stages.forEach((s, i) => {
        if (r[i * 2 + 1] === "TRUE") {
          const date = r[i * 2 + 2] || "";
          const m = date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
          milestones[o.id][s] = m
            ? `${m[3]}-${m[1]}-${m[2]}`
            : date || "Complete";
        }
      });
    });
  const job = sample.sheets
    .find((s) => s.properties.title === "Job Info")
    .data[0].rowData.map((r) =>
      (r.values || []).map((c) => c.formattedValue || ""),
    );
  const name = src.properties.title.replace(/^Copy of /, "");
  let contractor_id = null;
  const cn = job[1]?.[1];
  if (cn) {
    let c = contractors.find((c) => c.name === cn);
    if (!c) {
      c = {
        id: crypto.randomUUID(),
        name: cn,
        contact: "",
        email: "",
        phone: "",
      };
      contractors.push(c);
    }
    contractor_id = c.id;
  }
  const links = job
    .filter((r) => r[0] === "Submittal Link" && r[1])
    .map((r) => r[1]);
  const references = job
    .slice(11, 22)
    .filter((r) => r[0])
    .map((r) => ({
      id: crypto.randomUUID(),
      name: r[0],
      page: r[1] || "",
      selection: r[2] || "",
    }));
  projects.push({
    id: crypto.randomUUID(),
    name,
    building: name.includes("Intermountain")
      ? "Intermountain Utah Valley Sports Performance Center"
      : "DWORQ",
    contractor_id,
    start_date: null,
    pm: job[3]?.[1] || "",
    jobsite: job[4]?.[1] || "",
    scope: job[5]?.[1] || "",
    cuts: job[6]?.[1] || "",
    status: "Planning",
    source_id: src.spreadsheetId,
    data: {
      walls,
      doorTypes,
      hardware,
      openings,
      milestones,
      references,
      links,
    },
    version: 1,
    updated_at: new Date().toISOString(),
  });
  const defs = {
    "Door Sch": { 1: "Door brands", 2: "Door materials", 3: "Windows" },
    Frames: { 6: "Handing", 13: "Fire ratings" },
  };
  for (const sh of src.sheets) {
    for (const row of sh.data[0]?.rowData || []) {
      (row.values || []).forEach((cell, i) => {
        const category = defs[sh.properties.title]?.[i];
        if (category)
          for (const v of cell.dataValidation?.condition?.values || [])
            cat(category, v.userEnteredValue);
      });
    }
  }
  rows("Reference")
    .slice(1)
    .forEach((r) => {
      if (r[0]) cat("Frame modifications", r[0], r[1] || "");
      if (r[2]) cat("Door modifications", r[2], r[3] || "");
    });
  rows("Lookups")
    .filter((r) => r[0])
    .forEach((r) => cat("Material reference", r[0], r[1] || ""));
  hardware.forEach((h) => {
    cat("Hardware brands", h.brand);
    cat("Hardware components", h.component);
    if (h.veBrand) cat("Hardware brands", h.veBrand);
    if (h.veComponent) cat("Hardware components", h.veComponent);
  });
  openings.forEach((o) => {
    if (o.frameType) cat("Frame types", o.frameType);
    if (o.anchor) cat("Anchors", o.anchor);
    if (o.brand) cat("Frame brands", o.brand);
  });
  console.log(name, {
    openings: openings.length,
    hardware: hardware.length,
    sourceTotals: rows("Takeoff")[0],
  });
}
fs.mkdirSync("local-data", { recursive: true });
fs.writeFileSync(
  "local-data/seed.json",
  JSON.stringify({ projects, contractors, catalogs }),
);
const quote = (v) => "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
const statements = [];
for (const [table, data] of [
  ["contractors", contractors],
  ["catalogs", catalogs],
  ["projects", projects],
])
  for (const row of data) {
    statements.push(
      `insert into public.${table} select * from jsonb_populate_record(null::public.${table},${quote(row)}) on conflict do nothing;`,
    );
  }
fs.writeFileSync("local-data/seed.sql", statements.join("\n"));
