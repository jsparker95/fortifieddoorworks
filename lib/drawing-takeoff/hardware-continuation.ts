import {hardwareImageSchema} from './hardware-sections';
import type {TaskInput} from './job-store';

type Task={kind:string;status:string;input:TaskInput;result:Record<string,unknown>|null};
const code=(text:string)=>text.replace(/^(?:HARDWARE\s+)?(?:GROUP|SET)\s*(?:NO\.?\s*)?[:#]?\s*/i,'').trim();

/** Check only the final left-column group against unheaded lines atop the next column. */
export function hardwareContinuationTasks(tasks:Task[]) {
 const pages=[...new Set(tasks.filter(task=>task.kind==='hardware'&&task.input.hardwareSection).map(task=>task.input.pages[0]))];
 return pages.flatMap(page=>{
  const sections=tasks.filter(task=>task.kind==='hardware'&&task.input.pages[0]===page&&task.input.hardwareSection&&!task.input.hardwareSection.continuationGroup);
  if(sections.some(task=>task.status!=='complete'))return [];
  const read=(task:Task)=>{const parsed=hardwareImageSchema.safeParse(task.result?.rawHardwareResponse);return parsed.success?parsed.data.groups:[];};
  const left=sections.filter(task=>task.input.hardwareSection!.crop.x===0&&read(task).length).sort((a,b)=>b.input.hardwareSection!.crop.y-a.input.hardwareSection!.crop.y)[0];
  const right=sections.filter(task=>task.input.hardwareSection!.crop.x>0).sort((a,b)=>a.input.hardwareSection!.crop.y-b.input.hardwareSection!.crop.y)[0];
  const finalGroup=left&&read(left).at(-1);
  if(!left||!right||!finalGroup)return [];
  const group=code(finalGroup.group);
  if(!group)return [];
  return [{task_key:`hardware:${page}:continuation:${encodeURIComponent(group)}`,kind:'hardware',input:{...left.input,hardwareSection:{...left.input.hardwareSection!,continuationCrop:right.input.hardwareSection!.crop,continuationGroup:group}}}];
 });
}

/** A continuation adds tail lines; it must not rewrite the already-read prefix. */
export function reconcileHardwareContinuation<T extends {group:string;component:string;brand:string;quantity:number;sourcePage:number}>(base:T[],continued:T[]) {
 const normalized=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
 const result:T[]=[],uncertainties:string[]=[];
 for(const group of new Set(continued.map(row=>`${row.sourcePage}:${row.group}`))){
  const next=continued.filter(row=>`${row.sourcePage}:${row.group}`===group),prior=base.filter(row=>`${row.sourcePage}:${row.group}`===group);
  if(prior.length>next.length||prior.some((row,i)=>!next[i]||normalized(row.component)!==normalized(next[i].component)||normalized(row.brand)!==normalized(next[i].brand)||row.quantity!==next[i].quantity)){
   uncertainties.push(`Hardware group ${next[0].group} on PDF page ${next[0].sourcePage}: the column continuation disagrees with the existing component prefix. Retained the prior reading; review both source columns.`);
   continue;
  }
  result.push(...next.map((row,i)=>prior[i]||row));
 }
 return {rows:result,uncertainties};
}
