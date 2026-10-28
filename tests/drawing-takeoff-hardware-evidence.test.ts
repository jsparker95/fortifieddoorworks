import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inventoryHardwareRows, reconcileHardwareRows } from '../lib/drawing-takeoff/hardware-evidence';
import { mapAnalysisToPhaseRows, mergePhaseCandidateRows } from '../lib/drawing-takeoff/phase-import';

for (const [page,count,sets] of [[13,98,15],[27,100,16]]) test(`printed hardware page ${page} preserves every quantified part and full model`,()=>{
 const source=JSON.parse(fs.readFileSync(`tests/fixtures/schedules/rockingham-${page}.json`,'utf8'));
 const rows=inventoryHardwareRows(source.text,page);
 assert.equal(rows.length,count);
 assert.equal(new Set(rows.map(row=>row.group)).size,sets);
 const cylinder=rows.find(row=>row.group==='01')!;
 assert.match(cylinder.component,/CR3000-200- CMK 626/);
 assert.match(cylinder.component,/BALANCE OF HARDWARE BY OTHERS/);
 assert.equal(cylinder.quantity,1);
 assert.equal(cylinder.brand,'CORBIN RUSSWIN');
 const hinge=rows.find(row=>row.group==='02' && row.component.startsWith('HINGE'))!;
 assert.match(hinge.component,/TA2714 NRP.*US26D/);
 assert.equal(hinge.quantity,3);
 assert.equal(hinge.brand,'McKINNEY');
 assert.ok(rows.every(row=>row.sourcePage===page));
});

test('literal hardware replaces generic model labels and invented scope quantities',()=>{
 const text='SET #01 (ENTRY) 1 EA CYLINDER CR3000-200- CMK 626 (CY-1) CORBIN RUSSWIN *BALANCE OF HARDWARE BY OTHERS';
 const generic={group:'SET #01',name:'Entry',component:'CYLINDER',brand:'CORBIN RUSSWIN',quantity:1,frameModification:'',doorModification:'',doorPrep:'',sourcePage:13,evidence:'1 EA CYLINDER CR3000-200- CMK 626 (CY-1) CORBIN RUSSWIN',confidence:1};
 const fixed=reconcileHardwareRows(text,13,[generic,{...generic,component:'HARDWARE',brand:'BY OTHERS'}]);
 assert.equal(fixed.length,1);
 const prior=mapAnalysisToPhaseRows('doc',{hardwareGroups:[{...generic,group:'01'}]}).hardware![0];
 const incoming=mapAnalysisToPhaseRows('doc',{hardwareGroups:fixed}).hardware!;
 const merged=mergePhaseCandidateRows([prior],incoming);
 assert.equal(merged.length,1);
 assert.equal(merged[0].id,prior.id);
 assert.match(String(merged[0].component),/CR3000/);
 const reviewed={...prior,reviewState:'human-reviewed',component:'User approved cylinder'};
 assert.deepEqual(mergePhaseCandidateRows([reviewed],incoming),[reviewed]);
 const unreadable=reconcileHardwareRows('Unquantified scanned text',13,[generic]);
 assert.deepEqual(unreadable,[generic]);
});
