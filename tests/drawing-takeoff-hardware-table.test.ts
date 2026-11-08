import test from 'node:test';
import assert from 'node:assert/strict';
import {readHardwareTable} from '../lib/drawing-takeoff/hardware-table';
import {hardwareHeadings} from '../lib/drawing-takeoff/hardware-headings';
import {confirmedPageKinds,groundedScheduleKinds,hardwareSections,type PageIndex,type TextBox} from '../lib/drawing-takeoff/indexing';
import {inventoryHardwareRows} from '../lib/drawing-takeoff/hardware-evidence';
import {taskIdsWithinBudget} from '../lib/drawing-takeoff/task-budget';
import {taskMatchesFindings} from '../lib/drawing-takeoff/plan-task-policy';
import {compareOpeningBenchmark} from '../lib/drawing-takeoff/benchmark';

const box=(text:string,x:number,y:number,width=25):TextBox=>({text,x,y,width,height:10});
function fixture(){
 const boxes=[box('Hardware Group No. AL01 (ENTRY)',100,20,230),box('QTY',100,50),box('DESCRIPTION',140,50,75),box('CATALOG NUMBER',250,50,100),box('FINISH',380,50,40),box('MFR',430,50),
 box('3 EA',100,70),box('HINGE',140,70),box('MODEL 100',250,70,75),box('630',380,70),box('ABC',430,70),
 box('1',100,90),box('OPERATOR',140,90,75),box('DRIVE 500',250,90,75),box('CHAIN HOIST',250,104,75),box('689',380,90),box('XYZ',430,90),
 box('1 EA',100,120),box('PULL',140,120),box('P200',250,120),box('630 ABC',380,120,80),
 box('1 EA',100,140),box('CONTACT',140,140),box('C900',250,140),
 box('Hardware Group No. 02 (OFFICE)',100,180,230),box('QTY',100,210),box('DESCRIPTION',140,210,75),box('CATALOG NUMBER',250,210,100),box('FINISH',380,210,40),box('MFR',430,210),
 box('2 PR',100,230),box('HINGE',140,230),box('H200',250,230),box('630',380,230),box('ABC',430,230),
 box('999',600,90),box('UNRELATED DRAWING',650,90,150)];
 return {page:3,width:1000,height:400,rotation:0,boxes,text:boxes.map(b=>b.text).join(' '),lines:boxes.map(b=>b.text)} as PageIndex;
}
test('hardware group headings retain numeric and alphanumeric IDs without matching general notes',()=>{
 assert.deepEqual(hardwareHeadings('Hardware Group No. AL01 (ENTRY) SET #02 Hardware Set HW-3A HARDWARE GROUP FOOTNOTES').map(h=>h.identifier),['AL01','02','HW-3A']);
 const text='Hardware Group No. AL01 (ENTRY) 3 EA HINGE H100 ABC Hardware Group No. 02 (OFFICE) 1 EA LOCK L200 XYZ';
 assert.equal(hardwareSections(text).length,2);
 assert.deepEqual(inventoryHardwareRows(text,3).map(r=>[r.group,r.quantity]),[['AL01',3],['02',1]]);
 assert.ok(groundedScheduleKinds({...fixture(),text},[]).includes('hardware'),'literal groups survive an omitted visual category');
 assert.deepEqual(confirmedPageKinds(['hardware'],'Accessible coat hook and door hardware mounting heights'),[]);
 assert.deepEqual(confirmedPageKinds(['hardware'],'Hardware Schedule groups with hinges and locks'),['hardware']);
});
test('hardware columns preserve quantities, pairs, wrapped models, merged brand cells and unspecified manufacturers',()=>{
 const result=readHardwareTable(fixture())!;
 assert.equal(result.complete,true);assert.equal(result.hardwareGroups.length,5);
 assert.deepEqual(result.hardwareGroups.map(r=>[r.group,r.quantity]),[['AL01',3],['AL01',1],['AL01',1],['AL01',1],['02',2]]);
 assert.equal(result.hardwareGroups[0].component,'HINGE MODEL 100 630');
 assert.equal(result.hardwareGroups[1].component,'OPERATOR DRIVE 500 CHAIN HOIST 689');
 assert.equal(result.hardwareGroups[2].brand,'ABC');assert.equal(result.hardwareGroups[2].component,'PULL P200 630');
 assert.equal(result.hardwareGroups[3].brand,'');assert.equal(result.hardwareGroups[3].quantityKnown,true);
 assert.equal(result.hardwareGroups[4].component,'[PR] HINGE H200 630');
 assert.ok(result.uncertainties.some(note=>note.includes('does not specify a separate manufacturer')));
 assert.ok(result.hardwareGroups.every(r=>r.sourcePage===3));
});
test('ambiguous headers and quantity-only rows cannot silently become a complete source table',()=>{
 const page=fixture();page.boxes.push(box('MFR',450,50));
 assert.equal(readHardwareTable(page)!.complete,false);
 const missing=fixture();missing.boxes=missing.boxes.filter(b=>b.text!=='OPERATOR');
 const result=readHardwareTable(missing)!;assert.equal(result.complete,false);assert.equal(result.hardwareGroups.length,4);
 assert.equal(readHardwareTable({...fixture(),boxes:[]}),null);
});
test('native hardware tables run at zero paid budget and keep the hardware page category',()=>{
 const input={pages:[3],hardwareTableArtifact:'source-table.json'};
 assert.deepEqual(taskIdsWithinBudget([{task_key:'native-table',kind:'hardware',input}],new Map([['native-table','id']]),0),['id']);
 assert.equal(taskMatchesFindings({kind:'hardware',input},[{page:3,section:'hardware'}]),true);
});
test('benchmark numeric group formatting does not conceal a missing group or merge alphanumeric IDs',()=>{
 const result=compareOpeningBenchmark([{mark:'A',hardwareGroup:'1.0'},{mark:'B',hardwareGroup:'AL01'},{mark:'C',hardwareGroup:'2'}],
 [{mark:'A',hardwareGroup:'01'},{mark:'B',hardwareGroup:'AL1'},{mark:'C',hardwareGroup:''}]);
 assert.deepEqual(result.fields.hardwareGroup,{comparable:3,matched:1,missing:1,mismatched:1,unknownExpected:0});
});
