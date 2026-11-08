import type {TextBox} from './indexing';
import type {VectorPath} from './vector-geometry';
import type {SourcePixels} from './tag-visibility';
import type {RegionMap} from './vector-regions';
import {handFromVector,type VectorDoor} from './vector-geometry';
export type EntryRoomContext={mark:string;description:string;profileCode:string;sourceSchedulePage:number};
export type EntryRoomCard={mark:string;profileCode:string;sourceSchedulePage:number;description:string;roomLabel:string;bounds:{x:number;y:number;width:number;height:number}};
type Span={from:number;to:number};
const middleX=(box:TextBox)=>box.x+box.width/2;

/** A printed room card must identify this opening's unit, contain a room name,
 * and have four complete architectural frame edges. A nearby word or room on
 * the other side of a wall cannot establish the entry's reference side. */
export function entryRoomCards(boxes:TextBox[],paths:VectorPath[],contexts:EntryRoomContext[]):EntryRoomCard[]{
 if(!contexts.length)return [];
 const horizontal=new Map<number,Span[]>(),vertical=new Map<number,Span[]>();
 const add=(map:Map<number,Span[]>,axis:number,a:number,b:number)=>{
  const key=Math.round(axis*10),spans=map.get(key)||[];spans.push({from:Math.min(a,b),to:Math.max(a,b)});map.set(key,spans);
 };
 for(const path of paths)for(let i=1;i<path.points.length;i++){
  const a=path.points[i-1],b=path.points[i];if(![a.x,a.y,b.x,b.y].every(Number.isFinite))continue;
  if(Math.abs(a.y-b.y)<.05&&Math.abs(a.x-b.x)>2)add(horizontal,(a.y+b.y)/2,a.x,b.x);
  if(Math.abs(a.x-b.x)<.05&&Math.abs(a.y-b.y)>2)add(vertical,(a.x+b.x)/2,a.y,b.y);
 }
 const covers=(map:Map<number,Span[]>,axis:number,from:number,to:number)=>{
  const key=Math.round(axis*10),spans=[-1,0,1].flatMap(offset=>map.get(key+offset)||[]).sort((a,b)=>a.from-b.from);
  let end=from;for(const span of spans){if(span.from>end+.2)break;if(span.to>end)end=span.to;if(end>=to-.2)return true;}return false;
 };
 const xs=[...vertical.keys()].map(x=>x/10),ys=[...horizontal.keys()].map(y=>y/10),cards:EntryRoomCard[]=[];
 for(const context of contexts){
  if(!/\bGUEST\s*ROOM\b.*\bENTRY\b/i.test(context.description)||!context.mark.trim())continue;
  const ids=boxes.filter(box=>box.text.trim().toUpperCase()===context.mark.trim().toUpperCase()&&box.height>0);
  const frames:EntryRoomCard[]=[];
  for(const id of ids){
   const centered=boxes.filter(box=>box!==id&&Math.abs(middleX(box)-middleX(id))<Math.max(2,id.height*.8)&&box.y<id.y&&box.y>id.y-80&&box.text.length<80);
   const names=centered.filter(box=>/\b(?:GUEST\s*ROOM|STUDIO|BEDROOM|KING|QUEEN)\b/i.test(box.text));
   if(!names.length)continue;
   const topName=Math.min(...names.map(box=>box.y));
   const cluster=[id,...centered.filter(box=>box.y>=topName&&(names.includes(box)||/^[A-Z]\d{2,4}$/i.test(box.text.trim())))];
   const left=Math.min(...cluster.map(box=>box.x)),right=Math.max(...cluster.map(box=>box.x+box.width)),top=topName,bottom=id.y+id.height;
   if(bottom-top>80||right-left>180)continue;
   const lefts=xs.filter(x=>x<left&&x>left-24&&covers(vertical,x,top,bottom)).sort((a,b)=>b-a).slice(0,4),rights=xs.filter(x=>x>right&&x<right+24&&covers(vertical,x,top,bottom)).sort((a,b)=>a-b).slice(0,4);
   const tops=ys.filter(y=>y<top&&y>top-16&&covers(horizontal,y,left,right)).sort((a,b)=>b-a).slice(0,4),bottoms=ys.filter(y=>y>bottom&&y<bottom+16&&covers(horizontal,y,left,right)).sort((a,b)=>a-b).slice(0,4);
   for(const x of lefts)for(const r of rights)for(const y of tops)for(const b of bottoms){
    if(r-x>200||b-y>100||!covers(horizontal,y,x,r)||!covers(horizontal,b,x,r)||!covers(vertical,x,y,b)||!covers(vertical,r,y,b))continue;
    const bounds={x,y,width:r-x,height:b-y};
    if(frames.some(card=>Object.keys(bounds).every(key=>Math.abs(card.bounds[key as keyof typeof bounds]-bounds[key as keyof typeof bounds])<.3)))continue;
    frames.push({...context,roomLabel:[...names].sort((a,b)=>a.y-b.y).map(box=>box.text).join(' '),bounds});
   }
  }
  if(frames.length===1)cards.push(frames[0]);
 }
 return cards;
}

/** Source paths may be clipped or painted over. Require visible ink and nearby
 * contrast on every side of the room card before using its surroundings. */
export function roomCardVisible(card:EntryRoomCard,image:SourcePixels){
 const b=card.bounds;
 if(![b.x,b.y,b.width,b.height,image.width,image.height,image.scale,image.offsetX,image.offsetY].every(Number.isFinite)||image.scale<=0||b.width<=0||b.height<=0||Math.min(b.width,b.height)*image.scale<18||image.data.length!==image.width*image.height*4)return false;
 const radius=Math.max(1,Math.ceil(image.scale*.35));let clipped=false;
 const pixel=(x:number,y:number)=>{const xx=Math.round(x*image.scale-image.offsetX),yy=Math.round(y*image.scale-image.offsetY);if(xx<0||yy<0||xx>=image.width||yy>=image.height){clipped=true;return null;}return (yy*image.width+xx)*4;};
 const light=(x:number,y:number)=>{const i=pixel(x,y);return i!==null&&image.data[i+3]>=128&&Math.max(image.data[i],image.data[i+1],image.data[i+2])>210;};
 const ink=(x:number,y:number)=>{for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const i=pixel(x+dx/image.scale,y+dy/image.scale);if(i!==null&&image.data[i+3]>=128&&Math.max(image.data[i],image.data[i+1],image.data[i+2])<190)return true;}return false;};
 const sides=[Array.from({length:12},(_,i)=>({x:b.x+b.width*(i+.5)/12,y:b.y,nx:0,ny:-1})),Array.from({length:12},(_,i)=>({x:b.x+b.width*(i+.5)/12,y:b.y+b.height,nx:0,ny:1})),
  Array.from({length:12},(_,i)=>({x:b.x,y:b.y+b.height*(i+.5)/12,nx:-1,ny:0})),Array.from({length:12},(_,i)=>({x:b.x+b.width,y:b.y+b.height*(i+.5)/12,nx:1,ny:0}))];
 const coverage=sides.map(points=>points.filter(p=>ink(p.x,p.y)&&(light(p.x+p.nx*2,p.y+p.ny*2)||light(p.x-p.nx*2,p.y-p.ny*2))).length/points.length);
 return !clipped&&coverage.every(value=>value>=.75)&&coverage.reduce((a,b)=>a+b,0)/4>=.85;
}


function regionAt(map:RegionMap,x:number,y:number){
 const xx=Math.round(x*map.scale),yy=Math.round(y*map.scale);
 return xx>=0&&xx<map.width&&yy>=0&&yy<map.height?map.ids[yy*map.width+xx]:0;
}
function cardSeeds(map:RegionMap,card:EntryRoomCard){
 const b=card.bounds;
 return [[-1,0],[1,0],[0,-1],[0,1]].map(([nx,ny])=>[.25,.5,.75].map(t=>regionAt(map,
  nx?b.x+(nx>0?b.width:0)+nx*3:b.x+b.width*t,
  ny?b.y+(ny>0?b.height:0)+ny*3:b.y+b.height*t)));
}

/** A source-described guestroom entry uses the side outside that exact unit as
 * its reference. Require an enclosed region around the framed card, no other
 * unit card in that region, and unambiguous samples on just one doorway side.
 * This also rejects a colored wall lost while suppressing dimension markup. */
export function entryRoomHand(map:RegionMap,card:EntryRoomCard,door:VectorDoor,otherCards:EntryRoomCard[]){
 if(door.paired||!Number.isFinite(door.radius)||door.radius<=0)return null;
 const edges=cardSeeds(map,card),ids=edges.flat().filter(Boolean);
 const regions=[...new Set(ids)].filter(id=>ids.filter(value=>value===id).length>=6&&edges.filter(edge=>edge.includes(id)).length>=2
  &&!map.border[id]&&map.areas[id]>1000&&map.areas[id]<map.width*map.height*.6);
 if(regions.length!==1)return null;
 const region=regions[0];
 if(otherCards.some(other=>other.mark.trim().toUpperCase()!==card.mark.trim().toUpperCase()&&cardSeeds(map,other).flat().filter(id=>id===region).length>=2))return null;
 const middle={x:(door.hinge.x+door.jamb.x)/2,y:(door.hinge.y+door.jamb.y)/2};
 const axis={x:door.jamb.x-door.hinge.x,y:door.jamb.y-door.hinge.y},normal={x:-axis.y/door.radius,y:axis.x/door.radius};
 const sides=[1,-1].map(sign=>({sign,votes:[.15,.35,.6,1.1,1.4].flatMap(offset=>[-.2,0,.2].map(tangent=>regionAt(map,
  middle.x+sign*normal.x*door.radius*offset+axis.x*tangent,middle.y+sign*normal.y*door.radius*offset+axis.y*tangent))).filter(id=>id===region).length}));
 const chosen=sides.filter(side=>side.votes>=4);
 if(chosen.length!==1||sides.some(side=>side.sign!==chosen[0].sign&&side.votes>0))return null;
 const hand=handFromVector(door,{x:-normal.x*chosen[0].sign,y:-normal.y*chosen[0].sign});
 return hand?{...hand,referenceKind:'unit-entry' as const,reference:`outside guestroom ${card.mark}; printed ${card.roomLabel} room card and guestroom-entry schedule on PDF page ${card.sourceSchedulePage}`} : null;
}

type ContextAnalysis={openings?:Array<Record<string,unknown>>;annotationOpeningCandidates?:Array<Record<string,unknown>>};
/** Suggestions can supply review evidence, never turn catalog rows or ambiguous
 * annotations into physical openings. Exact unit cards must still prove sides. */
export function entryContextsForPage(analysis:ContextAnalysis|undefined,page:number):EntryRoomContext[]{
 const rows=[...(analysis?.openings||[]).filter(row=>row.autoImportEligible!==false&&row.scheduleRole!=='catalog'),
  ...(analysis?.annotationOpeningCandidates||[]).filter(row=>row.sourceAnnotation===true&&row.associationStatus==='suggested'&&
   (Number(row.sourcePage)===page||String(row.sourceLabelPages||'').split(',').map(Number).includes(page)))];
 const byMark=new Map<string,EntryRoomContext[]>();
 for(const row of rows){
  const mark=String(row.mark||'').trim(),description=String(row.room||'').trim(),profileCode=String(row.sourceCatalogCode||row.doorType||'').trim(),sourceSchedulePage=Number(row.sourceSchedulePage||row.sourcePage);
  if(!mark||!profileCode||!Number.isInteger(sourceSchedulePage)||sourceSchedulePage<1||!/\bGUEST\s*ROOM\b.*\bENTRY\b/i.test(description))continue;
  const key=mark.toUpperCase(),context={mark,description,profileCode,sourceSchedulePage},values=byMark.get(key)||[];
  if(!values.some(c=>c.description===description&&c.profileCode===profileCode&&c.sourceSchedulePage===sourceSchedulePage))values.push(context);
  byMark.set(key,values);
 }
 return [...byMark.values()].flatMap(values=>values.length===1?values:[]).sort((a,b)=>a.mark.localeCompare(b.mark));
}
