/** A cached page-wide native result needs one task, including a manual-review outcome. */
export function useSingleNativePlanTask(vector:{supported:boolean;observations:unknown[]},knownMarks:string[]){
  return vector.supported||knownMarks.length>0;
}

/** Reapply improved page classification to cached tasks without repurchasing their results. */
export function taskMatchesFindings(task:{kind:string;input:{pages:number[];matrixArtifact?:string}},findings?:Array<{page:number;section:string}>){
 if(!findings?.length)return true;
 const wanted=task.kind==='doors'?'door':task.kind==='hardware'&&task.input.matrixArtifact?'door':task.kind;
 return task.input.pages.some(page=>findings.some(f=>f.page===page&&f.section.split(/\s*,\s*/).includes(wanted)));
}

/** Schedule OCR completes after initial planning; floor-plan work must use those saved marks. */
export function currentPlanMarks(stored:string[],analysis?:{openings?:Array<Record<string,unknown>>;openingCatalog?:Array<Record<string,unknown>>}){
 const rows=[...(analysis?.openings||[]),...(analysis?.openingCatalog||[])];
 const excluded=new Set(rows.filter(r=>r.autoImportEligible===false||r.scheduleRole==='catalog').map(r=>String(r.mark||'').trim().toUpperCase()));
 return [...new Set([...stored,...(analysis?.openings||[]).filter(r=>r.autoImportEligible!==false&&r.scheduleRole!=='catalog').map(r=>String(r.mark||''))].map(mark=>mark.trim()).filter(mark=>mark&&!excluded.has(mark.toUpperCase())))].sort();
}
