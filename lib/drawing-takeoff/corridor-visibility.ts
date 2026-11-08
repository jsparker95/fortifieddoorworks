import type {Point} from './geometry';
import type {TextBox} from './indexing';
import {planRegions,referenceHand} from './vector-regions';
import {joinedVectorPaths} from './vector-chains';
import {handFromVector,type VectorDoor,type VectorPath} from './vector-geometry';
import type {SourcePixels} from './tag-visibility';

type Card={label:TextBox;number:TextBox;area:TextBox;frame:{x:number;y:number;width:number;height:number}};
const center=(b:TextBox)=>b.x+b.width/2;

/** A fallback corridor anchor is a printed room card, not a nearby word:
 * corridor name, framed room number and floor area must agree spatially. */
export function corridorCards(boxes:TextBox[],paths:VectorPath[]):Card[]{
 const names=boxes.filter(b=>/^(?:(?:ENTRY|MAIN|EXIT|PUBLIC)[ -]+)?(?:CORRIDORS?|HALLWAY|HALL)(?:\s+[A-Z0-9-]+)?$/i.test(b.text.trim())&&b.height>0);
 if(!names.length)return [];
 const seen=new Set<string>(),frames=[...paths,...joinedVectorPaths(paths)].flatMap(path=>{
  const p=path.points;if(p.length!==5||p.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y))||Math.hypot(p[0].x-p[4].x,p[0].y-p[4].y)>.1)return [];
  if(p.slice(1).some((b,i)=>Math.min(Math.abs(b.x-p[i].x),Math.abs(b.y-p[i].y))>.05))return [];
  const x=Math.min(...p.map(q=>q.x)),y=Math.min(...p.map(q=>q.y)),width=Math.max(...p.map(q=>q.x))-x,height=Math.max(...p.map(q=>q.y))-y;
  if(width<4||height<4||width>80||height>60)return [];const key=[x,y,width,height].map(v=>v.toFixed(1)).join(':');if(seen.has(key))return [];seen.add(key);return [{x,y,width,height}];
 });
 return names.flatMap(label=>{
  const ids=boxes.filter(b=>/^\d{1,5}[A-Z]?$/i.test(b.text.trim())&&b.y>=label.y+label.height*.7&&b.y<label.y+label.height*2.5&&Math.abs(center(b)-center(label))<label.height*.6);
  if(ids.length!==1)return [];const number=ids[0];
  const areas=boxes.filter(b=>/^\d[\d,. ]*\s*(?:SF|S\.F\.|SQ\.?\s*FT\.?)$/i.test(b.text.trim())&&b.y>=number.y+number.height*.7&&b.y<number.y+number.height*2.5&&Math.abs(center(b)-center(number))<label.height*.6);
  const enclosing=frames.filter(b=>Math.abs(center(number)-b.x-b.width/2)<number.height*.25&&Math.abs(number.y+number.height/2-b.y-b.height/2)<number.height*.5&&b.height>number.height*.8&&b.height<number.height*1.8&&b.width>number.width*.85&&b.width<number.width+number.height*2);
  return areas.length===1&&enclosing.length===1?[{label,number,area:areas[0],frame:enclosing[0]}]:[];
 }).slice(0,16);
}

/** Direct source visibility avoids requiring every faint existing wall on a
 * large plan to form a closed raster region. It never infers an exterior side.
 * All actual ink (including gray) and all known closed openings block a ray.
 * Both normal and expanded barriers must support one side of one visible card. */
export function corridorVisibilityReference(image:SourcePixels,cards:Card[],doors:VectorDoor[]){
 const {width,height,scale,data,offsetX,offsetY}=image,count=width*height;
 if(offsetX!==0||offsetY!==0||!cards.length||![width,height,scale,offsetX,offsetY].every(Number.isFinite)||scale<=0||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Number.isInteger(count)||count<1||count>5_000_000||data.length!==count*4)return null;
 const at=(p:Point)=>({x:Math.round(p.x*scale-offsetX),y:Math.round(p.y*scale-offsetY)});
 const pixel=(x:number,y:number)=>x>=0&&y>=0&&x<width&&y<height?(y*width+x)*4:-1;
 const visibleText=(box:TextBox)=>{
  const a=at({x:box.x,y:box.y}),b=at({x:box.x+box.width,y:box.y+box.height});
  if(a.x<0||a.y<0||b.x>=width||b.y>=height||b.x-a.x<5||b.y-a.y<5)return false;
  let ink=0,total=0;const quadrants=new Set<number>(),rows=new Set<number>();
  for(let y=a.y;y<=b.y;y++)for(let x=a.x;x<=b.x;x++){const i=pixel(x,y);total++;if(data[i+3]>=128&&Math.max(data[i],data[i+1],data[i+2])<190){ink++;quadrants.add((x>(a.x+b.x)/2?1:0)+(y>(a.y+b.y)/2?2:0));rows.add(y);}}
  return ink/total>.02&&ink/total<.65&&quadrants.size===4&&rows.size>=3;
 };
 const visibleFrame=(b:Card['frame'])=>{
  const sides=[[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y}],[{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height}],[{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}],[{x:b.x,y:b.y+b.height},{x:b.x,y:b.y}]];
  return sides.every(([a,b])=>{let ink=0;for(let j=0;j<12;j++){const t=(j+.5)/12,p=at({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});let found=false;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=pixel(p.x+dx,p.y+dy);if(i>=0&&data[i+3]>=128&&Math.max(data[i],data[i+1],data[i+2])<190)found=true;}if(found)ink++;}return ink>=9;});
 };
 const printed=cards.filter(c=>visibleText(c.label)&&visibleText(c.number)&&visibleText(c.area)&&visibleFrame(c.frame));
 if(!printed.length)return null;
 const baseMask=new Uint8Array(count);
 for(let i=0;i<count;i++)baseMask[i]=data[i*4+3]<128||Math.min(data[i*4],data[i*4+1],data[i*4+2])<235?1:0;
 for(const door of doors){const steps=Math.ceil(door.radius*scale*2);if(!Number.isFinite(steps)||steps<1||steps>10_000)continue;
  for(let j=0;j<=steps;j++){const t=j/steps,p=at({x:door.hinge.x+(door.jamb.x-door.hinge.x)*t,y:door.hinge.y+(door.jamb.y-door.hinge.y)*t});for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(pixel(p.x+dx,p.y+dy)>=0)baseMask[(p.y+dy)*width+p.x+dx]=1;}
 }
 const expanded=baseMask.slice();for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(baseMask[y*width+x])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)expanded[(y+dy)*width+x+dx]=1;
 let visits=0,exhausted=false;
 const clear=(mask:Uint8Array,a:Point,b:Point)=>{
  const steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*scale*3);if(steps<1||!Number.isFinite(steps))return false;
  for(let j=0;j<=steps;j++){if(++visits>2_000_000){exhausted=true;return false;}const t=j/steps,p=at({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});if(pixel(p.x,p.y)<0||mask[p.y*width+p.x])return false;}return true;
 };
 // The entire card must sit in one locally unobstructed patch. This prevents
 // a seed beyond a long label or room-area line from landing across a wall.
 const cardBounds=(card:Card)=>({left:Math.min(card.label.x,card.number.x,card.area.x,card.frame.x)-4,right:Math.max(card.label.x+card.label.width,card.number.x+card.number.width,card.area.x+card.area.width,card.frame.x+card.frame.width)+4,top:Math.min(card.label.y,card.frame.y)-4,bottom:Math.max(card.area.y+card.area.height,card.frame.y+card.frame.height)+4});
 const visible=printed.filter(card=>{const b=cardBounds(card),corners=[{x:b.left,y:b.top},{x:b.right,y:b.top},{x:b.right,y:b.bottom},{x:b.left,y:b.bottom}];return corners.every((p,i)=>clear(expanded,p,corners[(i+1)%4]));});
 if(!visible.length||exhausted)return null;
 let grayMaps:Array<ReturnType<typeof planRegions>>|null=null;
 return {
  get exhausted(){return exhausted;},
  hand(door:VectorDoor){
   if(exhausted||door.paired||!Number.isFinite(door.radius)||door.radius<=0)return null;
   const axis={x:(door.jamb.x-door.hinge.x)/door.radius,y:(door.jamb.y-door.hinge.y)/door.radius},normal={x:-axis.y,y:axis.x},middle={x:(door.hinge.x+door.jamb.x)/2,y:(door.hinge.y+door.jamb.y)/2};
   const choices=[0,1].map(check=>visible.flatMap((card,cardIndex)=>[-1,1].flatMap(sign=>{
    const bounds=cardBounds(card),seeds=[{x:center(card.label),y:bounds.top},{x:center(card.label),y:bounds.bottom}],rays:Array<{from:Point;to:Point;offset:number;tangent:number}>=[];
    for(const from of seeds){if(Math.hypot(from.x-middle.x,from.y-middle.y)>door.radius*20)continue;
     for(const offset of [.35,.6,1.1])for(const tangent of [-.2,0,.2]){const to={x:middle.x+normal.x*sign*door.radius*offset+axis.x*tangent*door.radius,y:middle.y+normal.y*sign*door.radius*offset+axis.y*tangent*door.radius};if(clear(check===0?baseMask:expanded,from,to))rays.push({from,to,offset,tangent});}
    }
    return rays.length>=3&&new Set(rays.map(r=>r.offset)).size>=2&&new Set(rays.map(r=>r.tangent)).size>=2?[{card,cardIndex,sign,rays}]:[];
   })));
   if(exhausted||choices.some(c=>new Set(c.map(v=>v.sign)).size>1))return null;
   const shared=choices[1].find(b=>choices[0].some(a=>a.cardIndex===b.cardIndex&&a.sign===b.sign));
   if(shared){const hand=handFromVector(door,{x:normal.x*shared.sign,y:normal.y*shared.sign});
    return hand?{...hand,referenceKind:'corridor' as const,reference:`corridor side of printed ${shared.card.label.text} room ${shared.card.number.text}; unobstructed source sight lines`,method:'sight-lines' as const,proof:shared.rays.slice(0,3).map(r=>`(${r.from.x.toFixed(2)},${r.from.y.toFixed(2)}) to (${r.to.x.toFixed(2)},${r.to.y.toFixed(2)})`).join('; ')}:null;
   }
   // Printed tags/furniture can obscure a straight ray. An actually enclosed
   // gray-ink corridor is an independent proof, with exterior inference off.
   // Reuse the existing region algorithm and the current verified door seals.
   if(!grayMaps){const source=data instanceof Uint8ClampedArray?data:new Uint8ClampedArray(data.buffer,data.byteOffset,data.byteLength);grayMaps=[false,true].map(dilate=>planRegions(source,width,height,scale,doors,dilate,{inkThreshold:235}));}
   const candidates=visible.flatMap(card=>{const b=cardBounds(card),hands=grayMaps!.map(map=>{
    const ids=[b.top,b.bottom].map(y=>{const p=at({x:center(card.label),y});return pixel(p.x,p.y)>=0?map.ids[p.y*width+p.x]:0;});
    if(!ids[0]||ids[0]!==ids[1]||map.border[ids[0]]||map.areas[ids[0]]<1000||map.areas[ids[0]]>=count*.15)return null;
    return referenceHand(map,{labels:[{...card.label,region:ids[0]}],exterior:new Set<number>()},door);
   });return hands[0]&&hands[1]&&hands[0].handing===hands[1].handing?[{card,hand:hands[0]}]:[];});
   if(new Set(candidates.map(c=>c.hand.handing)).size!==1)return null;
   const selected=candidates[0];return {...selected.hand,reference:`corridor side of printed ${selected.card.label.text} room ${selected.card.number.text}; enclosed gray-ink corridor`,method:'enclosed-region' as const,proof:`Visible framed corridor card at (${center(selected.card.label).toFixed(2)},${selected.card.label.y.toFixed(2)}) belongs to an enclosed region reaching only one doorway side in both source masks; no exterior reference used`};
  }
 };
}
