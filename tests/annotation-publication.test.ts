import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import path from 'node:path';import vm from 'node:vm';import ts from 'typescript';
import type {Row} from '../lib/types';
import {VECTOR_VERSION} from '../lib/drawing-takeoff/vector-pdf';

test('publication keeps held labels out of automatic saves, retires catalog ghosts, and protects reviewed data',async()=>{
 const own={id:'old',name:'01',sourcePage:10,sourceDocumentId:'doc',reviewState:'ai-draft'};
 const reviewed={...own,id:'reviewed',reviewState:'human-reviewed'},other={...own,id:'other',sourceDocumentId:'other-doc'};
 const definition={id:'profile',name:'01',sourcePage:10,sourceDocumentId:'doc',reviewState:'ai-draft',sourceCatalogDefinition:true};
 let project={version:7,data:{activePhaseId:'phase',phases:[{id:'phase',data:{openings:[own,reviewed,other],doorTypes:[definition],walls:[],hardware:[]}}]}};
 let published:Record<string,any>={};
 const job={id:'job',project_id:'project',phase_id:'phase',import_enabled:true,index_path:'',progress:{},analysis:{catalogDoorTypeCandidates:[{code:'15',sourceCatalogDefinition:true,sourcePage:10,width:'3/0',height:'7/0'}],openings:[],openingCatalog:[{mark:'01',sourcePage:10}],annotationOpeningCandidates:[{mark:'A101',sourceAnnotation:true,associationStatus:'suggested',sourcePage:1,autoImportEligible:false},{mark:'A102',autoImportEligible:false}],relevantPages:[{page:10,section:'door'},{page:1,section:'plan'}]}};
 const db={from:(table:string)=>table==='projects'?{
  select:()=>({eq:()=>({single:async()=>({data:project,error:null})})}),
  update:(values:any)=>({eq:()=>({eq:()=>({select:()=>({maybeSingle:async()=>{project={...project,...values};return {data:{id:'project'},error:null};}})})})}),
 }:{update:()=>({eq:async()=>({error:null})})}};
 const source=await readFile('lib/drawing-takeoff/job-publish.ts','utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const appRequire=createRequire(import.meta.url),exports:Record<string,any>={};
 vm.runInNewContext(code,{exports,require:(name:string)=>name==='./job-store'?{
  loadJob:async()=>({db,job,document:{id:'doc'}}),listExtractionTasks:async()=>[{kind:'plan',input:{pages:[1]},status:'complete',result:{vectorVersion:VECTOR_VERSION-1,doorwayObservations:[{mark:'A101',sourcePage:1,boundingBox:{x:.1,y:.1,width:.1,height:.1},confidence:.99,handing:'LH',symbolEvidence:'Old cache',handingEvidence:'Old interpretation'}]}},{kind:'types',input:{pages:[10]},status:'complete',result:{}},{kind:'plan',input:{pages:[1]},status:'complete',result:{vectorVersion:VECTOR_VERSION,doorwayObservations:[{mark:'A101',sourcePage:1,boundingBox:{x:.1,y:.1,width:.1,height:.1},confidence:.95,handing:'RH',symbolEvidence:'Visible arc and leaf',handingEvidence:'Exact framed unit card; both checks agree.'}],printedTagReviewEvidence:[{page:1,shape:{kind:'printed-capsule',text:'15',label:{text:'15',x:100,y:100,width:20,height:16},outline:{x:95,y:100,width:30,height:16}},visibility:'visible-outline',doorContext:'single'}]}}],
  readIndex:async()=>[],updateJob:async(_id:string,value:Record<string,unknown>)=>{published=value;},PUBLICATION_VERSION:'test',
 }:appRequire(path.resolve('lib/drawing-takeoff',name))});
 await exports.publishProgress('job',true);
 let saved=project.data.phases[0].data;
 assert.deepEqual(saved.openings.map((row:Row)=>row.id),['reviewed','other']);
 assert.equal(saved.doorTypes[0].id,'profile');assert.equal(published.progress.reviewOpeningCount,3);assert.equal(published.progress.openingCount,0);
 assert.match(published.progress.message,/3 door labels need review/);assert.match(published.progress.message,/1 supported hand is attached to door labels awaiting review/);assert.equal(published.analysis.annotationOpeningCandidates[0].handing,'RH');assert.equal(published.analysis.annotationOpeningCandidates.length,3);assert.equal(published.analysis.annotationOpeningCandidates[2].sourcePrintedCode,'15');assert.equal(published.analysis.annotationOpeningCandidates[2].handing,'');
 await exports.publishProgress('job',true);saved=project.data.phases[0].data;assert.equal(saved.openings.length,2);
});

test('publication reuses a completed model response against the latest literal schedule fields',async()=>{
 const old={mark:'A1',sourcePage:2,room:'Entry',width:'6/0',height:'7/0',doorType:'A',frameType:'',wallType:'',hardwareGroup:'H1',fireRating:'',quantity:'1',handing:'',evidence:'Old printed row',confidence:.95,doorFinish:'F-OLD',leafCount:'1',leafWidth:'6/0',scheduleNotes:'Old note'};
 const fresh={...old,sourceBuilding:'East',doorFinish:'F-NEW',leafCount:'2',leafWidth:'3/0',scheduleNotes:'Current printed pair note',evidence:'Current printed source'};
 const task={kind:'doors',status:'complete',input:{pages:[2],building:'East',inventory:[old]},result:{openings:[old]},metrics:{responseId:'retained-model-response'}};
 let project:any={version:1,data:{activePhaseId:'phase',phases:[{id:'phase',data:{openings:[],doorTypes:[],walls:[],hardware:[]}}]}};
 const job={id:'job',project_id:'project',phase_id:'phase',import_enabled:true,index_path:'',progress:{},analysis:{openings:[fresh],openingCatalog:[],annotationOpeningCandidates:[],relevantPages:[{page:2,section:'door'}]}};
 const db={from:(table:string)=>table==='projects'?{
  select:()=>({eq:()=>({single:async()=>({data:project,error:null})})}),
  update:(values:any)=>({eq:()=>({eq:()=>({select:()=>({maybeSingle:async()=>{project={...project,...values};return {data:{id:'project'},error:null};}})})})}),
 }:{update:()=>({eq:async()=>({error:null})})}};
 const source=await readFile('lib/drawing-takeoff/job-publish.ts','utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const appRequire=createRequire(import.meta.url),exports:Record<string,any>={};
 vm.runInNewContext(code,{exports,require:(name:string)=>name==='./job-store'?{loadJob:async()=>({db,job,document:{id:'doc'}}),listExtractionTasks:async()=>[task],readIndex:async()=>[],updateJob:async()=>{},PUBLICATION_VERSION:'test'}:appRequire(path.resolve('lib/drawing-takeoff',name))});
 await exports.publishProgress('job',true);
 const saved=project.data.phases[0].data.openings[0];assert.equal(saved.doorFinish,'F-NEW');assert.equal(saved.scheduleNotes,'Current printed pair note');assert.equal(saved.leafCount,'2');assert.equal(saved.leafWidth,'3/0');assert.equal(saved.qty,'1');assert.equal(saved.width,'6/0');
 assert.equal(task.input.inventory[0].doorFinish,'F-OLD');assert.equal(task.metrics.responseId,'retained-model-response');
});

test('publication holds conflicting symbol labels, clears cached geometric hands, and preserves printed and reviewed hands',async()=>{
 const opening=(mark:string,handing='',evidence=`Printed schedule row ${mark}`)=>({mark,handing,evidence,sourcePage:2,room:'Office',width:'3/0',height:'7/0',doorType:'A',frameType:'',wallType:'',hardwareGroup:'H1',fireRating:'',quantity:'1',confidence:.95});
 const reviewed={id:'reviewed',name:'A1',sourcePage:2,sourceDocumentId:'doc',reviewState:'human-reviewed',handing:'LH'};
 let project:any={version:1,data:{activePhaseId:'phase',phases:[{id:'phase',data:{openings:[reviewed],doorTypes:[],walls:[],hardware:[]}}]}};
 const observations=['A1','A2','A3','B1'].map((mark,i)=>({mark,sourcePage:1,boundingBox:{x:i===3?.7:.1,y:.1,width:.1,height:.1},confidence:.95,handing:'RH',symbolEvidence:'Visible arc and leaf',handingEvidence:'Verified corridor boundary.'}));
 const job={id:'job',project_id:'project',phase_id:'phase',import_enabled:true,index_path:'',progress:{},analysis:{openings:[opening('A1'),{...opening('A2','RH'),handingEvidence:'Old cached geometry'},opening('A3','LH','Printed schedule row A3; HAND LH'),opening('B1')],relevantPages:[{page:2,section:'door'},{page:1,section:'plan'}]}};
 let published:any;
 const db={from:(table:string)=>table==='projects'?{
  select:()=>({eq:()=>({single:async()=>({data:project,error:null})})}),
  update:(values:any)=>({eq:()=>({eq:()=>({select:()=>({maybeSingle:async()=>{project={...project,...values};return {data:{id:'project'},error:null};}})})})}),
 }:{update:()=>({eq:async()=>({error:null})})}};
 const source=await readFile('lib/drawing-takeoff/job-publish.ts','utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const appRequire=createRequire(import.meta.url),exports:Record<string,any>={};
 vm.runInNewContext(code,{exports,require:(name:string)=>name==='./job-store'?{loadJob:async()=>({db,job,document:{id:'doc'}}),listExtractionTasks:async()=>[{kind:'plan',status:'complete',input:{pages:[1]},result:{vectorVersion:VECTOR_VERSION,doorwayObservations:observations}}],readIndex:async()=>[],updateJob:async(_id:string,value:any)=>{published=value;},PUBLICATION_VERSION:'test'}:appRequire(path.resolve('lib/drawing-takeoff',name))});
 await exports.publishProgress('job',true);
 const saved=project.data.phases[0].data.openings;
 assert.equal(saved.find((r:any)=>r.name==='A1').handing,'LH');
 assert.equal(saved.find((r:any)=>r.name==='A2').handing,'');
 assert.equal(saved.find((r:any)=>r.name==='A3').handing,'LH');
 assert.equal(saved.find((r:any)=>r.name==='B1').handing,'RH');
 assert.equal(published.analysis.doorwayObservations.filter((r:any)=>r.mark!=='B1').every((r:any)=>!r.handing),true);
 assert.equal(published.analysis.matchedDoorways.find((r:any)=>r.mark==='A2').identityConflict,true);
 assert.match(published.analysis.uncertainties.join(' '),/A1 and A2 overlap the same door symbol/);
 assert.equal(observations[1].handing,'RH');
});

test('current withheld references clear cached geometric hands while printed and reviewed hands survive',async()=>{
 const opening=(mark:string,handing='',evidence=`Printed schedule row ${mark}`)=>({mark,handing,evidence,sourcePage:2,room:'Office',width:'3/0',height:'7/0',doorType:'A',frameType:'',wallType:'',hardwareGroup:'H1',fireRating:'',quantity:'1',confidence:.95});
 const reviewed={id:'reviewed',name:'A1',sourcePage:2,sourceDocumentId:'doc',reviewState:'human-reviewed',handing:'LH'};
 let project:any={version:1,data:{activePhaseId:'phase',phases:[{id:'phase',data:{openings:[reviewed],doorTypes:[],walls:[],hardware:[]}}]}};
 const current=['A1','A2','A3'].map((mark,i)=>({mark,sourcePage:1,boundingBox:{x:.1+i*.3,y:.1,width:.1,height:.1},confidence:.95,handing:i===2?'RH':'',symbolEvidence:'Visible arc and leaf',handingEvidence:i===2?'Current corridor proof.':'Enlarged view: outside side is not established.'}));
 const cached={...current[0],confidence:.99,handing:'RH',handingEvidence:'Old outside interpretation'};
 const job={id:'job',project_id:'project',phase_id:'phase',import_enabled:true,index_path:'',progress:{},analysis:{openings:[{...opening('A1','RH'),handingEvidence:'Old cached geometry'},opening('A2','LH','Printed schedule row A2; HAND LH'),opening('A3')],relevantPages:[{page:2,section:'door'},{page:1,section:'plan'},{page:3,section:'plan'}]}};
 let published:any;
 const db={from:(table:string)=>table==='projects'?{
  select:()=>({eq:()=>({single:async()=>({data:project,error:null})})}),
  update:(values:any)=>({eq:()=>({eq:()=>({select:()=>({maybeSingle:async()=>{project={...project,...values};return {data:{id:'project'},error:null};}})})})}),
 }:{update:()=>({eq:async()=>({error:null})})}};
 const source=await readFile('lib/drawing-takeoff/job-publish.ts','utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const appRequire=createRequire(import.meta.url),exports:Record<string,any>={};
 vm.runInNewContext(code,{exports,require:(name:string)=>name==='./job-store'?{loadJob:async()=>({db,job,document:{id:'doc'}}),listExtractionTasks:async()=>[{kind:'plan',status:'complete',input:{pages:[1]},result:{vectorVersion:VECTOR_VERSION-1,doorwayObservations:[cached],uncertainties:['Obsolete native reference failure.']}},{kind:'plan',status:'complete',input:{pages:[1]},result:{vectorVersion:VECTOR_VERSION,doorwayObservations:current,uncertainties:['Current source still needs review.']}},{kind:'plan',status:'complete',input:{pages:[3]},result:{vectorVersion:VECTOR_VERSION-1,doorwayObservations:[],uncertainties:['Unreplaced native page requires review.']}}],readIndex:async()=>[],updateJob:async(_id:string,value:any)=>{published=value;},PUBLICATION_VERSION:'test'}:appRequire(path.resolve('lib/drawing-takeoff',name))});
 await exports.publishProgress('job',true);
 assert.equal(published.analysis.openings.find((r:any)=>r.mark==='A1').handing,'');
 assert.equal(published.analysis.openings.find((r:any)=>r.mark==='A1').handingEvidence,'');
 assert.equal(published.analysis.openings.find((r:any)=>r.mark==='A2').handing,'LH');
 assert.match(published.analysis.openings.find((r:any)=>r.mark==='A2').handingEvidence,/Printed schedule hand LH/);
 assert.equal(published.analysis.openings.find((r:any)=>r.mark==='A3').handing,'RH');
 assert.equal(project.data.phases[0].data.openings.find((r:any)=>r.name==='A1').handing,'LH');
 assert.ok(!published.analysis.uncertainties.includes('Obsolete native reference failure.'));assert.ok(published.analysis.uncertainties.includes('Current source still needs review.'));assert.ok(published.analysis.uncertainties.includes('Unreplaced native page requires review.'));
 assert.equal(cached.handing,'RH');assert.equal(job.analysis.openings[0].handing,'RH');
});
