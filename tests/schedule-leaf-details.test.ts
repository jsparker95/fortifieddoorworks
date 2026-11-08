import {pairSizeReviewNotes} from '../lib/drawing-takeoff/schedule-fields';
import test from 'node:test';import assert from 'node:assert/strict';
import {printedScheduleDimension,printedLeafDetails} from '../lib/drawing-takeoff/schedule-table';
import {reconcileInventoriedRows} from '../lib/drawing-takeoff/indexing';
import type {Opening} from '../lib/drawing-takeoff/indexing';
test('a YES pair column preserves assembly width and requires explicit corroboration for leaf width',()=>{
 const width=printedScheduleDimension(`3'-10"`)!;
 assert.deepEqual(printedLeafDetails(width,'YES',`Closet - PAIR OF 1'-11" PANELS.`),{leafCount:'2',leafWidth:`1'-11"`});
 assert.equal(width.value,`3'-10"`);
 assert.equal(pairSizeReviewNotes([{mark:'A1',sourcePage:2,width:width.value,leafCount:'2',leafWidth:''}]).length,1);
 assert.equal(pairSizeReviewNotes([{mark:'A1',sourcePage:2,width:width.value,leafCount:'2',leafWidth:`1'-11"`}]).length,0);
 assert.deepEqual(printedLeafDetails(width,'YES',''),{leafCount:'2',leafWidth:''});
 assert.deepEqual(printedLeafDetails(width,'YES',`PAIR OF 2'-0" PANELS`),{leafCount:'2',leafWidth:''});
 assert.deepEqual(printedLeafDetails(width,'NO',''),{leafCount:'1',leafWidth:`3'-10"`});
 const explicit=printedScheduleDimension(`(2) 3'-0"`)!;assert.equal(explicit.value,`6'-0"`);assert.deepEqual(printedLeafDetails(explicit,'',''),{leafCount:'2',leafWidth:`3'-0"`});
});
test('model enrichment cannot replace printed leaf count, leaf width, or schedule notes',()=>{
 const source:Opening={mark:'A1',room:'Closet',width:`3'-10"`,height:`6'-8"`,doorType:'C',frameType:'',wallType:'',hardwareGroup:'H1',fireRating:'',quantity:'1',handing:'',sourcePage:2,evidence:'Printed source pair row',confidence:.95,leafCount:'2',leafWidth:`1'-11"`,scheduleNotes:'PAIR OF 1\'-11" PANELS'};
 const [saved]=reconcileInventoriedRows([source],[{...source,leafCount:'1',leafWidth:'3/0',scheduleNotes:'An unprinted substitution'}]);
 assert.equal(saved.leafCount,'2');assert.equal(saved.leafWidth,source.leafWidth);assert.equal(saved.scheduleNotes,source.scheduleNotes);assert.equal(saved.quantity,'1');assert.equal(saved.width,source.width);
});

import {resolveOpeningHanding} from '../lib/drawing-takeoff/schedule-evidence';
import {reviewLabelHands} from '../lib/drawing-takeoff/review-label-hands';
test('a source-described pair cannot adopt one detected leaf hand as its assembly hand',()=>{
 assert.equal(resolveOpeningHanding({leafCount:'2'},'RH'),'');
 assert.equal(resolveOpeningHanding({leafCount:'1'},'RH'),'RH');
 assert.equal(resolveOpeningHanding({leafCount:'2',handing:'LH',evidence:'Printed active leaf hand LH'},'RH'),'LH');
 const [label]=reviewLabelHands([{mark:'A1',sourceAnnotation:true,associationStatus:'suggested',sourcePage:1,leafCount:'2'}],[{mark:'A1',sourcePage:1,handing:'RH',handingEvidence:'One visible arc and leaf'}]);
 assert.equal(label.handing,'');assert.equal(label.handingEvidence,'');
});

import {inventoryGeometricSchedule} from '../lib/drawing-takeoff/schedule-table';
const box=(text:string,x:number,y:number)=>({text,x,y,width:text.length*4,height:8});
test('door material and finish before an explicit frame-material column retain separate bounded cells',()=>{
 const headers=[['MARK',10],['WIDTH',80],['HEIGHT',150],['TYPE',220],['PAIR',290],['MATERIAL',360],['FINISH',450],['FRAME MAT.',570],['NOTES',700]] as const;
 const boxes=[box('DOOR SCHEDULE',200,0),...headers.map(([t,x])=>box(t,x,30))];
 for(const [mark,y] of [['01',60],['02',80]] as const)for(const [value,x] of [[mark,10],[`3'-10"`,80],[`6'-8"`,150],['M',220],['YES',290],['SPEC-A',360],['FIN-B',450],['HM, FIN-C',570],[`PAIR OF 1'-11" PANELS`,700]] as const)boxes.push(box(value,x,y));
 const rows=inventoryGeometricSchedule({page:2,width:1000,height:200,boxes});assert.equal(rows.length,2);
 for(const row of rows){assert.equal(row.doorMaterial,'SPEC-A');assert.equal(row.doorFinish,'FIN-B');assert.equal(row.frameMaterial,'HM, FIN-C');assert.equal(row.leafCount,'2');assert.equal(row.leafWidth,`1'-11"`);assert.equal(row.width,`3'-10"`);}
});
test('printed parent groups disambiguate reversed frame and door material/finish columns',()=>{
 const boxes=[box('DOOR SCHEDULE',200,0),box('MARK',10,30),box('WIDTH',80,30),box('HEIGHT',150,30),box('FRAME',250,10),box('DOOR',550,10),box('MATERIAL',250,30),box('FINISH',350,30),box('MATERIAL',550,30),box('FINISH',650,30)];
 for(const [mark,y] of [['01',60],['02',80]] as const)for(const [value,x] of [[mark,10],[`3'-0"`,80],[`7'-0"`,150],['HM',250],['F1',350],['WOOD',550],['F2',650]] as const)boxes.push(box(value,x,y));
 const rows=inventoryGeometricSchedule({page:2,width:900,height:200,boxes});assert.equal(rows.length,2);
 for(const row of rows){assert.equal(row.frameMaterial,'HM');assert.equal(row.frameFinish,'F1');assert.equal(row.doorMaterial,'WOOD');assert.equal(row.doorFinish,'F2');}
});

import {currentTaskInventory} from '../lib/drawing-takeoff/indexing';
test('cached model sections use corrected literal attributes without borrowing another page or building',()=>{
 const old:Opening={mark:'A1',room:'Entry',width:'3/0',height:'7/0',doorType:'A',frameType:'',wallType:'',hardwareGroup:'H1',fireRating:'',quantity:'1',handing:'',sourcePage:2,evidence:'Old native inventory',confidence:.95};
 const fresh={...old,doorFinish:'F-2',scheduleNotes:'Current printed notes',sourceBuilding:'East'};
 assert.equal(currentTaskInventory([old],[fresh],'East')[0].doorFinish,'F-2');
 assert.equal(currentTaskInventory([old],[{...fresh,sourcePage:3}],'East')[0],old);
 assert.equal(currentTaskInventory([old],[{...fresh,sourceBuilding:'West'}],'East')[0],old);
 assert.equal(currentTaskInventory([old],[fresh,{...fresh,sourceBuilding:'West'}],'East')[0],fresh);
 assert.equal(currentTaskInventory([old],[fresh,{...fresh,sourceBuilding:'West'}])[0],old);
 assert.equal(old.doorFinish,undefined,'retained task source is not mutated');
});
