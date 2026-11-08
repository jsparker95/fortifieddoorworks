import test from 'node:test';import assert from 'node:assert/strict';import {inventoryOpeningRows} from '../lib/drawing-takeoff/indexing';import {resolveAnnotationCandidates} from '../lib/drawing-takeoff/annotation-candidates';import {mapAnalysisToPhaseRows} from '../lib/drawing-takeoff/phase-import';
const box=(text:string,x:number,y:number)=>({text,x,y,width:Math.max(6,text.length*4),height:8});
test('bare DOOR style catalog preserves column boundaries and never becomes physical opening rows',()=>{
 const headers=[['DOOR',10],['FIRE RATING',80],['WIDTH',150],['HEIGHT',220],['DOOR TYPE',330],['OPERATION',440],['DOOR STYLE',550],['DOOR FINISH',660],['FRAME TYPE',770],['FRAME FINISH',880],['THRESHOLD',990],['HARDWARE',1100],['HARDWARE',1210],['HARDWARE',1320],['CONTROL',1430],['COMMENTS',1540]] as const;
 const boxes=[box('DOOR SCHEDULE',500,-20),...headers.map(([t,x])=>box(t,x,10)),box('PANIC',1210,0),box('FIRE EXIT',1320,0),box('ACCESS',1430,0)];
 for(const [mark,y] of [['10',30],['11',50]] as const)for(const [text,x] of [[mark,10],['45 MIN',80],[mark==='11'?`6'-1"`:`3'-0"`,150],[`6'-8"`,220],['HOLLOW METAL',330],['SWING DOOR',440],['FLUSH',550],['PAINT',660],['HOLLOW METAL',770],['PAINT',880],['T-1',990],['H7/H11',1100],['No',1210],['Yes',1320],['No',1430]] as const)boxes.push(box(text,x,y));
 const page={page:104,width:1700,height:200,boxes,text:'DOOR SCHEDULE',lines:[],rotation:0};const rows=inventoryOpeningRows(page);assert.equal(rows.length,2);assert.ok(rows.every(r=>r.scheduleRole==='catalog'&&r.autoImportEligible===false));
 assert.equal(rows.find(r=>r.mark==='11')!.width,`6'-1"`);assert.equal(rows[0].doorMaterial,'HOLLOW METAL');assert.equal(rows[0].hardwareGroup,'H7/H11');assert.equal(rows[0].doorType,'');
 const resolved=resolveAnnotationCandidates([page],rows);assert.equal(resolved.catalogDefinitions.length,2);assert.equal(mapAnalysisToPhaseRows('doc',{openings:rows}).openings!.length,0);
});
