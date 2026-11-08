import type {PageIndex,TextBox} from './indexing';
import type {PrintedTagShape} from './printed-tag-shapes';
import {registerOverlappingViews,repeatedTagLocations} from './overlapping-views';
import {registerGridViews} from './grid-view-registration';

export type PrintedReviewEvidence={page:number;shape:PrintedTagShape;visibility:string;visibilityReason?:string;doorContext:'single'|'paired'|'ambiguous'|'unverified';sourceBuilding?:string};
const locationKey=(page:number,box:TextBox)=>`printed:${page}:${box.text.trim()}:${box.x.toFixed(1)}:${box.y.toFixed(1)}`;
const scope=(page:PageIndex)=>{
 const titles=(page.lines.length?page.lines:[page.text]).flatMap(line=>{const match=line.trim().match(/^ENLARGED(?:\s+FLOOR)?\s+PLAN\s*-\s*(LEVEL\s+\d+|ROOF)(?:\s*-?\s*[A-Z])?\s*(?:NORTH)?$/i);return match?[match[1].toUpperCase().replace(/\s+/g,' ')]:[];});
 const unique=[...new Set(titles)];return unique.length===1?unique[0]:'';
};

/** Convert server-generated source evidence into held review rows. Neither an
 * oval nor a suggested overlap establishes an opening count or a swing hand. */
export function printedReviewCandidates(evidence:unknown[],definitions:Array<Record<string,unknown>>,pages:PageIndex[]=[],annotated:Array<Record<string,unknown>>=[]){
 const unique=new Map<string,PrintedReviewEvidence>();
 for(const value of evidence){
  const item=value as PrintedReviewEvidence;
  const b=item?.shape?.label;
  if(!item||!Number.isInteger(item.page)||item.page<1||!['printed-capsule','printed-circle'].includes(item.shape?.kind)||!b||typeof item.shape.text!=='string'||typeof b.text!=='string'||item.shape.text!==b.text||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0||!item.shape.outline||![item.shape.outline.x,item.shape.outline.y,item.shape.outline.width,item.shape.outline.height].every(Number.isFinite)||!['visible-outline','not-confirmed'].includes(item.visibility)||!['single','paired','ambiguous','unverified'].includes(item.doorContext))continue;
  const key=locationKey(item.page,b),previous=unique.get(key);
  if(!previous)unique.set(key,item);
  else if(previous.visibility!==item.visibility||previous.doorContext!==item.doorContext)unique.set(key,{...previous,visibility:'not-confirmed',doorContext:'ambiguous'});
 }
 const duplicates=new Map<string,Array<Record<string,unknown>>>(),add=(key:string,value:Record<string,unknown>)=>duplicates.set(key,[...(duplicates.get(key)||[]),value]);
 for(const [key,item] of unique)for(const label of annotated){
  if(label.sourceAnnotation!==true||typeof label.sourceCatalogLabelBounds!=='string')continue;
  try{const box=JSON.parse(label.sourceCatalogLabelBounds);if(box.page===item.page&&box.text===item.shape.label.text&&Math.abs(box.x-item.shape.label.x)<.1&&Math.abs(box.y-item.shape.label.y)<.1)add(key,{locationKey:`annotation:${label.sourcePage}:${label.mark}`,page:item.page,annotationMark:label.mark,catalogLabelBounds:box,annotationLabelBounds:label.sourceLabelBounds});}catch{/* Invalid prior metadata supplies no duplicate proof. */}
 }
 const sourcePages=pages.filter(page=>[...unique.values()].some(item=>item.page===page.page));
 const overlapBudgetExceeded=sourcePages.length>64;
 if(!overlapBudgetExceeded)for(let i=0;i<sourcePages.length;i++)for(let j=i+1;j<sourcePages.length;j++){
  const a=sourcePages[i],b=sourcePages[j],aScope=scope(a),bScope=scope(b);if(!aScope||aScope!==bScope)continue;
  const buildings=(page:number)=>[...new Set([...unique.values()].filter(item=>item.page===page).map(item=>item.sourceBuilding||''))];
  const aBuildings=buildings(a.page),bBuildings=buildings(b.page);if(aBuildings.length!==1||bBuildings.length!==1||aBuildings[0]!==bBuildings[0])continue;
  const registration=registerOverlappingViews({page:a,scope:aScope},{page:b,scope:bScope})||registerGridViews({page:a,scope:aScope},{page:b,scope:bScope});if(!registration)continue;
  const labels=(page:number)=>[...unique.values()].filter(item=>item.page===page).map(item=>item.shape.label);
  for(const match of repeatedTagLocations(registration,labels(a.page),labels(b.page))){
   const from=locationKey(a.page,match.from),to=locationKey(b.page,match.to),proof={method:registration.method||'room-anchors',scope:registration.scope,sourceBuilding:aBuildings[0],anchors:registration.anchors,axisAnchors:registration.axisAnchors,dx:registration.dx,dy:registration.dy};
   add(from,{locationKey:to,page:b.page,label:match.to,registration:proof});add(to,{locationKey:from,page:a.page,label:match.from,registration:proof});
  }
 }
 return [...unique].map(([key,item])=>{
  const code=item.shape.text.trim(),choices=definitions.filter(d=>d.sourceCatalogDefinition===true&&Number.isInteger(d.sourcePage)&&Number(d.sourcePage)>0&&(!item.sourceBuilding||String(d.sourceBuilding||'')===item.sourceBuilding)&&String(d.code).trim().toUpperCase()===code.toUpperCase());
  const verified=item.visibility==='visible-outline'&&['single','paired'].includes(item.doorContext),definition=verified&&choices.length===1?choices[0]:undefined;
  const association=definition?'suggested':choices.length>1?'ambiguous':'unmatched';
  const border=item.visibilityReason||(item.visibility==='visible-outline'?'The oval border is visible.':'The complete oval border needs source review.');
  const context={single:'A nearby swing arc and door leaf were confirmed.',paired:'Nearby paired leaves were found; handing stays blank.',ambiguous:'More than one nearby swing symbol may belong to this label.',unverified:'A complete nearby swing symbol could not be confirmed.'}[item.doorContext];
  const explanation=`Printed code ${code} on PDF page ${item.page}. ${border} ${context} ${definition?'A unique printed catalog entry is suggested.':'Dimensions and type remain blank until reviewed.'} Enter an opening identifier after checking the source.${duplicates.has(key)?' Another drawing label or aligned view may show this same location. Do not add both unless they are separate openings.':''}${overlapBudgetExceeded?' Overlap comparison exceeded the page budget. Check source views manually before adding this as a separate opening.':''}`;
  return {mark:`Unnumbered p${item.page} (${item.shape.label.x.toFixed(1)}, ${item.shape.label.y.toFixed(1)})`,sourcePrintedTag:true,sourceLocationKey:key,sourcePrintedCode:code,sourceAnnotation:false,autoImportEligible:false,
   room:String(definition?.description||''),width:String(definition?.width||''),height:String(definition?.height||''),doorType:String(definition?.code||''),frameType:String(definition?.frameType||''),hardwareGroup:String(definition?.hardwareGroup||''),fireRating:String(definition?.fireRating||''),wallType:'',handing:'',quantity:'1',confidence:definition ? 0.6 : 0.3,
   sourcePage:item.page,sourceBuilding:String(definition?.sourceBuilding||''),sourceCatalogCode:String(definition?.code||''),sourceSchedulePage:definition?.sourcePage,
   sourceLabelBounds:JSON.stringify([{page:item.page,...item.shape.label,outline:item.shape.outline}]),sourceLabelPages:[...new Set([item.page,...(duplicates.get(key)||[]).map(other=>Number(other.page))])].join(', '),sourceVisibility:item.visibility,sourceVisibilityReason:border,sourceDoorContext:item.doorContext,
   sourcePossibleDuplicates:JSON.stringify(duplicates.get(key)||[]),sourceOverlapReviewRequired:overlapBudgetExceeded,associationStatus:association,associationEvidence:explanation,evidence:explanation};
 });
}
