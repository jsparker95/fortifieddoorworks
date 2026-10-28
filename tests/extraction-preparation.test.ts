import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { PDFDocument } from 'pdf-lib';
import { pageFromSegment } from '../lib/drawing-takeoff/segment-page';

test('page preparation uses a bounded saved segment and preserves original page identity', async () => {
 const pdf = await PDFDocument.create();
 pdf.addPage([101,201]); pdf.addPage([102,202]); pdf.addPage([103,203]);
 const bytes = await pdf.save();
 const output = await PDFDocument.load(await pageFromSegment(bytes,[35,39,88],88));
 assert.equal(output.getPageCount(),1);
 assert.deepEqual(output.getPage(0).getSize(),{width:103,height:203});
 await assert.rejects(pageFromSegment(bytes,[35,39,88],80),/missing from its saved segment/);
 await assert.rejects(pageFromSegment(bytes,[35,88],88),/mapping is inconsistent/);
});

test('large-file preparation never opens the original PDF and checkpoints each page before continuing', async () => {
 const source=await readFile('lib/drawing-takeoff/job-prepare.ts','utf8');
 const file=ts.createSourceFile('prepare.ts',source,ts.ScriptTarget.Latest,true);
 const functions=file.statements.filter(ts.isFunctionDeclaration);
 for(const name of ['planExtraction','preparePage','finishPreparation']) {
  const fn=functions.find(fn=>fn.name?.text===name)!;
  assert.ok(fn);
  assert.doesNotMatch(fn.getText(file),/storage\.from\("project-documents"\)|document\.storage_path|PDFDocument\.load/);
 }
 assert.match(source,/pageFromSegment\(await getArtifact\(sourceArtifact\), sourcePages, page.page\)/);
 assert.match(source,/await listExtractionTasks\(db, jobId\)/);
 const workflow=await readFile('workflows/document-extraction.ts','utf8');
 assert.match(workflow,/await sleep\("1s"\);\s*try\s*\{\s*warnings.push\(\.\.\.await preparePageStep/);
 assert.match(workflow,/async function preparePageStep[^\n]+"use step"/);
 assert.ok(workflow.indexOf('await finishPreparationStep')>workflow.indexOf('await preparePageStep'));
 assert.match(workflow,/for \(const mode of \["schedules", "plans"\] as const\)/);
 assert.match(workflow,/paidRemaining -= prepared.paidTasks/);
 assert.match(workflow,/catch \{\s*preparationFailures\+\+/);
 assert.match(source,/preparedPages: ordinal/);
});

import { partitionPreparationInputs } from '../lib/drawing-takeoff/preparation-policy';
import { readInPages } from '../lib/drawing-takeoff/paged-rows';
import { vectorResourceLimit, MAX_VECTOR_PDF_BYTES } from '../lib/drawing-takeoff/vector-limits';
import { analyzeVectorPlan } from '../lib/drawing-takeoff/vector-pdf';

test('mixed sheets retain schedule and plan tasks in separate preparation passes', () => {
 assert.deepEqual(partitionPreparationInputs([
  {path:'plan70',kinds:['plan']}, {path:'schedule88',kinds:['door','hardware']},
  {path:'mixed80',kinds:['door','walls','plan']}, {path:'types89',kinds:['types']},
 ]), {schedules:['schedule88','mixed80','types89'],plans:['plan70','mixed80']});
});

test('a dense PDF returns manual review before entering the native parser', async () => {
 assert.equal(vectorResourceLimit(MAX_VECTOR_PDF_BYTES),null);
 const result=await analyzeVectorPlan(new Uint8Array(MAX_VECTOR_PDF_BYTES+1),{page:70,lines:[]},['101']);
 assert.equal(result.supported,false);
 assert.deepEqual(result.observations,[]);
 assert.match(result.reason!,/memory budget.*manual review/);
});

test('publication keeps rows beyond the API response cap, including later wall/type records', async () => {
 const all=Array.from({length:1205},(_,i)=>({kind:i<1000?'plan':i<1100?'types':'walls',id:i}));
 const requests:number[][]=[];
 const read=await readInPages(async(from,to)=>{requests.push([from,to]);return all.slice(from,to+1);});
 assert.deepEqual(read,all);
 assert.deepEqual(requests,[[0,499],[500,999],[1000,1499]]);
 assert.equal(read.filter(row=>row.kind==='walls').length,105);
 await assert.rejects(readInPages(async()=>{throw new Error('database failure');}),/database failure/);
});

import vm from 'node:vm';

test('actual workflow saves schedules before plans and continues past a failed plan within one paid budget', async () => {
 const events:string[]=[];
 const budgets:number[]=[];
 const warnings:string[][]=[];
 const source=await readFile('workflows/document-extraction.ts','utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports:Record<string,unknown>={};
 const dependencies:Record<string,unknown>={
  workflow:{sleep:async()=>{}},
  '@/lib/drawing-takeoff/job-prepare':{
   prepareIndex:async()=>[],
   planExtraction:async()=>({schedules:['prepare-88.json'],plans:['prepare-70.json','prepare-71.json']}),
   preparePage:async(_job:string,path:string,_ordinal:number,mode:string)=>{
    events.push(`prepare:${mode}:${path}`);
    if(path==='prepare-70.json')throw new Error('exhausted resource retries');
    return [];
   },
   finishPreparation:async(_job:string,notes:string[],budget:number,schedulesOnly:boolean,failures:number)=>{
    budgets.push(budget); warnings.push([...notes]);
    if(!schedulesOnly)assert.equal(failures,1);
    return schedulesOnly?{ids:['schedule-door','schedule-types'],paidTasks:2}:{ids:['plan71-free'],paidTasks:0};
   },
  },
  '@/lib/drawing-takeoff/job-extract':{extractTask:async(id:string)=>{events.push(`extract:${id}`);return {}; }},
  '@/lib/drawing-takeoff/job-publish':{publishProgress:async(_job:string,final:boolean)=>{events.push(`publish:${final}`);}},
  '@/lib/drawing-takeoff/job-store':{MAX_AI_TASKS:100,PIPELINE_VERSION:'5',loadJob:async()=>{throw new Error('unexpected workflow abort');},updateJob:async()=>{}},
 };
 vm.runInNewContext(code,{exports,require:(name:string)=>{
  if(!(name in dependencies))throw new Error(`Unexpected import: ${name}`);
  return dependencies[name];
 }});
 await (exports.documentExtraction as (id:string)=>Promise<void>)('test-job');
 assert.ok(events.indexOf('extract:schedule-door')<events.indexOf('prepare:plans:prepare-70.json'));
 assert.ok(events.indexOf('extract:schedule-types')<events.indexOf('prepare:plans:prepare-70.json'));
 assert.ok(events.includes('extract:plan71-free'));
 assert.deepEqual(budgets,[70,68]);
 assert.match(warnings[1][0],/PDF page 70.*Other pages continue/);
 assert.equal(events.at(-1),'publish:true');
});
