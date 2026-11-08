import type {PrintedTagShape} from './printed-tag-shapes';
export type SourcePixels={data:Uint8ClampedArray|Uint8Array;width:number;height:number;scale:number;offsetX:number;offsetY:number};

/** Confirm border ink in a focused render, not just a hidden PDF path.
 * A visible oval remains a label, not proof of a doorway. */
export function capsuleVisibility(tag:PrintedTagShape,image:SourcePixels){
 const b=tag.outline,r=b.height/2,left=b.x+r,right=b.x+b.width-r,cy=b.y+r;
 const held=(reason:string)=>({visibility:'not-confirmed' as const,reason,coverage:0,sectors:[] as number[],autoImportEligible:false as const});
 if(![image.width,image.height,image.scale,image.offsetX,image.offsetY,b.x,b.y,b.width,b.height].every(Number.isFinite)||image.scale<=0||image.width<1||image.height<1||image.data.length!==image.width*image.height*4)return held('Invalid render geometry.');
 if(b.height*image.scale<12)return held('A higher-resolution source crop is required.');
 const radius=Math.max(1,Math.ceil(image.scale*.35));let clipped=false;
 const ink=(x:number,y:number)=>{
  const xx=Math.round(x*image.scale-image.offsetX),yy=Math.round(y*image.scale-image.offsetY);
  if(xx-radius<0||yy-radius<0||xx+radius>=image.width||yy+radius>=image.height){clipped=true;return false;}
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   const i=((yy+dy)*image.width+xx+dx)*4,[red,green,blue,alpha]=image.data.subarray(i,i+4);
   // Black ink antialiased over yellow/red markup can retain a color tint.
   // A bright highlight alone still fails this maximum-channel threshold.
   if(alpha>=128&&Math.max(red,green,blue)<190)return true;
  }return false;
 };
 const light=(x:number,y:number)=>{const xx=Math.round(x*image.scale-image.offsetX),yy=Math.round(y*image.scale-image.offsetY);if(xx<0||yy<0||xx>=image.width||yy>=image.height)return false;const i=(yy*image.width+xx)*4;return image.data[i+3]>=128&&Math.max(image.data[i],image.data[i+1],image.data[i+2])>210;};
 const sides=tag.kind==='printed-circle'?Array.from({length:4},(_,sector)=>Array.from({length:12},(_,i)=>{const a=-Math.PI/2+sector*Math.PI/2+(i+.5)*Math.PI/24;return {x:b.x+b.width/2+r*Math.cos(a),y:cy+r*Math.sin(a),nx:Math.cos(a),ny:Math.sin(a)};})):[Array.from({length:12},(_,i)=>({x:left+(right-left)*(i+.5)/12,y:b.y,nx:0,ny:-1})),Array.from({length:12},(_,i)=>({x:left+(right-left)*(i+.5)/12,y:b.y+b.height,nx:0,ny:1})),
  Array.from({length:12},(_,i)=>{const a=Math.PI/2+Math.PI*(i+.5)/12;return {x:left+r*Math.cos(a),y:cy+r*Math.sin(a),nx:Math.cos(a),ny:Math.sin(a)};}),
  Array.from({length:12},(_,i)=>{const a=-Math.PI/2+Math.PI*(i+.5)/12;return {x:right+r*Math.cos(a),y:cy+r*Math.sin(a),nx:Math.cos(a),ny:Math.sin(a)};})];
 // An opaque dark block also covers the expected perimeter with ink. Require
 // nearby contrast on at least one side before calling it a visible border.
 const sectors=sides.map(points=>points.filter(p=>ink(p.x,p.y)&&(light(p.x+p.nx*1.5,p.y+p.ny*1.5)||light(p.x-p.nx*1.5,p.y-p.ny*1.5))).length/points.length),coverage=sectors.reduce((a,b)=>a+b,0)/sectors.length;
 return {visibility:!clipped&&coverage>=.85&&sectors.every(value=>value>=.75)?'visible-outline' as const:'not-confirmed' as const,reason:clipped?'The source crop cuts off part of the outline.':coverage>=.85&&sectors.every(value=>value>=.75)?'Rendered border ink supports the printed tag outline.':'The complete border was not confirmed in the source render.',coverage,sectors,autoImportEligible:false as const};
}
