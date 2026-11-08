import type {VectorPath} from './vector-geometry';
import {MAX_VECTOR_REGION_POINTS} from './vector-limits';

/** Keep CAD graph joins bounded. Entire paths are assigned to overlapping
 * regions, preserving arc/leaf connections and the displayed coordinates. */
export function vectorPathRegions(paths:VectorPath[],width:number,height:number){
 if(paths.reduce((sum,p)=>sum+p.points.length,0)<=MAX_VECTOR_REGION_POINTS)return {regions:[paths],skipped:0};
 const boxes=paths.map(path=>{let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;for(const p of path.points){x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}return {path,x,y,right,bottom};});
 const regions:VectorPath[][]=[];let skipped=0;
 const columns=Math.ceil(width/512),rows=Math.ceil(height/512);
 if(!Number.isFinite(columns*rows)||columns*rows>256)return {regions,skipped:1};
 const visit=(x:number,y:number,size:number,depth:number)=>{
  const selected:VectorPath[]=[];let points=0;
  const padding=Math.min(128,size/4);
  for(const box of boxes)if(box.right>=x-padding&&box.x<=x+size+padding&&box.bottom>=y-padding&&box.y<=y+size+padding){selected.push(box.path);points+=box.path.points.length;}
  if(points>MAX_VECTOR_REGION_POINTS){
   if(depth<2&&regions.length<240){for(const dx of [0,size/2])for(const dy of [0,size/2])visit(x+dx,y+dy,size/2,depth+1);}
   else skipped++;
   return;
  }
  if(regions.length>=256){skipped++;return;}
  if(selected.length)regions.push(selected);
 };
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)visit(x*512,y*512,512,0);
 return {regions,skipped};
}
