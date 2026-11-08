import type {PageIndex,TextBox} from './indexing';
import {hardwareHeadings} from './hardware-headings';
import type {MatrixResult} from './hardware-matrix';

const centerY=(box:TextBox)=>box.y+box.height/2;

/** Segment actual QTY/DESCRIPTION/CATALOG/FINISH/MFR columns. A numeral in
 * a model or a neighboring drawing cannot become a component quantity. */
export function readHardwareTable(page:PageIndex):(MatrixResult&{sourceMethod:'source/hardware-table';complete:boolean})|null {
 const headings=page.boxes.flatMap(box=>{
  const found=hardwareHeadings(box.text);return found.length===1&&found[0].index===0?[{...box,group:found[0].identifier}]:[];
 });
 if(!headings.length)return null;
 const hardwareGroups:MatrixResult['hardwareGroups']=[],uncertainties:string[]=[];
 let complete=true;
 for(const heading of headings){
  const headerCandidates=page.boxes.filter(box=>box.y>heading.y+heading.height&&box.y<heading.y+70&&box.x>=heading.x-3);
  const qty=headerCandidates.filter(box=>/^(?:QTY|QUANTITY)$/i.test(box.text.trim())&&Math.abs(box.x-heading.x)<10);
  const header=qty.length===1?qty[0]:null;
  const columns=header?['DESCRIPTION','CATALOG NUMBER','FINISH','MFR'].map(label=>headerCandidates.filter(box=>box.text.trim().toUpperCase()===label&&Math.abs(centerY(box)-centerY(header))<3)):[];
  if(!header||columns.length!==4||columns.some(matches=>matches.length!==1)){complete=false;uncertainties.push(`PDF page ${page.page}: hardware group ${heading.group} has ambiguous table columns; review the source.`);continue;}
  const [description,catalog,finish,mfr]=columns.map(matches=>matches[0]);
  if(!(header.x<description.x&&description.x<catalog.x&&catalog.x<finish.x&&finish.x<mfr.x)){complete=false;continue;}
  const next=headings.filter(other=>Math.abs(other.x-heading.x)<10&&other.y>heading.y).sort((a,b)=>a.y-b.y)[0];
  const bottom=next?.y||Math.min(page.height,header.y+700);
  // The last column may contain wrapped brand names. Stop before a separate panel.
  const right=Math.min(page.width,mfr.x+Math.max(65,(mfr.x-finish.x)*2));
  const body=page.boxes.filter(box=>box.y>header.y+header.height&&box.y<bottom&&box.x>=header.x-3&&box.x<right&&box.x+box.width<=right+4);
  const quantities=body.filter(box=>/^\d+(?:\s+(?:EA|EACH|PR|PAIR|SET|SETS))?$/i.test(box.text.trim())&&Math.abs(box.x-header.x)<4).sort((a,b)=>a.y-b.y);
  if(!quantities.length){complete=false;uncertainties.push(`PDF page ${page.page}: hardware group ${heading.group} has no unambiguous quantity column; review the source.`);continue;}
  for(let i=0;i<quantities.length;i++){
   const quantity=quantities[i],end=quantities[i+1]?.y||bottom;
   const row=body.filter(box=>centerY(box)>=quantity.y-2&&box.y<end-2&&box!==quantity);
   const inColumn=(left:number,rightEdge:number)=>row.filter(box=>box.x>=left-3&&box.x<rightEdge-3).sort((a,b)=>a.y-b.y||a.x-b.x).map(box=>box.text.trim()).filter(Boolean).join(' ');
   const detail=inColumn(description.x,catalog.x),model=inColumn(catalog.x,finish.x);
   let surface=inColumn(finish.x,mfr.x),brand=inColumn(mfr.x,right);
   if(!brand){
    const printedBrands=[...new Set(body.filter(box=>Math.abs(box.x-mfr.x)<4&&/^[A-Z]{2,10}(?:[ -][A-Z]{2,10})?$/.test(box.text.trim())).map(box=>box.text.trim()))];
    const merged=row.filter(box=>Math.abs(box.x-finish.x)<4&&box.x+box.width>mfr.x+4);
    const matches=printedBrands.filter(value=>merged.some(box=>box.text.trim().endsWith(' '+value)));
    if(matches.length===1){brand=matches[0];surface=surface.slice(0,-brand.length).trim();}
   }
   // Wide full-sentence notes below the final line are not manufacturer/model cells.
   const firstDetail=row.find(box=>Math.abs(centerY(box)-centerY(quantity))<3&&box.x>=description.x-3&&box.x<catalog.x-3);
   if(!firstDetail||!detail){complete=false;uncertainties.push(`PDF page ${page.page}: hardware group ${heading.group}, quantity row ${i+1} has missing component columns; review the source.`);continue;}
   if(!brand)uncertainties.push(`PDF page ${page.page}: hardware group ${heading.group}, quantity row ${i+1} does not specify a separate manufacturer; its printed component and quantity were retained.`);
   const unit=quantity.text.match(/\b(EA|EACH|PR|PAIR|SETS?)\b/i)?.[1]||row.find(box=>box.x<description.x-3&&/^(?:EA|EACH|PR|PAIR|SETS?)$/i.test(box.text.trim()))?.text.trim()||'';
   const component=[unit&&!/^(?:EA|EACH)$/i.test(unit)?`[${unit}]`:'',detail,model,surface].filter(Boolean).join(' ');
   hardwareGroups.push({group:heading.group,name:heading.text,component,brand,quantity:Number(quantity.text.match(/^\d+/)![0]),quantityKnown:true,
    frameModification:'',doorModification:'',doorPrep:'',sourcePage:page.page,sourceHardwareLine:String(i),confidence:.99,
    evidence:`${heading.text}\n${quantity.text} ${unit&& !quantity.text.includes(unit)?unit+' ':''}${[detail,model,surface,brand].filter(Boolean).join(' ')}`});
  }
 }
 return {hardwareGroups,openingGroups:[],readings:[],uncertainties,sourceMethod:'source/hardware-table',complete};
}
