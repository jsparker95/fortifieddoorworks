import test from 'node:test';import assert from 'node:assert/strict';
import {findHandingPages,withoutAutomaticHanding} from '../lib/drawing-takeoff/handing-pages';
import type {PageIndex,PageFinding} from '../lib/drawing-takeoff/indexing';
import {mapPhaseCandidate,mergePhaseCandidateRows} from '../lib/drawing-takeoff/phase-import';
const page=(page:number,text:string):PageIndex=>({page,width:1000,height:1000,rotation:0,text,lines:text.split('\n'),boxes:[]});
const finding=(page:number,kinds:PageFinding['kinds'],evidence:string):PageFinding=>({page,kinds,evidence,method:'vision',building:'',openingRows:[]});
test('handing pages include confirmed swing drawings, legends and literal hand columns, not index references',()=>{
 const pages=[page(1,'SHEET INDEX\nDOOR HANDING DIAGRAM'),page(2,'FLOOR PLAN'),page(3,'DOOR HANDING LEGEND\nLH RH'),page(4,'DOOR SCHEDULE\nMARK HAND\n101 LH'),page(5,'FLOOR PLAN'),page(6,'ACCESSIBILITY CLEARANCES')];
 const rows=findHandingPages(pages,[finding(1,['handing'],'Index references handing diagrams.'),finding(2,['plan'],'Floor plan with visible door swing symbols.'),finding(4,['door'],'Door schedule table.'),finding(5,['plan'],'Refer to door swing plans.'),finding(6,['types'],'Door manoeuvring clearance diagrams.')]);
 assert.deepEqual(rows.map(r=>r.page),[2,3,4]);assert.ok(rows.every(r=>r.evidence));assert.match(rows[0].description,/manual review/);
});
test('AI handing is never imported, including historical selected review labels; existing manual values survive refresh',()=>{
 const input={mark:'A1',sourcePage:2,width:'3/0',handing:'RH',hingeSide:'right',swingDirection:'away_from_reference_side',handingEvidence:'Old auto result'};
 const row=mapPhaseCandidate('doc','openings',input,0);assert.equal(row.handing,undefined);assert.equal(row.hingeSide,undefined);assert.equal(row.handingEvidence,undefined);
 const reviewed=mapPhaseCandidate('doc','openings',input,0,'human-reviewed');assert.equal(reviewed.handing,undefined);
 const previous={...row,id:'original',handing:'LH',handingEvidence:'User value',reviewState:'ai-draft'};
 const merged=mergePhaseCandidateRows([previous],[{...row,width:'4/0'}]);assert.equal(merged[0].handing,'LH');assert.equal(merged[0].handingEvidence,'User value');assert.equal(merged[0].width,'4/0');assert.equal(merged[0].id,'original');
 assert.equal(withoutAutomaticHanding(input).handing,'');assert.equal(input.handing,'RH');
});
