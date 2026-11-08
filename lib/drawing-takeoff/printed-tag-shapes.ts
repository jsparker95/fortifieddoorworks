import type {TextBox} from './indexing';
import type {VectorPath} from './vector-geometry';
import {joinedVectorPaths} from './vector-chains';

export type PrintedTagShape={kind:'printed-capsule'|'printed-circle';text:string;label:TextBox;outline:{x:number;y:number;width:number;height:number};autoImportEligible:false;visibility:'requires-source-review'};

/** Recognize capsule outlines, including CAD exports with four separate strokes.
 * This recognizes a printed label shape, never a physical door or a hand.
 * Callers must confirm visibility: raw PDF paths may be clipped or overpainted,
 * and an oval note can share a schedule code. Shape alone cannot resolve that. */
export function printedCapsuleTags(boxes:TextBox[],paths:VectorPath[],codes:ReadonlySet<string>):PrintedTagShape[]{
 const loops=joinedVectorPaths(paths).flatMap(path=>{
  const p=path.points;
  if(p.length<12||p.length>400||p.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y))||Math.hypot(p[0].x-p.at(-1)!.x,p[0].y-p.at(-1)!.y)>.1)return [];
  const x=Math.min(...p.map(q=>q.x)),y=Math.min(...p.map(q=>q.y)),width=Math.max(...p.map(q=>q.x))-x,height=Math.max(...p.map(q=>q.y))-y;
  if(height<2||height>50||width/height<1.6||width/height>6)return [];
  const r=height/2,left=x+r,right=x+width-r,cy=y+r;
  // Each point must follow the rounded ends or straight top/bottom.
  // Rectangle and hexagonal note markers fail the rounded-end check.
  const error=(q:{x:number;y:number})=>q.x<left?Math.abs(Math.hypot(q.x-left,q.y-cy)-r):q.x>right?Math.abs(Math.hypot(q.x-right,q.y-cy)-r):Math.abs(Math.abs(q.y-cy)-r);
  if(p.some(q=>error(q)>height*.08))return [];
  if(!p.some(q=>q.x<x+height*.08&&Math.abs(q.y-cy)<height*.2)||!p.some(q=>q.x>x+width-height*.08&&Math.abs(q.y-cy)<height*.2))return [];
  return [{x,y,width,height}];
 });
 const result:PrintedTagShape[]=[],seen=new Set<string>();
 for(const label of boxes){
  if(!codes.has(label.text.trim().toUpperCase())||!Number.isFinite(label.height)||label.height<=0)continue;
  const cx=label.x+label.width/2,cy=label.y+label.height/2;
  const matches=loops.filter(b=>cx>b.x&&cx<b.x+b.width&&cy>b.y&&cy<b.y+b.height&&b.height>label.height*.65&&b.height<label.height*1.8&&b.width>label.width&&b.width<label.width+label.height*4);
  if(matches.length!==1)continue;
  const outline=matches[0],key=`${label.text}:${outline.x.toFixed(1)}:${outline.y.toFixed(1)}`;
  if(seen.has(key))continue;
  // Two different labels inside one outline are ambiguous, even if one is a code.
  if(boxes.some(other=>other!==label&&other.text!==label.text&&other.text.trim()&&other.x+other.width/2>outline.x&&other.x+other.width/2<outline.x+outline.width&&other.y+other.height/2>outline.y&&other.y+other.height/2<outline.y+outline.height))continue;
  seen.add(key);result.push({kind:'printed-capsule',text:label.text,label,outline,autoImportEligible:false,visibility:'requires-source-review'});
 }
 return result;
}

/** Circular door-style tags normally require a nearby verified swing. An explicit
 * style-table context can retain unsupported circles for review, never import.
 * Large grid bubbles and competing/stand-alone labels remain unsupported. */
export function printedCircleTags(boxes:TextBox[],paths:VectorPath[],codes:ReadonlySet<string>,doors:Array<{hinge:{x:number;y:number};jamb:{x:number;y:number};radius:number}>,includeUnverified=false):PrintedTagShape[]{
 const loops=joinedVectorPaths(paths).flatMap(path=>{
  const p=path.points;if(p.length<12||p.length>400||p.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y))||Math.hypot(p[0].x-p.at(-1)!.x,p[0].y-p.at(-1)!.y)>.1)return [];
  const x=Math.min(...p.map(q=>q.x)),y=Math.min(...p.map(q=>q.y)),width=Math.max(...p.map(q=>q.x))-x,height=Math.max(...p.map(q=>q.y))-y;
  if(height<6||height>60||Math.abs(width/height-1)>.03)return [];
  const cx=x+width/2,cy=y+height/2,r=(width+height)/4;
  if(p.some(q=>Math.abs(Math.hypot(q.x-cx,q.y-cy)-r)>r*.04))return [];
  return [{x,y,width,height}];
 });
 // Some CAD exports stroke the same circle twice with a subpixel offset.
 // Coalesce only those indistinguishable outlines; separated/nested rings
 // remain ambiguous rather than selecting one by size.
 const distinct=loops.filter((b,i)=>!loops.slice(0,i).some(a=>Math.abs(a.x-b.x)<.3&&Math.abs(a.y-b.y)<.3&&Math.abs(a.width-b.width)<.3&&Math.abs(a.height-b.height)<.3));
 const found:PrintedTagShape[]=[],seen=new Set<string>();
 for(const label of boxes){
  if(!codes.has(label.text.trim().toUpperCase())||label.height<=0)continue;
  const x=label.x+label.width/2,y=label.y+label.height/2;
  const matches=distinct.filter(b=>b.height>label.height*1.7&&b.height<label.height*3.1&&Math.hypot(x-b.x-b.width/2,y-b.y-b.height/2)<b.height*.18&&label.width<b.width*.85);
  if(matches.length!==1||!includeUnverified&&!doors.some(d=>Math.hypot(x-(d.hinge.x+d.jamb.x)/2,y-(d.hinge.y+d.jamb.y)/2)/d.radius<.8))continue;
  const outline=matches[0],key=`${label.text}:${outline.x.toFixed(1)}:${outline.y.toFixed(1)}`;if(seen.has(key))continue;
  if(boxes.some(b=>b!==label&&b.text!==label.text&&Math.hypot(b.x+b.width/2-outline.x-outline.width/2,b.y+b.height/2-outline.y-outline.height/2)<outline.height*.45))continue;
  seen.add(key);found.push({kind:'printed-circle',text:label.text,label,outline,autoImportEligible:false,visibility:'requires-source-review'});
 }
 return found;
}
