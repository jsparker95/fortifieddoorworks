import test from 'node:test';
import assert from 'node:assert/strict';
import {hardwareImageSections,normalizeHardwareImage,mergeHardwareImageReads} from '../lib/drawing-takeoff/hardware-sections';
import {findPageContent,confirmedPageKinds,type PageIndex} from "../lib/drawing-takeoff/indexing";
import {useSingleNativePlanTask,taskMatchesFindings} from "../lib/drawing-takeoff/plan-task-policy";
import {canUseHardwareText} from "../lib/drawing-takeoff/hardware-evidence";
import {mapAnalysisToPhaseRows,mergePhaseCandidateRows} from '../lib/drawing-takeoff/phase-import';

const item=(quantity=1)=>({brand:'Source Brand',component:'Printed part 123',quantity,frameModification:'',doorModification:'',doorPrep:'',sourcePage:1,evidence:'1 EACH Printed part 123',confidence:.9,unit:'EA'});
test('only complete printed groups enter components; notes keep unknown quantities',()=>{
 const result=normalizeHardwareImage({groups:[{group:'Hardware Group 7',name:'Mechanical door',complete:true,note:'',items:[item(),item()]},{group:'Hardware Group 8',name:'Partial group',complete:false,note:'',items:[item()]},{group:'Hardware Group 9',name:'Sliding grille',complete:true,note:'Hardware supplied by manufacturer',items:[]}]});
 assert.equal(result.hardwareGroups.length,3);assert.deepEqual(result.incompleteGroups,['8']);
 assert.equal(result.hardwareGroups[0].group,'7');assert.equal(result.hardwareGroups[2].quantityKnown,false);
 assert.deepEqual(result.hardwareGroups.slice(0,2).map(r=>r.sourceHardwareLine),['0','1']);
 const rows=mapAnalysisToPhaseRows('doc',{hardwareGroups:result.hardwareGroups}).hardware!;
 const saved=mergePhaseCandidateRows([],rows);assert.equal(saved.length,3);
 assert.equal(mergePhaseCandidateRows(saved,rows).length,3);
});
test('overlap selects one complete group while preserving duplicate physical source lines',()=>{
 const row={group:'7',component:'Hinge 123',brand:'Brand',quantity:1,sourcePage:54};
 assert.equal(mergeHardwareImageReads([[row,row],[row,row]]).length,2);
 const conflicting=mergeHardwareImageReads([[row],[{...row,quantity:3}]]);
 assert.equal(conflicting.length,1);assert.equal(conflicting[0].quantity,0);assert.equal((conflicting[0] as Record<string,unknown>).quantityKnown,false);
});
test('outlined hardware panels get overlapping enlarged sections instead of header-only text',()=>{
 const b=(text:string,x:number,y:number)=>({text,x,y,width:30,height:10});
 const page={width:3000,height:2100,boxes:[b('DOOR',1000,130),b('NUMBER',1000,150),b('W',1200,150),b('H',1240,150),b('HARDWARE GROUP',1550,150)]};
 const sections=hardwareImageSections(page);
 assert.ok(sections.length>4);assert.ok(sections.every(s=>s.crop.height<=1200));
 assert.ok(sections[1].crop.y<sections[0].crop.y+sections[0].crop.height);
 assert.deepEqual(hardwareImageSections({...page,boxes:[]}),[]);
});

test('a few searchable hardware headings cannot suppress the source image',()=>{
 assert.equal(canUseHardwareText('HARDWARE GROUP DOOR NUMBER W H',54),false);
 assert.equal(canUseHardwareText('SET 1 3 EA HINGE ABC BRAND SET 2 1 EA CLOSER XYZ BRAND',54),true);
 assert.equal(canUseHardwareText('SET 1 3 EA HINGE ABC BRAND SET 2 HARDWARE BY MANUFACTURER',54),false);
});

test('cached native plan geometry and manual-review results use one page task',()=>{
 assert.equal(useSingleNativePlanTask({supported:false,observations:[]},['A1']),true);
 assert.equal(useSingleNativePlanTask({supported:true,observations:[{}]},[]),true);
 assert.equal(useSingleNativePlanTask({supported:false,observations:[]},[]),false);
});

test('references to the drawing index cannot exclude real floor plans from handing search',()=>{
 const page={page:10,width:800,height:600,rotation:0,text:'MAIN LEVEL FLOOR PLAN. SEE TITLE SHEET FOR DRAWING INDEX. DO NOT SCALE DRAWINGS.',lines:['MAIN LEVEL FLOOR PLAN','SEE TITLE SHEET FOR DRAWING INDEX'],boxes:[]} as PageIndex;
 assert.ok(findPageContent(page).kinds.includes('plan'));
 assert.notEqual(findPageContent(page).evidence,'Sheet index; references are not schedule tables.');
 page.lines=['SHEET INDEX'];page.text='SHEET INDEX A101 FLOOR PLAN';assert.equal(findPageContent(page).evidence,'Sheet index; references are not schedule tables.');
 assert.deepEqual(confirmedPageKinds(['door','walls'],'ECOMM DOOR section details a door assembly.'),['walls']);
 assert.deepEqual(confirmedPageKinds(['door','types'],'DOOR SCHEDULE table and DOOR TYPES diagrams'),['door','types']);
 assert.deepEqual(confirmedPageKinds(['types'],'WINDOW TYPES diagrams'),[]);
 assert.deepEqual(confirmedPageKinds(['plan'],'DOMESTIC FLOOR PLAN - MEZZANINE'),[]);
});

test('cached detail and service-plan tasks do not survive corrected page classification',()=>{
 const findings=[{page:54,section:'door, hardware, types'},{page:38,section:'walls'}];
 assert.equal(taskMatchesFindings({kind:'doors',input:{pages:[38]}},findings),false);
 assert.equal(taskMatchesFindings({kind:'doors',input:{pages:[54]}},findings),true);
 assert.equal(taskMatchesFindings({kind:'plan',input:{pages:[104]}},findings),false);
 assert.equal(taskMatchesFindings({kind:'hardware',input:{pages:[54],matrixArtifact:'matrix'}},[{page:54,section:'door'}]),true);
});
