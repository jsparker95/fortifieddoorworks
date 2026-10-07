import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareProjects,
  projectSortColumns,
  type ProjectSortColumnKey,
  type SortableProject,
} from "../lib/project-sorting";

const rows: SortableProject[] = [
  {
    id: "z",
    name: "Zulu project",
    building: "Intermountain Utah Valley Sports Performance Center",
    contractor_id: "z",
    start_date: null,
    pm: "Zelda",
    jobsite: "",
    scope: "",
    cuts: "",
    status: "On hold",
    source_id: null,
    data: {} as SortableProject["data"],
    version: 1,
    updated_at: "2026-01-03",
    computed: { frames: Array(12).fill({}), progress: 100 },
  },
  {
    id: "i",
    name: "Independent project",
    building: "",
    contractor_id: null,
    start_date: null,
    pm: "",
    jobsite: "",
    scope: "",
    cuts: "",
    status: "In progress",
    source_id: null,
    data: {} as SortableProject["data"],
    version: 1,
    updated_at: "2026-01-02",
    computed: { frames: Array(3).fill({}), progress: 33 },
  },
  {
    id: "d",
    name: "Alpha project",
    building: "DWORQ",
    contractor_id: "a",
    start_date: null,
    pm: "Ada",
    jobsite: "",
    scope: "",
    cuts: "",
    status: "Complete",
    source_id: null,
    data: {} as SortableProject["data"],
    version: 1,
    updated_at: "2026-01-01",
    computed: { frames: Array(1).fill({}), progress: 0 },
  },
];

const contractors = new Map([
  ["z", "Zeta Builders"],
  ["a", "Able Construction"],
]);

const expectedAscending: Record<ProjectSortColumnKey, string[]> = {
  name: ["d", "i", "z"],
  building: ["d", "i", "z"],
  contractor: ["d", "i", "z"],
  pm: ["d", "i", "z"],
  status: ["d", "i", "z"],
  openings: ["d", "i", "z"],
  progress: ["d", "i", "z"],
};

test("every displayed project column sorts by its displayed values ascending and descending", () => {
  assert.deepEqual(
    projectSortColumns.map(({ key }) => key),
    Object.keys(expectedAscending),
  );

  for (const { key } of projectSortColumns) {
    const ascending = [...rows]
      .sort((a, b) => compareProjects(a, b, key, "asc", contractors))
      .map(({ id }) => id);
    const descending = [...rows]
      .sort((a, b) => compareProjects(a, b, key, "desc", contractors))
      .map(({ id }) => id);
    assert.deepEqual(ascending, expectedAscending[key], `${key} ascending`);
    assert.deepEqual(
      descending,
      [...expectedAscending[key]].reverse(),
      `${key} descending`,
    );
  }
});
