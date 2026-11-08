import type { TaskInput } from "./job-store";

/** Cached vector sections use no model budget; only new paid sections are capped. */
export function taskIdsWithinBudget(tasks: Array<{ task_key: string; kind: string; input: TaskInput }>, pendingByKey: Map<string,string>, paidLimit: number) {
  let paid=0;
  return tasks.flatMap(task=>{
    const id=pendingByKey.get(task.task_key);
    if(!id)return [];
    if(task.input.matrixArtifact||task.input.hardwareTableArtifact||task.input.wallTableArtifact)return [id];
    if(task.kind==="plan"&&task.input.vectorArtifact)return [id];
    return paid++<paidLimit?[id]:[];
  });
}
