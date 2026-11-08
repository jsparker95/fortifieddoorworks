import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts, moveTo, lineTo, stroke, setLineWidth } from "pdf-lib";
import { detectVectorDoors, handFromVector, type VectorDoor } from "../lib/drawing-takeoff/vector-geometry";
import { analyzeVectorPlan, completePlanContext } from "../lib/drawing-takeoff/vector-pdf";
import { planRegions, referenceHand, regionReferences } from "../lib/drawing-takeoff/vector-regions";
import { taskIdsWithinBudget } from "../lib/drawing-takeoff/task-budget";
import { combineExtractionOutputs, sanitizeExtraction } from "../lib/drawing-takeoff/extraction-schema";

const door: VectorDoor = { hinge: { x: 100, y: 100 }, jamb: { x: 130, y: 100 }, leaf: { x: 100, y: 130 }, radius: 30, paired: false };
const arc = (d: VectorDoor) => ({ points: Array.from({ length: 13 }, (_, i) => {
  const t = i * Math.PI / 24;
  return { x: d.hinge.x + d.radius * Math.cos(t), y: d.hinge.y + d.radius * Math.sin(t) };
}) });

test("a circular swing requires a radial leaf and preserves the opposite closed jamb", () => {
  assert.equal(detectVectorDoors([arc(door)]).length, 0);
  const found = detectVectorDoors([arc(door), { points: [door.hinge, door.leaf] }]);
  assert.equal(found.length, 1);
  assert.ok(Math.hypot(found[0].hinge.x - 100, found[0].hinge.y - 100) < 0.001);
  assert.ok(Math.hypot(found[0].jamb.x - 130, found[0].jamb.y - 100) < 0.001);
  // An arc with radial lines at both ends does not identify the open leaf.
  assert.equal(detectVectorDoors([arc(door), { points: [door.hinge, door.leaf] }, { points: [door.hinge, door.jamb] }]).length, 0);
  const shuffled = arc(door); [shuffled.points[3], shuffled.points[8]] = [shuffled.points[8], shuffled.points[3]];
  assert.equal(detectVectorDoors([shuffled, { points: [door.hinge, door.leaf] }]).length, 0);
});

test("separately stroked CAD arc segments are joined without crossing branches",()=>{
  const points=arc(door).points;
  const fragments=points.slice(1).map((b,i)=>({points:[points[i],b]}));
  const found=detectVectorDoors([...fragments,{points:[door.hinge,door.leaf]}]);
  assert.equal(found.length,1);
  assert.ok(Math.hypot(found[0].hinge.x-100,found[0].hinge.y-100)<0.001);
  assert.equal(detectVectorDoors(fragments).length,0);
});

test('45-degree swings require a matching leaf and retain ambiguity guards',()=>{
 const partial={points:arc(door).points.slice(0,7)},leaf=partial.points.at(-1)!;
 const found=detectVectorDoors([partial,{points:[door.hinge,leaf]}]);assert.equal(found.length,1);
 assert.ok(Math.hypot(found[0].jamb.x-door.jamb.x,found[0].jamb.y-door.jamb.y)<.001);
 assert.ok(Math.hypot(found[0].leaf.x-leaf.x,found[0].leaf.y-leaf.y)<.001);
 assert.equal(detectVectorDoors([partial]).length,0);
 assert.equal(detectVectorDoors([partial,{points:[door.hinge,leaf]},{points:[door.hinge,door.jamb]}]).length,0);
 const fragments=partial.points.slice(1).map((b,i)=>({points:[partial.points[i],b]}));
 assert.equal(detectVectorDoors([...fragments,{points:[door.hinge,leaf]}]).length,1);
 const tiny={points:Array.from({length:7},(_,i)=>({x:100+30*Math.cos(i*Math.PI/36),y:100+30*Math.sin(i*Math.PI/36)}))};
 assert.equal(detectVectorDoors([tiny,{points:[door.hinge,tiny.points.at(-1)!]}]).length,0);
});

test("traditional hands are invariant under rotation and use the reference viewpoint", () => {
  for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
    const rotate = (p: { x: number; y: number }) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) });
    for (const mirror of [1, -1]) {
      const d = { ...door, hinge: rotate(door.hinge), jamb: rotate({ x: 100 + mirror * 30, y: 100 }), leaf: rotate(door.leaf) };
      assert.equal(handFromVector(d, rotate({ x: 0, y: -1 }))?.handing, mirror === 1 ? "RH" : "LH");
      assert.equal(handFromVector(d, rotate({ x: 0, y: 1 }))?.handing, mirror === 1 ? "LHR" : "RHR");
    }
  }
  assert.equal(handFromVector({ ...door, paired: true }, { x: 0, y: -1 }), null);
  assert.equal(handFromVector(door, { x: 0, y: 0 }), null);
  assert.equal(handFromVector(door, { x: 1, y: 0 }), null);
});

test("shared latch jambs identify paired leaves", () => {
  const other = { ...door, hinge: { x: 160, y: 100 }, leaf: { x: 160, y: 130 } };
  const otherArc = { points: arc(door).points.map(p => ({ x: 260 - p.x, y: p.y })) };
  const found = detectVectorDoors([arc(door), otherArc, { points: [door.hinge, door.leaf] }, { points: [other.hinge, other.leaf] }]);
  assert.equal(found.length, 2);
  assert.ok(found.every(d => d.paired));
});

test("detail titles never establish the whole-plan reference side", () => {
  assert.equal(completePlanContext(["OVERALL FLOOR PLAN", "SEE PLAN ENLARGEMENT"]), true);
  assert.equal(completePlanContext(["FLOOR PLAN", "PLAN ENLARGEMENTS"]), false);
  assert.equal(completePlanContext(["BATHROOM PLANS"]), false);
  assert.equal(completePlanContext(["LEVEL 2 PLAN"]), true);
});

test("free vector sections are retained beyond the paid task cap", () => {
  const tasks = Array.from({ length: 6 }, (_, n) => ({ task_key: String(n), kind: n < 3 ? "doors" : "plan", input: { pages: [2], ...(n >= 3 ? { vectorArtifact: "cached.json" } : {}) } }));
  const ids = new Map(tasks.map(t => [t.task_key, `id-${t.task_key}`]));
  assert.deepEqual(taskIdsWithinBudget(tasks, ids, 1), ["id-0", "id-3", "id-4", "id-5"]);
  ids.delete("0");
  assert.deepEqual(taskIdsWithinBudget(tasks, ids, 1), ["id-1", "id-3", "id-4", "id-5"]);
});

test("a drawing without readable marks remains eligible for visual discovery",async()=>{
  const pdf=await PDFDocument.create(),page=pdf.addPage([400,400]);
  page.pushOperators(setLineWidth(2));
  const points=arc(door).points;
  page.pushOperators(moveTo(points[0].x,400-points[0].y),...points.slice(1).map(p=>lineTo(p.x,400-p.y)),stroke(),
    moveTo(door.hinge.x,400-door.hinge.y),lineTo(door.leaf.x,400-door.leaf.y),stroke());
  const result=await analyzeVectorPlan(await pdf.save(),{page:1,lines:["FLOOR PLAN"]},[]);
  assert.equal(result.geometryCount,1);assert.equal(result.supported,false);assert.deepEqual(result.observations,[]);
});

test("an unbounded corridor label cannot justify handing", () => {
  const pixels = new Uint8ClampedArray(200 * 200 * 4).fill(255);
  const map = planRegions(pixels, 200, 200, 1, [door], false);
  const refs = regionReferences(map, [{ text: "CORRIDOR 1", x: 90, y: 70, width: 30, height: 8 }], [door], false);
  assert.equal(refs.labels.length, 0);
  assert.equal(referenceHand(map, refs, door), null);
});

test("native PDF paths, rendered boundaries and corridor text produce a grounded cited hand", async () => {
 for(const corridorLabel of ["CORRIDOR 1","ENTRY-CORRIDORS"]){
  const pdf = await PDFDocument.create(), page = pdf.addPage([1000, 1000]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.pushOperators(setLineWidth(2));
  const line = (x1: number, y1: number, x2: number, y2: number) => page.pushOperators(moveTo(x1, 1000-y1), lineTo(x2, 1000-y2), stroke());
  line(100, 180, 500, 180); line(500, 180, 500, 400); line(500, 400, 100, 400); line(100, 400, 100, 180);
  line(100, 250, 300, 250); line(330, 250, 500, 250); line(300, 250, 300, 280);
  const points = arc({ ...door, hinge: { x: 300, y: 250 } }).points;
  page.pushOperators(moveTo(points[0].x, 1000-points[0].y), ...points.slice(1).map(p => lineTo(p.x, 1000-p.y)), stroke());
  page.drawText(corridorLabel, { x: 150, y: 780, size: 10, font });
  page.drawText("BUNK", { x: 150, y: 650, size: 10, font });
  page.drawText("127", { x: 310, y: 759, size: 6, font });
  const bytes = await pdf.save();
  const result = await analyzeVectorPlan(bytes, { page: 16, lines: ["OVERALL FLOOR PLAN"] }, ["127"]);
  assert.equal(result.supported, true);
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].handing, "RH");
  const safe = sanitizeExtraction({ ...combineExtractionOutputs(null, null), doorwayObservations: result.observations }, new Set([16]));
  assert.equal(safe.doorwayObservations[0].sourcePage, 16);
  assert.equal(safe.doorwayObservations[0].handing, "RH");
  const detail = await analyzeVectorPlan(bytes, { page: 17, lines: ["FLOOR PLAN", "PLAN ENLARGEMENTS"] }, ["127"]);
  assert.equal(detail.observations[0].handing, "");
 }
});


test("spatial leaf lookup preserves detections in a dense drawing and across grid boundaries", () => {
 const noise = Array.from({length:10000},(_,i)=>({points:[{x:1000+i*40,y:1000},{x:1010+i*40,y:1000}]}));
 for(const offset of [0,-110,27]) {
  const shifted={...door,hinge:{x:door.hinge.x+offset,y:door.hinge.y+offset},jamb:{x:door.jamb.x+offset,y:door.jamb.y+offset},leaf:{x:door.leaf.x+offset,y:door.leaf.y+offset}};
  const found=detectVectorDoors([...noise,arc(shifted),{points:[shifted.leaf,shifted.hinge]}]);
  assert.equal(found.length,1);
  assert.ok(Math.hypot(found[0].hinge.x-shifted.hinge.x,found[0].hinge.y-shifted.hinge.y)<0.001);
 }
});

test('a detail view needs an exact visible unit card and schedule entry before assigning its entry hand',async()=>{
 const {rgb}=await import('pdf-lib');
 const pdf=await PDFDocument.create(),page=pdf.addPage([1000,1000]),font=await pdf.embedFont(StandardFonts.Helvetica);
 const line=(x1:number,y1:number,x2:number,y2:number)=>page.pushOperators(moveTo(x1,1000-y1),lineTo(x2,1000-y2),stroke());
 page.pushOperators(setLineWidth(1));
 line(180,200,480,200);line(480,200,480,500);line(480,500,340,500);line(300,500,180,500);line(180,500,180,200);
 line(300,500,300,460);
 const points=Array.from({length:13},(_,i)=>({x:300+40*Math.cos(i*Math.PI/24),y:500-40*Math.sin(i*Math.PI/24)}));
 page.pushOperators(moveTo(points[0].x,1000-points[0].y),...points.slice(1).map(p=>lineTo(p.x,1000-p.y)),stroke());
 line(285,260,355,260);line(355,260,355,345);line(355,345,285,345);line(285,345,285,260);
 const boxes=[['STUDIO',270],['KING',290],['U101',330]].map(([value,y])=>{
  const text=String(value),width=font.widthOfTextAtSize(text,10),x=320-width/2;
  page.drawText(text,{x,y:1000-Number(y)-10,size:10,font});return {text,x,y:Number(y),width,height:10};
 });
 page.drawText('U101',{x:310,y:1000-485-6,size:6,font});
 const index={page:2,lines:['PLAN ENLARGEMENTS'],boxes},entry={mark:'U101',description:'Guestroom entry - typical',profileCode:'A',sourceSchedulePage:9};
 const bytes=await pdf.save();
 const noContext=await analyzeVectorPlan(bytes,index,['U101']);assert.equal(noContext.observations[0].handing,'');
 const supported=await analyzeVectorPlan(bytes,index,['U101'],[],{entryRoomContexts:[entry]});
 assert.equal(supported.observations.length,1);assert.equal(supported.observations[0].handing,'LH',JSON.stringify(supported.decodeEvidence));
 assert.match(supported.observations[0].handingEvidence,/outside guestroom U101/);assert.match(supported.observations[0].handingEvidence,/PDF page 9/);
 const wrongUnit=await analyzeVectorPlan(bytes,index,['U101'],[],{entryRoomContexts:[{...entry,mark:'U102'}]});
 assert.equal(wrongUnit.observations[0].handing,'');
 const covered=await PDFDocument.load(bytes);covered.getPage(0).drawRectangle({x:240,y:1000-360,width:160,height:120,color:rgb(1,1,1)});
 const hidden=await analyzeVectorPlan(await covered.save(),index,['U101'],[],{entryRoomContexts:[entry]});
 assert.equal(hidden.observations[0].handing,'','a hidden frame in the path list is not source proof');
});

test('current native evidence wins over obsolete cached confidence without changing confidence values',async()=>{
 const {deduplicateDoors}=await import('../lib/drawing-takeoff/geometry');
 const base={page:1,box:{x:.1,y:.1,width:.1,height:.1},mark:'A1',tileId:'page',evidence:'Source drawing'};
 const result=deduplicateDoors([{...base,id:'old',confidence:.99},{...base,id:'current',confidence:.8,sourcePriority:1}]);
 assert.equal(result.doors[0].id,'current');assert.equal(result.doors[0].confidence,.8);assert.equal(result.suppressed[0].id,'old');
});
