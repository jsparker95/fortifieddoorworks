import type {Point} from './geometry';
import type {TextBox} from './indexing';
import {joinedVectorPaths} from './vector-chains';
import type {VectorDoor,VectorPath} from './vector-geometry';
import type {SourcePixels} from './tag-visibility';

export type HexagonalDoorTag={label:TextBox;points:Point[];outline:{x:number;y:number;width:number;height:number}};

/** Exact schedule marks enclosed in the six-sided CAD door-tag convention.
 * A hexagon is identity evidence only. Visibility, unique swing association and
 * independent reference-side checks are still required before assigning a hand. */
export function hexagonalDoorTags(boxes:TextBox[],paths:VectorPath[],known:ReadonlySet<string>):HexagonalDoorTag[]{
 if(!known.size)return [];
 const outlines=joinedVectorPaths(paths).flatMap(path=>{
  const p=path.points;if(p.length!==7||p.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y))||Math.hypot(p[0].x-p[6].x,p[0].y-p[6].y)>.1)return [];
  const x=Math.min(...p.map(q=>q.x)),y=Math.min(...p.map(q=>q.y)),width=Math.max(...p.map(q=>q.x))-x,height=Math.max(...p.map(q=>q.y))-y;
  if(height<6||height>50||width/height<1||width/height>2)return [];
  const expected=[{x,y:y+height/2},{x:x+width/4,y},{x:x+width*3/4,y},{x:x+width,y:y+height/2},{x:x+width*3/4,y:y+height},{x:x+width/4,y:y+height}];
  // Require the six vertices in cyclic order, not an arbitrary six-sided note.
  if(![1,-1].some(direction=>expected.some((_,offset)=>p.slice(0,6).every((q,i)=>{const e=expected[(offset+direction*i+12)%6];return Math.hypot(q.x-e.x,q.y-e.y)<height*.06;}))))return [];
  return [{points:p,outline:{x,y,width,height}}];
 });
 const seen=new Set<string>();return boxes.flatMap(label=>{
  if(!known.has(label.text.trim().toUpperCase())||label.height<=0)return [];
  const cx=label.x+label.width/2,cy=label.y+label.height/2;
  const matches=outlines.filter(({outline:b})=>b.height>label.height*1.8&&b.height<label.height*3.2&&label.width<b.width*1.2&&Math.hypot(cx-b.x-b.width/2,cy-b.y-b.height/2)<b.height*.15);
  if(matches.length!==1)return [];const shape=matches[0],b=shape.outline;
  if(boxes.some(other=>other!==label&&other.text.trim()&&other.text!==label.text&&other.x+other.width/2>b.x&&other.x+other.width/2<b.x+b.width&&other.y+other.height/2>b.y&&other.y+other.height/2<b.y+b.height))return [];
  const key=`${label.text}:${b.x.toFixed(1)}:${b.y.toFixed(1)}`;if(seen.has(key))return [];seen.add(key);return [{label,...shape}];
 });
}

export function visibleHexagonalDoorTag(tag:HexagonalDoorTag,image:SourcePixels):boolean{
 const {data,width,height,scale,offsetX,offsetY}=image,b=tag.outline,l=tag.label;
 if(![width,height,scale,offsetX,offsetY].every(Number.isFinite)||scale<=0||data.length!==width*height*4||b.height*scale<12)return false;
 const radius=Math.max(1,Math.ceil(scale*.35));
 const pixel=(p:Point,light=false)=>{const x=Math.round(p.x*scale-offsetX),y=Math.round(p.y*scale-offsetY);if(x-radius<0||y-radius<0||x+radius>=width||y+radius>=height)return false;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const i=((y+dy)*width+x+dx)*4;if(data[i+3]>=128&&(light?Math.max(data[i],data[i+1],data[i+2])>210:Math.max(data[i],data[i+1],data[i+2])<190))return true;}return false;};
 const sectors=tag.points.slice(0,6).map((a,i)=>{const c=tag.points[i+1],dx=c.x-a.x,dy=c.y-a.y,length=Math.hypot(dx,dy);let eligible=0,visible=0;
  for(let j=0;j<12;j++){const t=(j+.5)/12,p={x:a.x+dx*t,y:a.y+dy*t};
   // CAD text can mask the tips of its own outline. Check only exposed border,
   // requiring enough independently visible samples on every one of six edges.
   if(p.x>=l.x-1&&p.x<=l.x+l.width+1&&p.y>=l.y-1&&p.y<=l.y+l.height+1)continue;
   eligible++;if(pixel(p)&&(pixel({x:p.x-dy/length*1.5,y:p.y+dx/length*1.5},true)||pixel({x:p.x+dy/length*1.5,y:p.y-dx/length*1.5},true)))visible++;
  }return eligible>=3?visible/eligible:0;
 });return sectors.every(v=>v>=.75)&&sectors.reduce((a,c)=>a+c,0)/6>=.85;
}

const segmentDistance=(p:Point,a:Point,b:Point)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
/** Keep the existing .8 swing-radius proximity bound, measured from the actual
 * tag border to the closed opening rather than from displaced text centres.
 * Callers must also require one tag per swing and one swing per tag. */
export function hexagonalTagNearDoor(tag:HexagonalDoorTag,door:VectorDoor):boolean{
 if(door.paired||!Number.isFinite(door.radius)||door.radius<=0)return false;
 const center={x:tag.label.x+tag.label.width/2,y:tag.label.y+tag.label.height/2};
 if(Math.hypot(center.x-(door.hinge.x+door.jamb.x)/2,center.y-(door.hinge.y+door.jamb.y)/2)>door.radius*3)return false;
 const gap=Math.min(...tag.points.map(p=>segmentDistance(p,door.hinge,door.jamb)),...tag.points.slice(0,6).flatMap((a,i)=>[segmentDistance(door.hinge,a,tag.points[i+1]),segmentDistance(door.jamb,a,tag.points[i+1])]));
 return gap<door.radius*.8;
}
