import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyData } from "../lib/types";
import { submittalOpenings } from "../lib/submittal";

function sample() {
  const data = emptyData();
  data.walls = [{ id: "wall", name: "W1", size: "575", brand: "Frame Co" }];
  data.doorTypes = [{ id: "door", name: "D1", brand: "Door Co", material: "Wood", window: "Vision lite", fire: "20 min" }];
  data.hardware = [
    { id: "hinge", group: "A", qty: 3, brand: "Hinge Co", component: "Ball bearing hinge", veSelected: false },
    { id: "lock", group: "A", qty: 1, brand: "Lock Co", component: "Mortise lock", veSelected: true, veBrand: "Alt Co", veComponent: "Full mortise lock set" },
  ];
  data.openings = [
    { id: "opening-stable-id", name: "101", width: "3/0", height: "7/0", wall: "W1", handing: "L", frameType: "Welded", doorType: "D1", group: "A" },
    { id: "deleted", name: "102", width: "3/0", height: "7/0", wall: "NA", handing: "R", doorType: "NA", group: "", deleted: true },
  ];
  return data;
}

test("submittal maps each active opening to frame, door, handing, fire, and selected hardware", () => {
  const [opening] = submittalOpenings(sample());
  assert.equal(opening.openingId, "opening-stable-id");
  assert.equal(opening.name, "101");
  assert.deepEqual(opening.items, [
    `1ea. Frame Co 3'-0" x 7'-0" x 5.75" HM Welded Frame (L)`,
    "1ea. Door Co 3'-0\" x 7'-0\" Wood Vision lite (L) 20 min",
    "3ea. Hinge Co Ball bearing hinge",
    "1ea. Alt Co Full mortise lock set",
  ]);
  assert.equal(submittalOpenings(sample()).length, 1);
});

test("submittal marks frame and door as provided by others", () => {
  const data = sample();
  data.openings[0].wall = "NA";
  data.openings[0].doorType = "NA";
  assert.deepEqual(submittalOpenings(data)[0].items, [
    "Frame provided by others",
    "Door provided by others",
    "3ea. Hinge Co Ball bearing hinge",
    "1ea. Alt Co Full mortise lock set",
  ]);
});
