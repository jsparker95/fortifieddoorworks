import type {PageIndex,TextBox} from './indexing';
type View={page:PageIndex;scope:string};
export type ViewRegistration={fromPage:number;toPage:number;dx:number;dy:number;scope:string;anchors:Array<{text:string;from:TextBox;to:TextBox}>;method?:'room-anchors'|'paired-grid-axes';axisAnchors?:Array<{axis:'x'|'y';text:string;from:TextBox[];to:TextBox[]}>};
const center=(b:TextBox)=>({x:b.x+b.width/2,y:b.y+b.height/2});
function anchors(page:PageIndex){
 const grouped=new Map<string,TextBox[]>();
 for(const b of page.boxes){
  const text=b.text.trim().toUpperCase(),c=center(b);
  if(!/^(?:[A-Z]\d{2,5}|\d{3}[A-Z]?)$/.test(text)||c.x<page.width*.05||c.x>page.width*.86||c.y<page.height*.14||c.y>page.height*.86)continue;
  const rows=grouped.get(text)||[];
  if(!rows.some(other=>Math.hypot(center(other).x-c.x,center(other).y-c.y)<.1))rows.push(b);
  grouped.set(text,rows);
 }
 return new Map([...grouped].filter(([,rows])=>rows.length===1).map(([text,rows])=>[text,rows[0]]));
}
/** A translation is proposed only for explicitly same-scope, same-scale views.
 * Multiple room identifiers must agree; a repeated style code alone is insufficient. */
export function registerOverlappingViews(a:View,b:View):ViewRegistration|null{
 if(!a.scope||a.scope!==b.scope||a.page.page===b.page.page)return null;
 const aa=anchors(a.page),bb=anchors(b.page),pairs=[...aa].flatMap(([text,from])=>{const to=bb.get(text);return to?[{text,from,to,dx:center(to).x-center(from).x,dy:center(to).y-center(from).y}]:[];});
 if(pairs.length<3||pairs.length>500)return null;
 const proposals=pairs.map(p=>pairs.filter(q=>Math.hypot(p.dx-q.dx,p.dy-q.dy)<1.5&&Math.abs(q.from.height/q.to.height-1)<.03)).sort((x,y)=>y.length-x.length);
 const best=proposals[0];if(best.length<3)return null;
 const dx=best.reduce((sum,p)=>sum+p.dx,0)/best.length,dy=best.reduce((sum,p)=>sum+p.dy,0)/best.length;
 if(proposals.some(p=>p.length>=3&&Math.hypot(p[0].dx-dx,p[0].dy-dy)>3))return null;
 const centers=best.map(p=>center(p.from));
 if(!centers.some(p=>centers.some(q=>Math.hypot(p.x-q.x,p.y-q.y)>100)))return null;
 return {fromPage:a.page.page,toPage:b.page.page,scope:a.scope,dx,dy,anchors:best.map(({text,from,to})=>({text,from,to}))};
}
/** Suggest duplicate source locations for review. Do not collapse phase rows. */
export function repeatedTagLocations(registration:ViewRegistration,from:TextBox[],to:TextBox[]){
 const matches=from.flatMap(a=>{
  const p=center(a),choices=to.filter(b=>b.text.trim().toUpperCase()===a.text.trim().toUpperCase()&&Math.hypot(center(b).x-p.x-registration.dx,center(b).y-p.y-registration.dy)<Math.max(.5,Math.min(a.height,b.height)*.25));
  return choices.length===1?[{from:a,to:choices[0],fromPage:registration.fromPage,toPage:registration.toPage,scope:registration.scope,anchorCount:registration.anchors.length+(registration.axisAnchors?.length||0),autoImportEligible:false as const}]:[];
 });
 return matches.filter(m=>matches.filter(other=>other.to===m.to).length===1);
}
