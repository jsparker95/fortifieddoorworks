import {scheduleSearchDescription} from './search-description';
import {isSheetIndexPage,type PageIndex,type PageFinding} from './indexing';
export type HandingPageFinding={page:number;description:string;evidence:string;confidence:number};

/** Locate source information, never determine an individual door's hand. */
export function findHandingPages(pages:PageIndex[],findings:PageFinding[]):HandingPageFinding[]{
 return pages.flatMap(page=>{
  if(isSheetIndexPage(page))return [];
  const finding=findings.find(f=>f.page===page.page),evidence=finding?.evidence||'';
  const referenceOnly=/\b(?:see|refer\w*|listed in|index listing)\b.{0,45}\b(?:handing|door swing)\b/i.test(evidence)&&!/\b(?:visible|shown|symbols|arcs|column|diagram)\b/i.test(evidence);
  const visual=!referenceOnly&&(finding?.kinds.includes('handing')||finding?.kinds.includes('plan')&&/\bdoor\s+swings?\b|\bswing\s+(?:arcs?|symbols?)\b/i.test(evidence));
  const title=page.lines.find(line=>line.length<140&&!/\b(?:SEE|REFER|REFERENCE)\b/i.test(line)&&/\b(?:DOOR\s+HANDING|HANDING\s+(?:DIAGRAM|LEGEND|CHART)|(?:LEFT|RIGHT)[ -]HAND\s+(?:DOOR|SWING))\b/i.test(line));
  const printedSchedule=finding?.kinds.includes('door')&&page.lines.some(line=>/\b(?:HANDING|HAND|SWING)\b/i.test(line))&&/\b(?:LH|RH|LHR|RHR)\b/.test(page.text);
  if(!visual&&!title&&!printedSchedule)return [];
  return [{page:page.page,description:printedSchedule?'Door schedule with printed handing / swing information.':title?'Door handing diagram or legend.':'Drawing with visible door swing information for manual review.',evidence:visual?evidence:title||'Printed schedule header and handing codes on this sheet.',confidence:visual ? .9 : .95}];
 });
}

/** Discard both new and historical automatic interpretations, including review labels. */
export function withoutAutomaticHanding<T extends object>(row:T){return {...row,handing:'',handingEvidence:'',hingeSide:'unknown' as const,swingDirection:'unclear' as const};}

export function handingSearchDescription(schedules:Parameters<typeof scheduleSearchDescription>[0],pages:HandingPageFinding[]){
 return scheduleSearchDescription(schedules)+(pages.length?` Handing / door swing information on PDF pages ${pages.map(p=>p.page).join(', ')}. Review these pages to enter handing manually.`:' No handing / door swing information was confirmed.');
}
