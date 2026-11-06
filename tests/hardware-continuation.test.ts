import test from 'node:test';
import assert from 'node:assert/strict';
import {hardwareContinuationTasks,reconcileHardwareContinuation} from '../lib/drawing-takeoff/hardware-continuation';
import {normalizeHardwareImage,mergeHardwareImageReads} from '../lib/drawing-takeoff/hardware-sections';

const item=(component:string)=>({brand:'Example',component,quantity:1,unit:'EA',frameModification:'',doorModification:'',doorPrep:'',sourcePage:1,evidence:`1 Each ${component} Example`,confidence:.9});
const group=(code:string,components:string[])=>({group:code,name:'Printed group',complete:true,note:'',items:components.map(item)});
const section=(x:number,y:number)=>({crop:{x,y,width:600,height:1200},ownerLeft:x?0.1:0,ownerRight:1});
const task=(x:number,y:number,groups:ReturnType<typeof group>[])=>({kind:'hardware',status:'complete',input:{pages:[8],artifact:'page.pdf',hardwareSection:section(x,y)},result:{rawHardwareResponse:{groups}}});
test('only one continuation task links final left heading to top of the following column',()=>{
 const tasks=[task(0,0,[group('1',['Hinge'])]),task(0,700,[group('2',['Lock'])]),task(0,1400,[]),task(500,0,[group('3',['Closer'])])];
 const [wrap]=hardwareContinuationTasks(tasks);
 assert.equal(wrap.input.hardwareSection.continuationGroup,'2');
 assert.equal(wrap.input.hardwareSection.crop.y,700);
 assert.equal(wrap.input.hardwareSection.continuationCrop.y,0);
 assert.equal(hardwareContinuationTasks([...tasks,{...wrap,status:'complete',result:{}}]).length,1);
 assert.equal(hardwareContinuationTasks(tasks.map((t,i)=>i===1?{...t,status:'pending'}:t)).length,0);
 assert.equal(hardwareContinuationTasks(tasks.filter(t=>t.input.hardwareSection.crop.x===0)).length,0);
});
test('continuation preserves prior prefix spelling and withholds conflicting reads',()=>{
 const row={group:'2',sourcePage:8,component:'Lockset Example EX98',brand:'Example',quantity:1};
 const suffix={...row,component:'Stop Example ST20'};
 const result=reconcileHardwareContinuation([row],[{...row,component:'Lockset Example EX.98'},suffix]);
 assert.equal(result.rows.length,2);assert.equal(result.rows[0].component,row.component);
 assert.equal(reconcileHardwareContinuation([row],[{...row,quantity:2},suffix]).rows.length,0);
 assert.equal(reconcileHardwareContinuation([row],[{...row,component:'Different EX99'},suffix]).uncertainties.length,1);
});
test('column wrap adds continued physical lines once and excludes following groups',()=>{
 const first=normalizeHardwareImage({groups:[group('2',['Hinge','Lock','Closer'])]}).hardwareGroups;
 const wrapped=normalizeHardwareImage({groups:[group('2',['Hinge','Lock','Closer','Stop','Kickplate','Silencer']),group('3',['Other'])]},'2').hardwareGroups;
 const merged=mergeHardwareImageReads([first,wrapped] as Array<Array<{group:string;component:string;brand:string;quantity:number;sourcePage:number}>>);
 assert.equal(merged.length,6);assert.equal(merged.every(row=>row.group==='2'),true);
 assert.deepEqual(normalizeHardwareImage({groups:[]},'2').incompleteGroups,['2']);
});
