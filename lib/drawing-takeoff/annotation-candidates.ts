import type {Opening,PageIndex,TextBox} from './indexing';

type Inventory=Opening&{sourceBuilding?:string};
export type AnnotationCandidate=Inventory&{
  sourceAnnotation:true;autoImportEligible:false;associationStatus:'suggested'|'ambiguous'|'unmatched'|'repeated-label';
  associationEvidence:string;sourceCatalogCode:string;sourceSchedulePage?:number;sourceLabelBounds:string;sourceLabelPages:string;sourceCatalogLabelBounds?:string;
};
const key=(value:string)=>value.trim().toUpperCase();
export const catalogOpeningKey=(page:number,mark:string)=>`${page}:${key(mark)}`;

/** Proximity proposes an association for review; it never establishes a physical opening. */
export function resolveAnnotationCandidates(pages:PageIndex[],inventory:Inventory[]){
  const byCode=new Map<string,Inventory[]>();
  for(const row of inventory){const code=key(row.mark);byCode.set(code,[...(byCode.get(code)||[]),row]);}
  const occurrences=new Map<string,Array<{page:PageIndex;tag:TextBox}>>();
  for(const page of pages)for(const tag of page.annotationTags||[]){const id=key(tag.text);occurrences.set(id,[...(occurrences.get(id)||[]),{page,tag}]);}
  const provisional:Array<{candidate:AnnotationCandidate;catalog?:Inventory;reuseCatalog?:Inventory;codeBox?:TextBox}>=[];
  for(const locations of occurrences.values()){
    const {page,tag}=locations[0],center={x:tag.x+tag.width/2,y:tag.y+tag.height/2};
    const matches=page.boxes.filter(box=>byCode.has(key(box.text))).map(box=>({box,distance:Math.hypot(box.x+box.width/2-center.x,box.y+box.height/2-center.y)})).sort((a,b)=>a.distance-b.distance);
    const first=matches[0],second=first&&matches.find(match=>key(match.box.text)!==key(first.box.text));
    const choices=first?byCode.get(key(first.box.text))!:[];
    const nearby=first&&first.distance<=tag.height*10;
    const ambiguous=nearby&&(choices.length!==1||!!second&&second.distance<first.distance*1.35);
    const status=locations.length>1?'repeated-label':!nearby?'unmatched':ambiguous?'ambiguous':'suggested';
    const catalog=status==='suggested'?choices[0]:undefined;
    const reuseCatalog=nearby&&!ambiguous?choices[0]:undefined;
    const explanation=status==='suggested'
      ?`Suggested printed schedule code ${catalog!.mark} on PDF page ${catalog!.sourcePage}. Confirm that this label and code belong to the same doorway before saving.`
      :status==='repeated-label'?`This label appears ${locations.length} times on PDF pages ${[...new Set(locations.map(location=>location.page.page))].join(', ')}. Confirm whether these are repeated views or different openings.`
      :status==='ambiguous'?'More than one schedule association is plausible. Dimensions and type are withheld until reviewed.'
      :'No nearby printed schedule code could be associated reliably. Review the labeled doorway on the source page.';
    const candidate:AnnotationCandidate={mark:tag.text,room:catalog?.room||'',width:catalog?.width||'',height:catalog?.height||'',handing:'',doorType:catalog?.mark||'',frameType:catalog?.frameType||'',wallType:'',hardwareGroup:catalog?.hardwareGroup||'',fireRating:catalog?.fireRating||'',quantity:'1',sourcePage:page.page,
      evidence:`Visible PDF annotation “${tag.text}” on PDF page ${page.page}. ${explanation}${catalog?` Schedule evidence: ${catalog.evidence}`:''}`,
      confidence:catalog?0.6:0.4,sourceAnnotation:true,autoImportEligible:false,associationStatus:status,associationEvidence:explanation,
      sourceCatalogCode:catalog?.mark||'',sourceSchedulePage:catalog?.sourcePage,sourceCatalogLabelBounds:catalog&&first?JSON.stringify({page:page.page,...first.box}):'',sourceLabelBounds:JSON.stringify(locations.map(location=>({page:location.page.page,...location.tag}))),sourceLabelPages:[...new Set(locations.map(location=>location.page.page))].join(', '),sourceBuilding:catalog?.sourceBuilding||''};
    provisional.push({candidate,catalog,reuseCatalog,codeBox:reuseCatalog?first?.box:undefined});
  }
  // Repeated codes at different drawing locations establish reusable schedule
  // definitions, not one physical opening per schedule row.
  const reuse=new Map<string,{locations:Set<string>;labels:Set<string>}>();
  for(const item of provisional)if(item.reuseCatalog&&item.codeBox){
    const code=catalogOpeningKey(item.reuseCatalog.sourcePage,item.reuseCatalog.mark),evidence=reuse.get(code)||{locations:new Set<string>(),labels:new Set<string>()};
    evidence.locations.add(`${item.candidate.sourcePage}:${Math.round(item.codeBox.x*10)}:${Math.round(item.codeBox.y*10)}`);evidence.labels.add(key(item.candidate.mark));reuse.set(code,evidence);
  }
  const catalogPages=new Set(inventory.filter(row=>{const evidence=reuse.get(catalogOpeningKey(row.sourcePage,row.mark));return row.scheduleRole==='catalog'||evidence&&evidence.locations.size>=2&&evidence.labels.size>=2;}).map(row=>row.sourcePage));
  const openingCatalog=inventory.filter(row=>catalogPages.has(row.sourcePage)).map(row=>({...row,scheduleRole:'catalog' as const,autoImportEligible:false}));
  const physicalIds=new Set(inventory.filter(row=>!catalogPages.has(row.sourcePage)).map(row=>key(row.mark)));
  const candidates=provisional.filter(item=>!physicalIds.has(key(item.candidate.mark))&&(item.catalog?catalogPages.has(item.catalog.sourcePage):openingCatalog.length>0)).map(item=>item.candidate);
  const catalogDefinitions=openingCatalog.map(row=>({code:row.mark,description:row.room,material:row.doorMaterial||'',manufacturer:'',windowOrLouver:'',fireRating:row.fireRating,width:row.width,height:row.height,frameType:row.frameType,hardwareGroup:row.hardwareGroup,sourcePage:row.sourcePage,sourceBuilding:row.sourceBuilding,sourceCatalogFormat:row.sourceCatalogFormat,
    evidence:`Reusable schedule entry ${row.mark}. ${row.evidence}`,confidence:row.confidence,autoImportEligible:false,sourceCatalogDefinition:true,sourceCatalogCode:row.mark,sourceSchedulePage:row.sourcePage}));
  return {candidates,openingCatalog,catalogDefinitions,catalogPages};
}
