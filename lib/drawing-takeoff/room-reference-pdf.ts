import type {FocusedPageRaster} from './focused-page-raster';
import type {PDFPageProxy} from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {TextBox} from './indexing';
import {distance,type VectorDoor} from './vector-geometry';
import {planRegions,regionScratch,type RegionScratch} from './vector-regions';
import {entryRoomHand,roomCardVisible,type EntryRoomCard} from './room-reference';

type RoomHand=NonNullable<ReturnType<typeof entryRoomHand>>;

/** A full-sheet thumbnail cannot preserve every light gray wall. Check bounded
 * source tiles at 2x only for uniquely tagged guestroom-entry doors. Missing
 * boundaries, merged units, hidden cards and disagreeing masks stay unknown. */
export async function focusedEntryHands(page:PDFPageProxy,cards:EntryRoomCard[],doors:VectorDoor[],tags:TextBox[],raster:FocusedPageRaster){
 const hands=new Map<VectorDoor,RoomHand>(),base=page.getViewport({scale:1});
 let rendered=0,scratch:RegionScratch|undefined;
 for(const card of cards){
  const candidates=tags.filter(tag=>tag.text.trim().toUpperCase()===card.mark.trim().toUpperCase()).map(tag=>{
   const center={x:tag.x+tag.width/2,y:tag.y+tag.height/2};
   return doors.filter(door=>distance(center,{x:(door.hinge.x+door.jamb.x)/2,y:(door.hinge.y+door.jamb.y)/2})/door.radius<.8);
  }).filter(matches=>matches.length);
  const unique=[...new Set(candidates.flat())];
  if(unique.length!==1||candidates.some(matches=>matches.length!==1)||unique[0].paired)continue;
  const door=unique[0],points=[door.hinge,door.jamb,door.leaf],pad=door.radius*4,b=card.bounds;
  const x=Math.max(0,Math.floor(Math.min(b.x,...points.map(p=>p.x))-pad)),y=Math.max(0,Math.floor(Math.min(b.y,...points.map(p=>p.y))-pad));
  const width=Math.ceil((Math.min(base.width,Math.max(b.x+b.width,...points.map(p=>p.x))+pad)-x)*2);
  const height=Math.ceil((Math.min(base.height,Math.max(b.y+b.height,...points.map(p=>p.y))+pad)-y)*2);
  if(width<1||height<1||width>1536||height>1536)continue;
  if(rendered++>=16)break;
  const image=await raster.pixels(x*2,y*2,width,height),pixels=image.data as Uint8ClampedArray;
  if(!roomCardVisible(card,{data:pixels,width,height,scale:2,offsetX:x*2,offsetY:y*2}))continue;
  const shift=(point:{x:number;y:number})=>({x:point.x-x,y:point.y-y});
  const localDoors=doors.map(d=>({...d,hinge:shift(d.hinge),jamb:shift(d.jamb),leaf:shift(d.leaf)}));
  const localCards=cards.map(c=>({...c,bounds:{...c.bounds,x:c.bounds.x-x,y:c.bounds.y-y}}));
  const localCard=localCards[cards.indexOf(card)],localDoor=localDoors[doors.indexOf(door)];
  if(!scratch||scratch.mask.length<width*height)scratch=regionScratch(width*height);
  const checks=([1,2] as const).map(dilationRadius=>{
   const map=planRegions(pixels,width,height,2,localDoors,true,{inkThreshold:235,omitBlueDimensions:true,dilationRadius,scratch});
   return entryRoomHand(map,localCard,localDoor,localCards);
  });
  if(checks[0]&&checks[1]&&checks[0].handing===checks[1].handing)hands.set(door,checks[0]);
 }
 return hands;
}
