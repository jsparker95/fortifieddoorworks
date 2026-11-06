import fs from 'node:fs/promises';
import path from 'node:path';
import {compareOpeningBenchmark,type BenchmarkOpening} from '../lib/drawing-takeoff/benchmark';
(async()=>{
 const [root,caseId]=process.argv.slice(2);
 if(!root||!caseId)throw new Error('Provide private benchmark root and source case');
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 const project=manifest.projects.find((p:{id:string})=>p.id===caseId);
 if(!project)throw new Error('Source case is not in the private manifest');
 const saved=JSON.parse(await fs.readFile(path.join(root,caseId,'production-saved-phase.json'),'utf8'))[0];
 const phase=saved.saved_phase,data=phase.data;
 const unscoped=(value:unknown)=>String(value||'').split(' / ').at(-1)!.trim();
 const actual:BenchmarkOpening[]=data.openings.map((r:Record<string,unknown>)=>({mark:String(r.name||""),width:String(r.width||""),height:String(r.height||""),handing:String(r.handing||""),doorType:unscoped(r.doorType),wallType:unscoped(r.wall),hardwareGroup:unscoped(r.group),sourcePage:Number(r.sourcePage)||undefined,evidence:String(r.sourceEvidence||"")}));
 const groups=new Set(data.hardware.map((r:Record<string,unknown>)=>String(r.group||'')));
 const reports=[];
 for(const baseline of project.humanBaselines){
  const human=JSON.parse(await fs.readFile(baseline.file,'utf8'));
  const expected:BenchmarkOpening[]=human.sheets.Frames.rows.filter((r:{row:number;cells:Record<string,string>})=>r.row>1&&r.cells.A&&r.cells.A!=='0'&&!['1','TRUE'].includes(r.cells.P)).map((r:{row:number;cells:Record<string,string>})=>({mark:r.cells.A,width:r.cells.C,height:r.cells.D,doorType:r.cells.M,handing:r.cells.G,wallType:r.cells.E,hardwareGroup:r.cells.O,sourceCells:Object.fromEntries([['width','C'],['height','D'],['doorType','M'],['handing','G'],['wallType','E'],['hardwareGroup','O']].map(([k,col])=>[k,`Frames!${col}${r.row}`]))}));
  reports.push({recordedAt:new Date().toISOString(),stage:'production-saved-phase',project:caseId,projectId:saved.project_id,phaseId:phase.id,humanWorkbook:baseline.url,humanTotals:human.summary,...compareOpeningBenchmark(expected,actual),
   savedTabs:Object.fromEntries(['openings','walls','doorTypes','hardware'].map(k=>[k,data[k]?.length||0])),
   hardware:{partLines:data.hardware.length,requirementLines:data.hardware.filter((r:Record<string,unknown>)=>r.sourceRequirement).length,unknownQuantityLines:data.hardware.filter((r:Record<string,unknown>)=>r.quantityKnown===false&&!String(r.qty||'').trim()).length,unresolvedOpeningGroups:data.openings.filter((r:Record<string,unknown>)=>r.group&&!groups.has(String(r.group))).map((r:Record<string,unknown>)=>r.name),scope:'Generated matrix profiles are source requirements, not equivalent printed human set IDs or selected SKUs. Quantities/products need independent validation.'},
   definitionAudit:{doorTypeNames:data.doorTypes.map((r:Record<string,unknown>)=>r.name),wallNames:data.walls.map((r:Record<string,unknown>)=>r.name)},
   jobStatus:'See independently recorded job lifecycle and errors; saved rows alone do not establish completion.'});
 }
 const file=path.join(root,'reports',`production-${caseId}.json`);await fs.writeFile(file,JSON.stringify(reports,null,2));
 for(const report of reports){console.log(JSON.stringify({...report,discrepancies:undefined}));await fs.appendFile(path.join(root,'test-results.jsonl'),JSON.stringify({...report,discrepancies:undefined,detailsFile:file})+'\n');}
})().catch(e=>{console.error(e.message);process.exitCode=1});
