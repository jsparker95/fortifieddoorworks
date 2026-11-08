import type {PageIndex,TextBox} from './indexing';
import type {ViewRegistration} from './overlapping-views';
type AxisLabel={text:string;coordinate:number;boxes:TextBox[]};
const center=(b:TextBox)=>({x:b.x+b.width/2,y:b.y+b.height/2});
function frameAtSize(page:PageIndex,boxes:TextBox[]){
 const grouped=new Map<string,TextBox[]>();
 for(const b of boxes){
  const text=b.text.trim().toUpperCase();if(!/^(?:[A-Z]|\d{1,2})$/.test(text)||b.height<=0)continue;
  const rows=grouped.get(text)||[];
  if(!rows.some(other=>Math.hypot(center(other).x-center(b).x,center(other).y-center(b).y)<.1))rows.push(b);
  grouped.set(text,rows);
 }
 const x:AxisLabel[]=[],y:AxisLabel[]=[];
 for(const [text,boxes] of grouped){
  if(boxes.length!==2||Math.abs(boxes[0].height/boxes[1].height-1)>.03)continue;
  const [a,b]=boxes.map(center);
  if(/^\d+$/.test(text)&&Math.abs(a.x-b.x)<1.5&&Math.abs(a.y-b.y)>page.height*.4)x.push({text,coordinate:(a.x+b.x)/2,boxes});
  if(/^[A-Z]$/.test(text)&&Math.abs(a.y-b.y)<1.5&&Math.abs(a.x-b.x)>page.width*.4)y.push({text,coordinate:(a.y+b.y)/2,boxes});
 }
 if(x.length<3||y.length<3)return null;
 // Paired bubbles must share one rectangular grid frame. Random repeated note
 // letters/numbers scattered across a page cannot supply this evidence.
 const ends=(labels:AxisLabel[],axis:'x'|'y')=>labels.map(label=>label.boxes.map(b=>center(b)[axis]).sort((a,b)=>a-b));
 for(const pairs of [ends(x,'y'),ends(y,'x')])for(const end of [0,1])if(Math.max(...pairs.map(p=>p[end]))-Math.min(...pairs.map(p=>p[end]))>2.5)return null;
 if(Math.max(...x.map(a=>a.coordinate))-Math.min(...x.map(a=>a.coordinate))<100||Math.max(...y.map(a=>a.coordinate))-Math.min(...y.map(a=>a.coordinate))<100)return null;
 return {x,y};
}
function gridFrame(page:PageIndex){
 // Door styles and note numbers can reuse grid names in a smaller font.
 // Seek a complete frame within one size family; never mix those labels.
 const families:Array<{height:number;boxes:TextBox[]}>=[];
 for(const b of [...page.boxes].sort((a,b)=>b.height-a.height)){
  if(!Number.isFinite(b.height)||b.height<=0||!/^(?:[A-Z]|\d{1,2})$/.test(b.text.trim().toUpperCase()))continue;
  let family=families.find(f=>Math.abs(f.height/b.height-1)<.03);
  if(!family){family={height:b.height,boxes:[]};families.push(family);}family.boxes.push(b);
 }
 const frames=families.flatMap(f=>{const frame=frameAtSize(page,f.boxes);return frame?[frame]:[];});
 return frames.length===1?frames[0]:null;
}
/** Translation-only registration from paired, orthogonal named grid axes.
 * Scope is supplied from source titles. Axis names identify lines, not endpoints:
 * cropping moves bubble endpoints, so only the relevant x/y coordinate is used.
 * The result remains review evidence and never removes an opening. */
export function registerGridViews(a:{page:PageIndex;scope:string},b:{page:PageIndex;scope:string}):ViewRegistration|null{
 if(!a.scope||a.scope!==b.scope||a.page.page===b.page.page||a.page.rotation!==b.page.rotation)return null;
 const aa=gridFrame(a.page),bb=gridFrame(b.page);if(!aa||!bb)return null;
 const matches=(axis:'x'|'y')=>aa[axis].flatMap(from=>{const to=bb[axis].find(label=>label.text===from.text);return to&&Math.abs(from.boxes[0].height/to.boxes[0].height-1)<.03?[{axis,text:from.text,from:from.boxes,to:to.boxes,delta:to.coordinate-from.coordinate}]:[];});
 const x=matches('x'),y=matches('y');if(!((x.length>=1&&y.length>=3)||(x.length>=3&&y.length>=1)))return null;
 const mean=(rows:typeof x)=>rows.reduce((sum,p)=>sum+p.delta,0)/rows.length,dx=mean(x),dy=mean(y);
 if(x.some(p=>Math.abs(p.delta-dx)>1.5)||y.some(p=>Math.abs(p.delta-dy)>1.5))return null;
 return {fromPage:a.page.page,toPage:b.page.page,dx,dy,scope:a.scope,anchors:[],method:'paired-grid-axes',axisAnchors:[...x,...y].map(({delta:_,...pair})=>pair)};
}
