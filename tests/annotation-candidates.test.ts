import test from 'node:test';import assert from 'node:assert/strict';
import {resolveAnnotationCandidates} from '../lib/drawing-takeoff/annotation-candidates';
import {mapAnalysisToPhaseRows,mergePhaseCandidateRows} from '../lib/drawing-takeoff/phase-import';
import {reviewedCandidateRows,chooseAnnotationCatalog,reviewCandidateKey} from '../lib/drawing-takeoff/reviewed-candidates';
import type {Opening,PageIndex} from '../lib/drawing-takeoff/indexing';
import {currentPlanMarks} from '../lib/drawing-takeoff/plan-task-policy';

const row:Opening={mark:'01',room:'Guest entry',width:`3'-0"`,height:`6'-8"`,doorType:'M',frameType:'',wallType:'',hardwareGroup:'T01',fireRating:'20 MIN',quantity:'1',handing:'',sourcePage:10,evidence:'Printed schedule01:3x6-8, T01',confidence:.95};
const box=(text:string,x:number)=>({text,x,y:10,width:20,height:10});
const page:PageIndex={page:1,text:'Floor plan',lines:['Floor plan'],width:500,height:500,rotation:0,boxes:[box('01',20),box('01',220)],annotationTags:[box('A101',10),box('A102',210)]};
test('review queue keys match saved rows and survive reordered source candidates and catalog choices',()=>{
 const result=resolveAnnotationCandidates([page],[{...row,sourceBuilding:'Building A'}]);
 const candidate=result.candidates[0],definition=result.catalogDefinitions[0];
 const chosen=chooseAnnotationCatalog(candidate,definition);
 const saved=reviewedCandidateRows('doc',[{kind:'openings',row:chosen,index:0},{kind:'doorTypes',row:definition,index:0}],result.catalogDefinitions);
 assert.equal(reviewCandidateKey('doc','openings',candidate,99),saved.openings![0].sourceCandidateKey);
 assert.equal(reviewCandidateKey('doc','openings',chosen,99),saved.openings![0].sourceCandidateKey);
 assert.equal(reviewCandidateKey('doc','doorTypes',definition,99),saved.doorTypes![0].sourceCandidateKey);
 assert.notEqual(reviewCandidateKey('other-doc','openings',chosen,0),saved.openings![0].sourceCandidateKey);
 assert.notEqual(reviewCandidateKey('doc','openings',{...chosen,sourcePage:2},0),saved.openings![0].sourceCandidateKey);
});
test('reused schedule codes become definitions; held labels never enter automatic phase rows',()=>{
 const result=resolveAnnotationCandidates([page],[row]);assert.equal(result.candidates.length,2);assert.equal(result.openingCatalog.length,1);
 assert.equal(result.candidates[0].doorType,'01');assert.equal(result.candidates[0].handing,'');
 const automatic=mapAnalysisToPhaseRows('doc',{openings:result.candidates});assert.equal(automatic.openings!.length,0);
 const reviewed=reviewedCandidateRows('doc',[{kind:'openings',row:result.candidates[0],index:0}],result.catalogDefinitions);
 assert.equal(reviewed.openings![0].reviewState,'human-reviewed');assert.equal(reviewed.doorTypes!.length,1);assert.equal(reviewed.doorTypes![0].reviewState,'ai-draft');
 const again=reviewedCandidateRows('doc',[{kind:'openings',row:result.candidates[0],index:0}],result.catalogDefinitions);
 assert.equal(mergePhaseCandidateRows(reviewed.openings!,again.openings!).length,1);
 assert.equal(mergePhaseCandidateRows(reviewed.openings!,again.openings!)[0].id,reviewed.openings![0].id);
 assert.equal(reviewed.openings![0].sourceSchedulePage,10);assert.equal(reviewed.openings![0].sourceAssociationStatus,'suggested');
 assert.match(String(reviewed.openings![0].sourceEvidence),/Visible PDF annotation/);
 assert.equal(JSON.parse(String(reviewed.openings![0].sourceLabelBounds))[0].page,1);
 assert.deepEqual(currentPlanMarks(['01'],{openingCatalog:result.openingCatalog,annotationOpeningCandidates:result.candidates}),['A101','A102']);
 reviewed.openings![0].width='Human correction';assert.equal(mergePhaseCandidateRows(reviewed.openings!,again.openings!)[0].width,'Human correction');
});
test('reviewed scoped labels link to one scoped definition and known physical marks are not duplicated',()=>{
 const result=resolveAnnotationCandidates([page],[{...row,sourceBuilding:'Building A'}]);
 const reviewed=reviewedCandidateRows('doc',[{kind:'openings',row:result.candidates[0],index:0}],result.catalogDefinitions);
 assert.equal(reviewed.openings![0].doorType,'Building A / 01');assert.equal(reviewed.doorTypes![0].name,'Building A / 01');
 assert.equal(reviewed.openings![0].group,'Building A / T01');
 const explicit=reviewedCandidateRows('doc',[{kind:'openings',row:result.candidates[0],index:0},{kind:'doorTypes',row:result.catalogDefinitions[0],index:0}],result.catalogDefinitions);
 assert.equal(explicit.doorTypes!.length,1);assert.equal(explicit.doorTypes![0].reviewState,'human-reviewed');
 assert.equal(reviewed.doorTypes![0].sourceCatalogDefinition,true);
 const known=resolveAnnotationCandidates([page],[row,{...row,mark:'A101',sourcePage:11}]);
 assert.equal(known.candidates.some(candidate=>candidate.mark==='A101'),false);
 const ambiguous={...result.candidates[0],associationStatus:'ambiguous',width:'',height:'',doorType:'',sourceCatalogCode:'',sourceSchedulePage:undefined};
 const held=reviewedCandidateRows('doc',[{kind:'openings',row:ambiguous,index:0}],result.catalogDefinitions);
 assert.equal(held.doorTypes,undefined);assert.equal(held.openings![0].width,'');assert.equal(held.openings![0].doorType,'');
 const chosen=chooseAnnotationCatalog(ambiguous,result.catalogDefinitions[0]);
 assert.equal(mapAnalysisToPhaseRows('doc',{openings:[chosen]}).openings!.length,0);
 const accepted=reviewedCandidateRows('doc',[{kind:'openings',row:chosen,index:0}],result.catalogDefinitions);
 assert.equal(accepted.openings![0].width,row.width);assert.equal(accepted.openings![0].sourceAssociationStatus,'reviewer-selected');
 assert.equal(accepted.doorTypes!.length,1);assert.match(String(accepted.openings![0].sourceEvidence),/Reviewer selected/);
 assert.throws(()=>chooseAnnotationCatalog(ambiguous,{code:'unverified',sourcePage:2}));
});
test('ambiguous and repeated labels withhold dimensions, type and hand',()=>{
 const crowded={...page,boxes:[...page.boxes,box('02',0)],annotationTags:[...page.annotationTags!,box('A103',0)]};
 const result=resolveAnnotationCandidates([page,crowded],[row,{...row,mark:'02'}]);
 assert.equal(result.candidates.filter(candidate=>candidate.associationStatus==='repeated-label').length,2);
 assert.equal(mapAnalysisToPhaseRows('doc',{openings:result.candidates}).openings!.length,0);
 assert.equal(resolveAnnotationCandidates([{...page,annotationTags:[box('A101',10)]},{...page,page:2,annotationTags:[box('A101',210)]}],[row]).openingCatalog.length,0); // One repeated label cannot establish two openings.
 const ambiguous=resolveAnnotationCandidates([{...page,boxes:[...page.boxes,box('02',315)],annotationTags:[...page.annotationTags!,box('A103',305)]}],[row,{...row,mark:'02'}]);
 const held=ambiguous.candidates.find(candidate=>candidate.mark==='A103')!;assert.equal(held.associationStatus,'suggested');
 const duplicate=resolveAnnotationCandidates([page,{...page,page:2,annotationTags:[box('A103',10),box('A103',210)]}],[row]);
 const repeated=duplicate.candidates.find(candidate=>candidate.mark==='A103')!;assert.equal(repeated.associationStatus,'repeated-label');assert.equal(repeated.width,'');assert.equal(repeated.doorType,'');
 const unresolved=resolveAnnotationCandidates([{...page,boxes:[...page.boxes,box('02',310),box('01',330)],annotationTags:[...page.annotationTags!,box('A104',320)]}],[row,{...row,mark:'02'}]).candidates.find(candidate=>candidate.mark==='A104')!;
 assert.equal(unresolved.associationStatus,'ambiguous');assert.equal(unresolved.width,'');assert.equal(unresolved.handing,'');
});
