import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { findPageContent, groundedScheduleKinds, inventoryOpeningRows, reconcileInventoriedRows } from "../lib/drawing-takeoff/indexing";
import { displayedTextBox } from "../lib/drawing-takeoff/text-geometry";
import { mapAnalysisToPhaseRows } from "../lib/drawing-takeoff/phase-import";
import { scheduleSearchDescription } from "../lib/drawing-takeoff/search-description";

const fixture = () => JSON.parse(fs.readFileSync("tests/fixtures/schedules/approved-23.json", "utf8"));

test("vertical text headings use displayed corners instead of a horizontal width", () => {
  assert.deepEqual(displayedTextBox({str:"MARK",width:50,height:12,transform:[0,12,-12,0,100,200]},[1,0,0,-1,0,1000]),
    {text:"MARK",x:88,y:750,width:12,height:50});
  assert.deepEqual(displayedTextBox({str:"MARK",width:50,height:12,transform:[12,0,0,12,100,200]},[1,0,0,-1,0,1000]),
    {text:"MARK",x:100,y:788,width:50,height:12});
  assert.deepEqual(displayedTextBox({str:"MARK",width:50,height:12,transform:[12,0,0,12,100,200]},[2,0,0,-2,0,2000]),
    {text:"MARK",x:200,y:1576,width:100,height:24});
});

test("rotated compound schedule columns preserve all 13 rows and printed blank cells", () => {
  const rows = inventoryOpeningRows(fixture());
  assert.equal(rows.length,13);
  assert.deepEqual(rows.map(r=>r.doorType),["6","6","6","8","8","8","8","5","5","2","2","2","2"]);
  for(const row of rows){
    const overhead=Number(row.mark)>=10;
    assert.equal(row.doorMaterial,overhead?"STEEL":"METAL");
    assert.equal(row.doorFinish,"PAINTED");
    assert.equal(row.frameMaterial,overhead?"MANUFACTURER":"HOLLOW METAL");
    assert.equal(row.frameFinish,overhead?"MANUFACTURER":"PAINTED");
    assert.equal(row.doorThickness,overhead?'0"':'1 3/4"');
    assert.equal(row.width,overhead?`16'-0"`:Number(row.mark)>=8?`6'-0"`:`3'-0"`);
    assert.equal(row.height,overhead?`16'-0"`:`7'-0"`);
    assert.equal(row.hardwareGroup,"");assert.equal(row.fireRating,"");
    const enriched=reconcileInventoriedRows([row],[{...row,doorType:"WRONG",hardwareGroup:"8",fireRating:"90 MIN"}])[0];
    assert.equal(enriched.doorType,row.doorType);assert.equal(enriched.hardwareGroup,"");assert.equal(enriched.fireRating,"");
  }
  const imported=mapAnalysisToPhaseRows("doc",{openings:rows});
  assert.equal(imported.openings?.[0].frameFinish,"PAINTED");
});

test("numbered DOORS elevations survive a missed visual type classification", () => {
  const page=fixture();
  assert.deepEqual(groundedScheduleKinds(page),["door","types"]);
  assert.ok(findPageContent(page).kinds.includes("types"));
  page.boxes=page.boxes.filter((b:{text:string})=>b.text!=="D1 DOORS");
  assert.deepEqual(groundedScheduleKinds(page),["door"]);
});

test("literal concrete wall schedules are retained without treating references as tables",()=>{
  const base={page:27,width:1000,height:800,rotation:0,boxes:[],lines:[]};
  assert.deepEqual(groundedScheduleKinds({...base,text:'CONCRETE WALL SCHEDULE WALL MARK THICKNESS CW-8A 8" #5 16" O.C.'}),["walls"]);
  assert.deepEqual(groundedScheduleKinds({...base,text:'SEE CONCRETE WALL SCHEDULE ON SHEET S004'}),[]);
});

test("document descriptions distinguish absent hardware from a failed extraction",()=>{
  const description=scheduleSearchDescription([{kind:"door",pages:[23],description:"13 printed rows."},{kind:"frame",pages:[23],description:"Numbered elevations."}]);
  assert.match(description,/Door\/opening schedules on PDF pages 23/);
  assert.match(description,/No hardware component schedule was confirmed/);
  assert.doesNotMatch(description,/No door\/frame type/);
});
