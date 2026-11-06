import test from "node:test";
import assert from "node:assert/strict";
import { inventoryGeometricSchedule, printedScheduleDimension } from "../lib/drawing-takeoff/schedule-table";
import { compareOpeningBenchmark } from "../lib/drawing-takeoff/benchmark";
import { visualScheduleSections, ownedVisualRows, mergeVisualScheduleRows } from "../lib/drawing-takeoff/visual-schedule";
import type { TextBox } from "../lib/drawing-takeoff/indexing";
const box=(text:string,x:number,y:number,width=30,height=10):TextBox=>({text,x,y,width,height});
function page(){return {page:7,width:800,height:1000,boxes:[box('DOOR SCHEDULE',30,10,200),box('MARK',30,50),box('WIDTH',110,50),box('HEIGHT',190,50),box('DOOR TYPE',270,50),box('HARDWARE SET',370,50,80),box('REMARKS',500,50,60),
 box('B-01',30,100),box(`3'-0"`,110,100),box(`7'-0"`,190,100),box('A',270,100),box('H1',390,100),box('Existing frame',500,100,60),
 box('B-02',30,120),box(`(2)3'-0"`,110,120),box(`7'-0"`,190,120),box('B',270,120),box('H2',390,120),box('Insulated',500,120,60),
 box('1',30,500),box(`8'-0"`,110,600),box('2026',770,100)]};}

test('geometric schedule uses columns and rows despite scrambled PDF drawing order',()=>{
 const p=page();p.boxes.reverse();const rows=inventoryGeometricSchedule(p);
 assert.deepEqual(rows.map(r=>r.mark),['B-01','B-02']);
 assert.equal(rows[0].width,`3'-0"`);assert.equal(rows[0].height,`7'-0"`);
 assert.equal(rows[0].hardwareGroup,'H1');assert.equal(rows[0].doorType,'A');
 assert.equal(rows[0].scheduleNotes,'Existing frame');
 assert.equal(rows[1].width,`6'-0"`);assert.equal(rows[1].leafCount,'2');assert.equal(rows[1].quantity,'1');
});
test('printed dimensions distinguish assembly width and pair leaves',()=>{
 assert.deepEqual(printedScheduleDimension(`(2) 2'-8"`),{value:`5'-4"`,leaves:2,leaf:`2'-8"`});
 assert.equal(printedScheduleDimension(`3'-12"`),null);
 assert.equal(printedScheduleDimension(`2'-2 1/2"`)?.value,`2'-2 1/2"`);
});
test('outlined schedule body still gets bounded image strips with repeated headers',()=>{
 const p=page();p.boxes=p.boxes.filter(b=>b.y<80);const sections=visualScheduleSections(p);
 assert.ok(sections.length>=4);assert.equal(sections[0].ownerTop,0);
 assert.ok(sections[1].ownerTop>0);assert.ok(sections.every(s=>s.crop.height<=600));
 assert.ok(sections.every(s=>s.headerCrop===sections[0].headerCrop));
 assert.match(sections[0].columnGuide,/hardwareGroup/);
});
test('overlap ownership accepts each row center only in its assigned strip',()=>{
 const section=visualScheduleSections(page())[1];
 const base={mark:'B-01',room:'',width:'',height:'',handing:'',doorType:'',frameType:'',wallType:'',hardwareGroup:'',fireRating:'',quantity:'1',sourcePage:1,evidence:'printed row',confidence:.9,doorMaterial:'',doorFinish:'',doorThickness:'',frameMaterial:'',frameFinish:'',leafCount:'',leafWidth:'',scheduleNotes:'',markedOut:false,scopeEvidence:''};
 const rows=ownedVisualRows({openings:[{...base,rowCenterY:0},{...base,rowCenterY:500},{...base,rowCenterY:999}]},section);
 assert.equal(rows.length,1);assert.equal(rows[0].rowCenterY,500);
});
test('benchmark preserves missing, extra, duplicate and unconfirmed hand distinctions',()=>{
 const result=compareOpeningBenchmark([{mark:'A1',width:'3/0',height:'7/0',handing:'R',sourceCells:{width:'Frames!E4'}},{mark:'A2',handing:'RIA'}],
 [{mark:'a1',width:`3'-0"`,height:`7'-0"`,handing:'RH'},{mark:'EXTRA'},{mark:'DUP'},{mark:'DUP'}]);
 assert.equal(result.matchedIdentifiers,1);assert.equal(result.fields.width.matched,1);assert.equal(result.fields.handing.matched,1);
 assert.equal(result.fields.handing.unknownExpected,1);assert.deepEqual(result.missingIdentifiers,['A2']);
 assert.deepEqual(result.duplicateIdentifiers,['DUP']);assert.deepEqual(result.extraIdentifiers,['EXTRA','DUP']);
});

test('overlap merges repeated rows, retains markup and withholds conflicting cells',()=>{
 const rows=mergeVisualScheduleRows([{mark:'A1',sourcePage:7,width:'3/0',height:'7/0',hardwareGroup:'H1',doorMaterial:'',markedOut:true},
  {mark:'A1',sourcePage:7,width:'3/0',height:'7/0',hardwareGroup:'H2',doorMaterial:'HM',markedOut:false}]);
 assert.equal(rows.length,1);assert.equal(rows[0].hardwareGroup,'');assert.equal(rows[0].doorMaterial,'HM');assert.equal(rows[0].markedOut,true);
 assert.match(String((rows[0] as Record<string,unknown>).scheduleNotes),/hardwareGroup: H1 \/ H2/);
 assert.equal(mergeVisualScheduleRows([{mark:'A1',sourcePage:7},{mark:'A1',sourcePage:8}]).length,2);
});
