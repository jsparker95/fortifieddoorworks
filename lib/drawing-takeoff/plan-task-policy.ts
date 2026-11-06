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
