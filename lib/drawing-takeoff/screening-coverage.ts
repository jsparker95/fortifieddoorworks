type Screen = {input:{pages:number[]};status:string;result?:{pages?:Array<{page:number}>}|null};

/** A regrouped successful segment can cover pages from an older failed batch. */
export function screeningCoverage(screens:Screen[]) {
  const completed=new Set(screens.filter(task=>task.status==='complete').flatMap(task=>(task.result?.pages||[])
    .map(row=>task.input.pages[row.page-1]).filter((page):page is number=>Number.isInteger(page)&&page>0)));
  const unchecked=[...new Set(screens.flatMap(task=>task.input.pages))].filter(page=>!completed.has(page));
  return {completed,unchecked};
}

export function needsScreening(task:Screen,completed:Set<number>) {
  return task.status!=='complete'&&task.input.pages.some(page=>!completed.has(page));
}
