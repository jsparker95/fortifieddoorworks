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
 const job={id:'job',project_id:'project',phase_id:'phase',import_enabled:true,index_path:'',progress:{},analysis:{catalogDoorTypeCandidates:[{code:'15',sourceCatalogDefinition:true,sourcePage:10,width:'3/0',height:'7/0'}],openings:[],openingCatalog:[{mark:'01',sourcePage:10}],annotationOpeningCandidates:[{mark:'A101',autoImportEligible:false},{mark:'A102',autoImportEligible:false}],relevantPages:[{page:10,section:'door'},{page:1,section:'plan'}]}};
 const db={from:(table:string)=>table==='projects'?{
  select:()=>({eq:()=>({single:async()=>({data:project,error:null})})}),
  update:(values:any)=>({eq:()=>({eq:()=>({select:()=>({maybeSingle:async()=>{project={...project,...values};return {data:{id:'project'},error:null};}})})})}),
 }:{update:()=>({eq:async()=>({error:null})})}};
 const source=await readFile('lib/drawing-takeoff/job-publish.ts','utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const appRequire=createRequire(import.meta.url),exports:Record<string,any>={};
 vm.runInNewContext(code,{exports,require:(name:string)=>name==='./job-store'?{
  loadJob:async()=>({db,job,document:{id:'doc'}}),listExtractionTasks:async()=>[{kind:'types',input:{pages:[10]},status:'complete',result:{}},{kind:'plan',input:{pages:[1]},status:'complete',result:{vectorVersion:VECTOR_VERSION,printedTagReviewEvidence:[{page:1,shape:{kind:'printed-capsule',text:'15',label:{text:'15',x:100,y:100,width:20,height:16},outline:{x:95,y:100,width:30,height:16}},visibility:'visible-outline',doorContext:'single'}]}}],
  readIndex:async()=>[],updateJob:async(_id:string,value:Record<string,unknown>)=>{published=value;},PUBLICATION_VERSION:'test',
 }:appRequire(path.resolve('lib/drawing-takeoff',name))});
 await exports.publishProgress('job',true);
 let saved=project.data.phases[0].data;
 assert.deepEqual(saved.openings.map((row:Row)=>row.id),['reviewed','other']);
 assert.equal(saved.doorTypes[0].id,'profile');assert.equal(published.progress.reviewOpeningCount,3);assert.equal(published.progress.openingCount,0);
 assert.match(published.progress.message,/3 door labels need review/);assert.equal(published.analysis.annotationOpeningCandidates.length,3);assert.equal(published.analysis.annotationOpeningCandidates[2].sourcePrintedCode,'15');assert.equal(published.analysis.annotationOpeningCandidates[2].handing,'');
 await exports.publishProgress('job',true);saved=project.data.phases[0].data;assert.equal(saved.openings.length,2);
});
