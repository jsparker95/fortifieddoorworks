import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { derive } from "../lib/production";
import { emptyData, Project } from "../lib/types";
function sample() {
  const d = emptyData();
  d.walls = [{ id: "w", name: "W1", size: "575" }];
  d.doorTypes = [
    {
      id: "t",
      name: "WD",
      brand: "Oregon",
      material: "PSWO Door",
      window: "",
      fire: "45 Min",
    },
  ];
  d.hardware = [
    {
      id: "h",
      group: "1",
      brand: "A",
      component: "Hinge",
      qty: 3,
      frameMod: "EPT",
      doorMod: "MB",
      doorPrep: "",
      veSelected: false,
      veBrand: "B",
      veComponent: "Alternate hinge",
    },
  ];
  d.openings = [
    {
      id: "o",
      name: "101",
      width: "3/0",
      height: "7/0",
      wall: "W1",
      handing: "L",
      doorType: "WD",
      fire: "20 Min",
      group: "1",
    },
  ];
  return d;
}
test("opening inputs produce frame, door and hardware output", () => {
  const r = derive(sample());
  assert.equal(r.frames[0].partName, "3070 575 L EPT ");
  assert.equal(r.doors[0].fire, "45 Min");
  assert.equal(r.hardwareTakeoff[0].count, 3);
  assert.equal(r.warnings.length, 0);
});
test("hardware alternatives switch brand/component without altering quantities", () => {
  const d = sample();
  d.hardware[0].veSelected = true;
  const r = derive(d);
  assert.deepEqual(r.hardwareTakeoff, [
    { brand: "B", name: "Alternate hinge", count: 3 },
  ]);
});
test("excluded openings consistently leave takeoff, hardware and progress", () => {
  const d = sample();
  d.openings.push({
    ...d.openings[0],
    id: "excluded",
    name: "102",
    deleted: true,
  });
  assert.equal(derive(d).hardwareTakeoff[0].count, 3);
  assert.equal(derive(d).frameTakeoff[0].count, 1);
});
test("groups are not limited to 57 and progress follows stable opening ids", () => {
  const d = sample();
  d.openings = Array.from({ length: 300 }, (_, i) => ({
    ...d.openings[0],
    id: String(i),
    name: String(i),
    width: String(i),
  }));
  d.milestones["299"] = { "Frames produced": "2026-09-23" };
  const r = derive(d);
  assert.equal(r.frameTakeoff.length, 300);
  assert.equal(r.hardwareTakeoff[0].count, 900);
  assert.equal(r.frames.length, 300);
});
test("missing door rating falls back to opening rating", () => {
  const d = sample();
  d.doorTypes[0].fire = "";
  assert.equal(derive(d).doors[0].fire, "20 Min");
});
test("warns on unresolved references and duplicate marks", () => {
  const d = sample();
  d.openings.push({ ...d.openings[0], id: "duplicate" });
  d.openings[0].wall = "missing";
  assert.ok(derive(d).warnings.some((w) => w.includes("wall type is missing")));
  assert.ok(derive(d).warnings.some((w) => w.includes("duplicate opening")));
});
test(
  "real source workbooks match headline quantities",
  { skip: !existsSync("local-data/seed.json") },
  () => {
    const { projects } = JSON.parse(
      readFileSync("local-data/seed.json", "utf8"),
    ) as { projects: Project[] };
    for (const p of projects) {
      const r = derive(p.data);
      const source = JSON.parse(
        readFileSync(`discovery/${p.source_id}.json`, "utf8"),
      );
      const row = source.sheets.find(
        (s: any) => s.properties.title === "Takeoff",
      ).data[0].rowData[0].values;
      assert.equal(
        r.frameTakeoff.reduce((n, r) => n + r.count, 0),
        Number(row[2].formattedValue),
        p.name + " frames",
      );
      assert.equal(
        r.doorTakeoff.reduce((n, r) => n + r.count, 0),
        Number(row[6].formattedValue),
        p.name + " doors",
      );
      assert.equal(
        r.hardwareTakeoff.reduce((n, r) => n + r.count, 0),
        Number(row[11].formattedValue),
        p.name + " hardware",
      );
    }
  },
);
test(
  "real source part names and grouped takeoffs match",
  { skip: !existsSync("local-data/seed.json") },
  () => {
    const { projects } = JSON.parse(
      readFileSync("local-data/seed.json", "utf8"),
    ) as { projects: Project[] };
    for (const p of projects) {
      const d = derive(p.data);
      const src = JSON.parse(
        readFileSync(`discovery/${p.source_id}.json`, "utf8"),
      );
      const rows = (s: string) =>
        src.sheets
          .find((sh: any) => sh.properties.title === s)
          .data[0].rowData.map((r: any) =>
            (r.values || []).map((c: any) => c.formattedValue || ""),
          );
      for (const [tab, list, index] of [
        ["Frames", d.frames, 17],
        ["Doors", d.doors, 13],
      ] as const) {
        for (const row of rows(tab)
          .slice(1)
          .filter((r: string[]) => r[0] && r[0] !== "0")) {
          const actual = list.find((r) => r.name === row[0]);
          assert.equal(
            actual?.partName,
            row[index],
            `${p.name} ${tab} ${row[0]}`,
          );
        }
      }
    }
  },
);
import { parseTable } from "../lib/tabular";
test("pasted CSV preserves quoted components, newlines and empty cells", () => {
  assert.deepEqual(
    parseTable(
      'name,component,qty\r\n101,"Hinge, 26D",3\r\n102,"Multi\nline",',
    ),
    [
      ["name", "component", "qty"],
      ["101", "Hinge, 26D", "3"],
      ["102", "Multi\nline", ""],
    ],
  );
  assert.deepEqual(parseTable("name\twidth\n101\t3/0"), [
    ["name", "width"],
    ["101", "3/0"],
  ]);
  assert.throws(() => parseTable('a,b\n"unclosed'));
});
