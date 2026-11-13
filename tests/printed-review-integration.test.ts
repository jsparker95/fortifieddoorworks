import test from 'node:test';import assert from 'node:assert/strict';
import {printedReviewCandidates,type PrintedReviewEvidence} from '../lib/drawing-takeoff/printed-review-candidates';
import {reviewedCandidateRows,reviewCandidateKey,chooseAnnotationCatalog} from '../lib/drawing-takeoff/reviewed-candidates';
import {mapAnalysisToPhaseRows,mergePhaseCandidateRows} from '../lib/drawing-takeoff/phase-import';
import {useSingleNativePlanTask} from '../lib/drawing-takeoff/plan-task-policy';
import type {PageIndex} from '../lib/drawing-takeoff/indexing';
const evidence=(page=1):PrintedReviewEvidence=>({page,shape:{kind:'printed-capsule',text:'15',label:{text:'15',x:1000,y:600,width:20,height:16},outline:{x:995,y:600,width:30,height:16},visibility:'requires-source-review',autoImportEligible:false},visibility:'visible-outline',doorContext:'single'});
const def={code:'15',sourcePage:10,sourceCatalogDefinition:true,sourceBuilding:'Block A',width:'3/0',height:'7/0',description:'Printed storage',hardwareGroup:'T15'};
const box=(text:string,x:number,y:number)=>({text,x,y,width:20,height:10});
const page=(n:number,shift:number):PageIndex=>({page:n,width:2000,height:1500,rotation:0,text:'ENLARGED FLOOR PLAN - LEVEL 1 - B',lines:[],boxes:[box('201',700+shift,400),box('202',900+shift,400),box('203',1100+shift,650)]});
test('source evidence flows into held review then named explicit save with linked type and provenance',()=>{
 const rows=printedReviewCandidates([evidence()],[def]);assert.equal(rows.length,1);assert.equal(rows[0].doorType,'15');assert.equal(rows[0].handing,'');
 assert.equal(mapAnalysisToPhaseRows('doc',{openings:rows}).openings!.length,0);
 assert.throws(()=>reviewedCandidateRows('doc',[{kind:'openings',row:rows[0],index:0}],[def]),/name or number/);
 const named={...rows[0],mark:'Opening X'};
 const saved=reviewedCandidateRows('doc',[{kind:'openings',row:named,index:0}],[def]);assert.equal(saved.openings![0].name,'Opening X');assert.equal(saved.openings![0].doorType,'Block A / 15');assert.equal(saved.doorTypes![0].name,'Block A / 15');
 assert.equal(saved.openings![0].sourceVisibility,'visible-outline');assert.equal(saved.openings![0].sourceDoorContext,'single');assert.equal(saved.openings![0].sourcePrintedCode,'15');assert.equal(saved.openings![0].sourceAnnotation,false);
 assert.equal(JSON.parse(String(saved.openings![0].sourceLabelBounds))[0].page,1);
 assert.equal(reviewCandidateKey('doc','openings',named,99),saved.openings![0].sourceCandidateKey);
 saved.openings![0].name='Human rename';const again=reviewedCandidateRows('doc',[{kind:'openings',row:{...named,mark:'Changed source'},index:9}],[def]);const merged=mergePhaseCandidateRows(saved.openings!,again.openings!);assert.equal(merged.length,1);assert.equal(merged[0].name,'Human rename');
});
test('unverified outlines, missing symbols, conflicting evidence and catalog choices withhold data',()=>{
 for(const e of [{...evidence(),visibility:'not-confirmed'},{...evidence(),doorContext:'unverified' as const},{...evidence(),doorContext:'ambiguous' as const}]){const row=printedReviewCandidates([e],[def])[0];assert.equal(row.width,'');assert.equal(row.height,'');assert.equal(row.doorType,'');assert.equal(row.handing,'');}
 const ambiguous=printedReviewCandidates([evidence()],[def,{...def,sourcePage:11}])[0];assert.equal(ambiguous.associationStatus,'ambiguous');assert.equal(ambiguous.width,'');
 const chosen=chooseAnnotationCatalog(ambiguous,def);assert.equal(mapAnalysisToPhaseRows('doc',{openings:[chosen]}).openings!.length,0);
 assert.equal(printedReviewCandidates([evidence(),{...evidence(),doorContext:'unverified'}],[def])[0].doorType,'');
 assert.equal(printedReviewCandidates([null,{},false],[def]).length,0);
 const paired=printedReviewCandidates([{...evidence(),doorContext:'paired'}],[def])[0];assert.equal(paired.width,'3/0');assert.equal(paired.handing,'');
 assert.equal(useSingleNativePlanTask({supported:false,observations:[],printedTagReviewEvidence:[evidence()]},[]),true);
});
test('aligned repeated locations stay independent, require explicit separate-opening review and never merge automatically',()=>{
 const a=evidence(),b=evidence(2);b.shape={...b.shape,label:{...b.shape.label,x:600},outline:{...b.shape.outline,x:595}};
 const rows=printedReviewCandidates([a,b],[def],[page(1,0),page(2,-400)]);assert.equal(rows.length,2);
 assert.ok(rows.every(r=>JSON.parse(r.sourcePossibleDuplicates).length===1));
 assert.throws(()=>reviewedCandidateRows('doc',[{kind:'openings',row:{...rows[0],mark:'X'},index:0}],[def]),/separate opening/);
 const accepted=reviewedCandidateRows('doc',[{kind:'openings',row:{...rows[0],mark:'X',sourceDuplicateDecision:'confirmed-separate-opening'},index:0}],[def]);assert.equal(accepted.openings!.length,1);assert.equal(accepted.openings![0].sourceDuplicateDecision,'confirmed-separate-opening');
 assert.equal(JSON.parse(String(accepted.openings![0].sourcePossibleDuplicates))[0].page,2);
});

test('a clean native PDF produces visibility and swing evidence that reaches the same held review flow',async()=>{
 const {PDFDocument,StandardFonts,rgb,moveTo,lineTo,stroke,setLineWidth}=await import('pdf-lib');
 const {analyzeVectorPlan}=await import('../lib/drawing-takeoff/vector-pdf');
 const doc=await PDFDocument.create(),p=doc.addPage([1200,900]),font=await doc.embedFont(StandardFonts.Helvetica);
 p.drawSvgPath('M 10 0 L 40 0 C 45.5 0 50 4.5 50 10 C 50 15.5 45.5 20 40 20 L 10 20 C 4.5 20 0 15.5 0 10 C 0 4.5 4.5 0 10 0 Z',{x:120,y:520,borderWidth:1,borderColor:rgb(0,0,0)});
 p.drawText('15',{x:138,y:506,font,size:12});
 const curve=Array.from({length:13},(_,i)=>({x:120+50*Math.cos(i*Math.PI/24),y:490-50*Math.sin(i*Math.PI/24)}));
 p.pushOperators(setLineWidth(1),moveTo(curve[0].x,curve[0].y),...curve.slice(1).map(q=>lineTo(q.x,q.y)),stroke(),moveTo(120,490),lineTo(120,440),stroke());
 const vector=await analyzeVectorPlan(await doc.save(),{page:1,lines:['ENLARGED FLOOR PLAN - LEVEL 1 - B']},[],['15']);
 assert.equal(vector.printedTagReviewEvidence?.length,1);assert.equal(vector.printedTagReviewEvidence![0].visibility,'visible-outline');assert.equal(vector.printedTagReviewEvidence![0].doorContext,'single');
 const candidates=printedReviewCandidates(vector.printedTagReviewEvidence!,[def]);assert.equal(candidates[0].doorType,'15');assert.equal(candidates[0].handing,'');assert.equal(mapAnalysisToPhaseRows('doc',{openings:candidates}).openings!.length,0);
});

test('printed review integration preserves native size gates and never invents rows for an unsupported PDF',async()=>{
 const {analyzeVectorPlan}=await import('../lib/drawing-takeoff/vector-pdf');
 const result=await analyzeVectorPlan(new Uint8Array(33*1024*1024),{page:1,lines:[]},[],['15']);
 assert.equal(result.supported,false);assert.equal(result.observations.length,0);assert.equal(result.printedTagReviewEvidence,undefined);assert.ok(result.reason);
 assert.equal(printedReviewCandidates(result.printedTagReviewEvidence||[],[def]).length,0);
});

test('an already annotated code location is retained as a possible duplicate rather than imported twice',()=>{
 const e=evidence(),annotation={mark:'A101',sourcePage:1,sourceAnnotation:true,sourceCatalogLabelBounds:JSON.stringify({page:1,...e.shape.label}),sourceLabelBounds:'[{"page":1,"x":990,"y":610}]'};
 const rows=printedReviewCandidates([e],[def],[],[annotation]);assert.equal(rows.length,1);const duplicate=JSON.parse(rows[0].sourcePossibleDuplicates)[0];assert.equal(duplicate.annotationMark,'A101');assert.equal(duplicate.catalogLabelBounds.text,'15');
 assert.throws(()=>reviewedCandidateRows('doc',[{kind:'openings',row:{...rows[0],mark:'A101'},index:0}],[def]),/separate opening/);
 assert.equal(mapAnalysisToPhaseRows('doc',{openings:rows}).openings!.length,0);
});

test('one primary view can be explicitly reviewed but two views of that opening cannot be approved together',()=>{
 const a=evidence(),b=evidence(2);b.shape={...b.shape,label:{...b.shape.label,x:600},outline:{...b.shape.outline,x:595}};
 const rows=printedReviewCandidates([a,b],[def],[page(1,0),page(2,-400)]),selected=rows.map((row,index)=>({kind:'openings' as const,row:{...row,mark:'Reviewed '+index,sourceDuplicateDecision:'primary-view'},index}));
 const saved=reviewedCandidateRows('doc',[selected[0]],[def]);assert.equal(saved.openings!.length,1);assert.equal(saved.openings![0].sourceDuplicateDecision,'primary-view');
 assert.throws(()=>reviewedCandidateRows('doc',selected,[def]),/already represents/);
 assert.throws(()=>reviewedCandidateRows('doc',[selected[1]],[def],saved.openings!),/already represents/);
 const separatelyConfirmed={...selected[1],row:{...selected[1].row,sourceDuplicateDecision:'confirmed-separate-opening'}};
 assert.equal(reviewedCandidateRows('doc',[separatelyConfirmed],[def],saved.openings!).openings!.length,1);
 assert.equal(saved.openings!.length,1); // Prior rows/evidence are never deleted by this decision.
});

test('exceeding the overlap page budget requires explicit manual review rather than silent duplicate clearance',()=>{
 const many=Array.from({length:65},(_,i)=>evidence(i+1)),pages=many.map((e,i)=>page(e.page,i*10)),rows=printedReviewCandidates(many,[def],pages);
 assert.equal(rows.length,65);assert.ok(rows.every(row=>row.sourceOverlapReviewRequired));
 assert.throws(()=>reviewedCandidateRows('doc',[{kind:'openings',row:{...rows[0],mark:'X'},index:0}],[def]),/repeated view/);
});

test('a reviewed printed catalog label retains its source material, finish, notes and paired-leaf attributes',()=>{
 const detailed={...def,material:'SC WOOD',doorFinish:'FIN-2',frameMaterial:'HM',frameFinish:'FIN-3',scheduleNotes:'Use acoustic seals.',leafCount:'2',leafWidth:'1/6',sourceScheduleDoorType:'M'};
 const [candidate]=printedReviewCandidates([{...evidence(),doorContext:'paired'}],[detailed]);
 assert.equal(mapAnalysisToPhaseRows('doc',{openings:[candidate]}).openings!.length,0);
 const saved=reviewedCandidateRows('doc',[{kind:'openings',row:{...candidate,mark:'Reviewed pair'},index:0}],[detailed]).openings![0];
 assert.equal(saved.doorMaterial,'SC WOOD');assert.equal(saved.doorFinish,'FIN-2');assert.equal(saved.frameMaterial,'HM');assert.equal(saved.frameFinish,'FIN-3');assert.equal(saved.scheduleNotes,'Use acoustic seals.');assert.equal(saved.leafCount,'2');assert.equal(saved.leafWidth,'1/6');assert.equal(saved.qty,'1');assert.equal(saved.handing,undefined);assert.equal(saved.sourceScheduleDoorType,'M');
});
