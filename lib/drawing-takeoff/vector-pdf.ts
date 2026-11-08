import {focusedPageRaster,type FocusedPageRaster} from './focused-page-raster';
import {entryRoomCards,type EntryRoomContext} from './room-reference';
import {focusedEntryHands} from './room-reference-pdf';
import { pdfAssetOptions } from "./pdf-assets";
import { vectorResourceLimit, MAX_VECTOR_POINTS,MAX_VECTOR_SOURCE_BYTES,expandedPathPointCount } from "./vector-limits";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import type { Point } from "./geometry";
import type { TextBox, PageIndex } from "./indexing";
import { detectVectorDoors, distance, type VectorPath } from "./vector-geometry";
import { planRegions, referenceHand, regionReferences } from "./vector-regions";
import type { z } from "zod";
import type { extractionSchema } from "./extraction-schema";
import { displayedTextBox } from "./text-geometry";
import {hexagonalDoorTags,visibleHexagonalDoorTag,hexagonalTagNearDoor} from './hexagonal-door-tags';
import {printedCapsuleTags,printedCircleTags} from './printed-tag-shapes';
import {capsuleVisibility} from './tag-visibility';
import type {PrintedReviewEvidence} from './printed-review-candidates';
import {geometryPage} from './geometry-page';
import {vectorPathRegions} from './vector-path-regions';

export const VECTOR_VERSION = 10;
type Observation = z.infer<typeof extractionSchema>["doorwayObservations"][number];
export type VectorPlan = { version: number; supported: boolean; geometryCount: number; observations: Observation[]; printedTagReviewEvidence?:PrintedReviewEvidence[]; decodeEvidence?:{sourceBytes:number;geometryBytes:number;annotationsSeparated:boolean;expandedPoints?:number;geometryRegions?:number;skippedRegions?:number;entryReferenceCards?:number;entryReferenceHands?:number;entryReferenceFailure?:boolean};reason?: string };
const multiply = (a: number[], b: number[]) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];

export function completePlanContext(lines: string[]) {
  const titles=lines.filter(line=>line.length<180&&!/\b(?:SEE|REFER|REFERENCE)\b/i.test(line));
  return titles.some(line=>/\bFLOOR\s+PLAN\b|\bLEVEL\s+\d+\s+PLAN\b/i.test(line))
    && !titles.some(line=>/\bPLAN\s+ENLARGEMENTS?\b|\bENLARGED\s+[A-Z0-9 /&().,'’–-]{0,64}PLANS?\b|\bBATHROOM\s+PLANS\b/i.test(line));
}

/** Read the actual drawn paths, not an LLM's interpretation of a small swing symbol. */
export async function analyzeVectorPlan(bytes: Uint8Array, index: Pick<PageIndex, "page" | "lines"> & Partial<Pick<PageIndex,'annotationTags'|'boxes'>>, knownMarks: string[],catalogCodes:string[]=[],options:{unverifiedCircleLabels?:boolean;entryRoomContexts?:EntryRoomContext[]}={}): Promise<VectorPlan> {
  if(bytes.byteLength>MAX_VECTOR_SOURCE_BYTES)return {version:VECTOR_VERSION,supported:false,geometryCount:0,observations:[],reason:'This source page exceeds the bounded page preparation budget. Review it manually or upload a smaller page segment.'};
  const sourceBytes=bytes.byteLength,geometry=await geometryPage(bytes);
  const decodeEvidence:NonNullable<VectorPlan['decodeEvidence']>={sourceBytes,geometryBytes:geometry.bytes.byteLength,annotationsSeparated:geometry.annotationsRemoved};
  const resourceLimit = vectorResourceLimit(geometry.bytes.byteLength);
  if (resourceLimit) return { version: VECTOR_VERSION, supported: false, geometryCount: 0, observations: [], decodeEvidence,reason: resourceLimit };
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const { getDocument, OPS,AnnotationMode } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ ...pdfAssetOptions(), data: geometry.bytes, useSystemFonts: true, disableFontFace: true,stopAtErrors:true });
  let focusedRaster:FocusedPageRaster|null=null;
  try {
    const pdf = await task.promise, page = await pdf.getPage(1), base = page.getViewport({ scale: 1 });
    // Annotation appearance streams can be malformed or contain unrelated
    // markup. Architectural geometry and ink checks use only the base drawing;
    // annotation identifiers remain available separately in the page index.
    focusedRaster=focusedPageRaster(page,AnnotationMode.DISABLE);
    const operatorList = await page.getOperatorList({annotationMode:AnnotationMode.DISABLE});
    const unsupported = (reason: string): VectorPlan => ({ version: VECTOR_VERSION, supported: false, geometryCount: 0, observations: [], decodeEvidence,reason });
    if (operatorList.fnArray.length > 400_000 || operatorList.fnArray.includes(OPS.beginGroup)) return unsupported("Complex or transparent path transforms require visual review.");
    let pointCount = 0;
    let transform = [1,0,0,1,0,0]; const stack: number[][] = [], paths: VectorPath[] = [];
    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const op = operatorList.fnArray[i], args = operatorList.argsArray[i];
      if (op === OPS.save || op === OPS.paintFormXObjectBegin) {
        stack.push([...transform]); if (op === OPS.paintFormXObjectBegin && args[0]) transform = multiply(transform, args[0]);
      } else if (op === OPS.restore || op === OPS.paintFormXObjectEnd) transform = stack.pop() || [1,0,0,1,0,0];
      else if (op === OPS.transform) transform = multiply(transform, args);
      else if (op === OPS.constructPath) {
        const data = args[1]?.[0] as ArrayLike<number> | undefined;
        if (!data?.length) continue;
        const added=expandedPathPointCount(data);
        if(added===null)return unsupported("Malformed or unrecognized path data requires source review.");
        pointCount += added;
        if (pointCount > MAX_VECTOR_POINTS) return unsupported("Dense path geometry exceeds the safe point budget. Door handing requires manual review; schedules continue.");
        const matrix = multiply(base.transform, transform);
        const point = (x: number, y: number): Point => ({ x: matrix[0]*x+matrix[2]*y+matrix[4], y: matrix[1]*x+matrix[3]*y+matrix[5] });
        let current: Point | null = null, start: Point | null = null, points: Point[] = [];
        const flush = () => { if (points.length > 1) paths.push({ points }); points = []; };
        for (let j = 0; j < data.length;) {
          const operation = data[j++];
          if (operation === 0) { flush(); current = point(data[j++], data[j++]); start = current; points = [current]; }
          else if (operation === 1) { current = point(data[j++], data[j++]); points.push(current); }
          else if (operation === 2) {
            const p1 = point(data[j++], data[j++]), p2 = point(data[j++], data[j++]), end = point(data[j++], data[j++]);
            if (current) { const origin: Point = current; for (let sample = 1; sample <= 10; sample++) {
              const t = sample / 10, u = 1-t;
              points.push({ x: u*u*u*origin.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*end.x, y: u*u*u*origin.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*end.y });
            } } current = end;
          } else if (operation === 3) {
            const control = point(data[j++], data[j++]), end = point(data[j++], data[j++]);
            if (current) { const origin: Point = current; for (let sample = 1; sample <= 10; sample++) {
              const t = sample / 10, u = 1-t; points.push({ x: u*u*origin.x+2*u*t*control.x+t*t*end.x, y: u*u*origin.y+2*u*t*control.y+t*t*end.y });
            } } current = end;
          } else if (operation === 4) { if (start) points.push(start); current = start; }
          else return unsupported("Unrecognized PDF path operator.");
        }
        flush();
      }
    }
    const partition=vectorPathRegions(paths,base.width,base.height);
    Object.assign(decodeEvidence,{expandedPoints:pointCount,geometryRegions:partition.regions.length,skippedRegions:partition.skipped});
    const regionReason=partition.skipped?`${partition.skipped} drawing regions exceeded the geometry budget. Coverage is incomplete and handing is withheld.`:undefined;
    const doorKeys=new Set<string>();
    const allDoors=partition.regions.flatMap(region=>detectVectorDoors(region)).filter(door=>{const key=[door.hinge,door.jamb,door.leaf].map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('|');if(doorKeys.has(key))return false;doorKeys.add(key);return true;});
    if (!allDoors.length&&!catalogCodes.length) return unsupported(regionReason||"No supported vector swing arc and straight-leaf combinations were found.");
    const content = await page.getTextContent();
    const boxes: TextBox[] = content.items.flatMap(item => {
      if (!("str" in item) || !item.str.trim()) return [];
      return [displayedTextBox(item,base.transform)];
    });
    const scale = Math.min(1, 2200/Math.max(base.width,base.height)), view = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(view.width),Math.ceil(view.height)), context = canvas.getContext("2d");
    await page.render({ canvas: canvas as never, canvasContext: context as never, viewport: view,annotationMode:AnnotationMode.DISABLE, background: "white" }).promise;
    const pixels = context.getImageData(0,0,canvas.width,canvas.height).data;
    const ink = (point: Point) => {
      const x = Math.round(point.x*scale), y = Math.round(point.y*scale);
      for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
        const xx=x+dx,yy=y+dy;if(xx<0||xx>=canvas.width||yy<0||yy>=canvas.height) continue;
        const i=(yy*canvas.width+xx)*4;
        if (0.2126*pixels[i]+0.7152*pixels[i+1]+0.0722*pixels[i+2]<180) return true;
      } return false;
    };
    const doors = allDoors.filter(door => {
      const a = Math.atan2(door.jamb.y-door.hinge.y,door.jamb.x-door.hinge.x), b = Math.atan2(door.leaf.y-door.hinge.y,door.leaf.x-door.hinge.x);
      const delta = Math.atan2(Math.sin(b-a),Math.cos(b-a)); let arcInk=0,leafInk=0;
      for (let i=1;i<=8;i++) {
        const t=i/9, angle=a+delta*t;
        if(ink({x:door.hinge.x+door.radius*Math.cos(angle),y:door.hinge.y+door.radius*Math.sin(angle)})) arcInk++;
        if(ink({x:door.hinge.x+(door.leaf.x-door.hinge.x)*t,y:door.hinge.y+(door.leaf.y-door.hinge.y)*t})) leafInk++;
      } return arcInk>=6 && leafInk>=6;
    });
    const codes=new Set(catalogCodes.map(code=>code.trim().toUpperCase()));
    // A clearly printed style circle without a supported swing is retained as
    // unverified evidence only; the review resolver withholds its dimensions/type.
    const shapeKeys=new Set<string>();
    const shapes=catalogCodes.length?partition.regions.flatMap(region=>[...printedCapsuleTags(boxes,region,codes),...printedCircleTags(boxes,region,codes,doors,options.unverifiedCircleLabels===true)]).filter(shape=>{const key=`${shape.kind}:${shape.text}:${shape.label.x.toFixed(1)}:${shape.label.y.toFixed(1)}`;if(shapeKeys.has(key))return false;shapeKeys.add(key);return true;}):[];
    const visibilityChecks=new Map<typeof shapes[number],ReturnType<typeof capsuleVisibility>>();
    const tiles=new Map<string,{x:number;y:number;shapes:typeof shapes}>();
    for(const shape of shapes){
      const check=capsuleVisibility(shape,{data:pixels,width:canvas.width,height:canvas.height,scale,offsetX:0,offsetY:0});visibilityChecks.set(shape,check);
      if(shape.outline.height*scale>=12)continue;
      const x=Math.floor((shape.outline.x+shape.outline.width/2)*2/512)*512-128,y=Math.floor((shape.outline.y+shape.outline.height/2)*2/512)*512-128,key=`${x}:${y}`;
      const tile=tiles.get(key)||{x,y,shapes:[]};tile.shapes.push(shape);tiles.set(key,tile);
    }
    // Fixed-size source tiles share one operator list, preserve small printed
    // labels, and cap per-page work. Unchecked groups remain explicitly held.
    let focusedCount=0;
    for(const tile of tiles.values()){
      if(focusedCount++>=16)break;
      const image=await focusedRaster.pixels(tile.x,tile.y,768,768);
      for(const shape of tile.shapes)visibilityChecks.set(shape,capsuleVisibility(shape,image));
    }
    const printedTagReviewEvidence:PrintedReviewEvidence[]=shapes.map(shape=>{
      const center={x:shape.label.x+shape.label.width/2,y:shape.label.y+shape.label.height/2},nearby=doors.filter(door=>distance(center,{x:(door.hinge.x+door.jamb.x)/2,y:(door.hinge.y+door.jamb.y)/2})/door.radius<.8);
      const visibility=visibilityChecks.get(shape)!;
      const paired=nearby.length===2&&nearby.every(door=>door.paired)&&distance(nearby[0].jamb,nearby[1].jamb)<Math.max(1,Math.min(nearby[0].radius,nearby[1].radius)*.06);
      return {page:index.page,shape,visibility:visibility.visibility,visibilityReason:visibility.reason,doorContext:nearby.length===1?'single':paired?'paired':nearby.length?'ambiguous':'unverified'};
    });
    if (!doors.length) return {...unsupported(regionReason||"Candidate vector paths were not confirmed as visible ink. Printed labels remain for source review."),printedTagReviewEvidence};
    const fullContext = completePlanContext(index.lines);
    const allowExterior = fullContext;
    const maps = [false,true].map(dilate => { const map=planRegions(pixels,canvas.width,canvas.height,scale,doors,dilate);return { map, references:regionReferences(map,boxes,doors,allowExterior) }; });
    const known = new Set(knownMarks.map(mark=>mark.trim().toUpperCase()));
    const tags = [...boxes,...(index.annotationTags||[])].filter(box=>known.size?known.has(box.text.toUpperCase()):/^[A-Z]?\d{1,5}(?:-[A-Z0-9]+|[A-Z])?$/.test(box.text));
    const hexKeys=new Set<string>();
    const hexTags=partition.regions.flatMap(region=>hexagonalDoorTags(boxes,region,known)).filter(tag=>{
      const key=`${tag.label.text}:${tag.outline.x.toFixed(1)}:${tag.outline.y.toFixed(1)}`;
      if(hexKeys.has(key))return false;hexKeys.add(key);
      return doors.some(door=>hexagonalTagNearDoor(tag,door))&&visibleHexagonalDoorTag(tag,{data:pixels,width:canvas.width,height:canvas.height,scale,offsetX:0,offsetY:0});
    });
    const tagMatches=new Map(tags.map(tag=>{
      const center={x:tag.x+tag.width/2,y:tag.y+tag.height/2};
      const direct=doors.map(door=>({door,d:distance(center,{x:(door.hinge.x+door.jamb.x)/2,y:(door.hinge.y+door.jamb.y)/2})/door.radius})).filter(row=>row.d<.8).sort((a,b)=>a.d-b.d);
      if(direct.length)return [tag,direct] as const;
      const hex=hexTags.find(shape=>shape.label===tag);
      return [tag,hex?doors.filter(door=>hexagonalTagNearDoor(hex,door)).map(door=>({door,d:Infinity})):[]] as const;
    }));
    const cards=entryRoomCards(index.boxes||boxes,paths,options.entryRoomContexts||[]);
    let entryHands:Awaited<ReturnType<typeof focusedEntryHands>>|null=null;
    if(!partition.skipped&&cards.length)try{entryHands=await focusedEntryHands(page,cards,doors,tags,focusedRaster,printedTagReviewEvidence);}catch{
      decodeEvidence.entryReferenceFailure=true;
    }
    Object.assign(decodeEvidence,{entryReferenceCards:cards.length,entryReferenceHands:entryHands?.size||0});
    const observations: Observation[] = [];
    for (const tag of tags) {
      const matches=tagMatches.get(tag)!;
      if (!matches.length) continue;
      const door=matches[0].door;
      const unique=matches.length===1&&!tags.some(other=>other!==tag&&(other.text!==tag.text||Math.hypot(other.x-tag.x,other.y-tag.y)>.5)&&tagMatches.get(other)?.some(row=>row.door===door));
      const hands=unique?maps.map(({map,references})=>referenceHand(map,references,door)):[];
      const fullPlanHand=!partition.skipped&&fullContext && hands.length===2 && hands[0] && hands[1] && hands[0].handing===hands[1].handing && hands[0].referenceKind===hands[1].referenceKind?hands[0]:null;
      const entryHand=unique?entryHands?.get(door):null;
      const agreed=fullPlanHand&&entryHand&&fullPlanHand.handing!==entryHand.handing?null:fullPlanHand||entryHand;
      const points=matches.flatMap(row=>[row.door.hinge,row.door.jamb,row.door.leaf]);
      if(matches[0].d===Infinity)points.push(...(hexTags.find(shape=>shape.label===tag)?.points||[]));
      points.push({x:tag.x,y:tag.y},{x:tag.x+tag.width,y:tag.y+tag.height});
      const x=Math.max(0,Math.min(...points.map(point=>point.x))-1),y=Math.max(0,Math.min(...points.map(point=>point.y))-1);
      const right=Math.min(base.width,Math.max(...points.map(point=>point.x))+1),bottom=Math.min(base.height,Math.max(...points.map(point=>point.y))+1);
      if(right<=x||bottom<=y)continue;
      observations.push({mark:tag.text,sourcePage:index.page,boundingBox:{x:x/base.width,y:y/base.height,width:(right-x)/base.width,height:(bottom-y)/base.height},
        hingeSide:agreed?.hingeSide||"unknown",swingDirection:agreed?.swingDirection||"unclear",handing:agreed?.handing||"",
        symbolEvidence:`Visible vector swing arc and straight leaf at tag ${tag.text}.${matches[0].d===Infinity?' A visible six-sided schedule-mark tag adjoins the candidate opening.':''} Hinge (${door.hinge.x.toFixed(2)},${door.hinge.y.toFixed(2)}), closed jamb (${door.jamb.x.toFixed(2)},${door.jamb.y.toFixed(2)}), open leaf tip (${door.leaf.x.toFixed(2)},${door.leaf.y.toFixed(2)}), in displayed PDF points.${door.paired?" Paired leaves share the closed jamb; a single hand is not assigned.":""}`,
        handingEvidence:agreed?`Calculated from vector geometry and ${agreed.reference}; both boundary checks agree. Traditional hand ${agreed.handing}.`:!unique?"More than one tag or swing can describe this opening; hand requires source review.":decodeEvidence.entryReferenceFailure?"The focused unit-reference check could not be completed. Review the source before assigning a hand.":!fullContext?"An enlarged/detail view does not establish the overall reference side. Review the complete floor plan before assigning a hand.":"Reference side, paired leaves, or region boundary requires review; no automatic swing hand assigned.",confidence:agreed?0.95:0.8});
    }
    return { version:VECTOR_VERSION,supported:!!observations.length||!!knownMarks.length,geometryCount:doors.length,observations,printedTagReviewEvidence,decodeEvidence,
      ...(regionReason?{reason:regionReason}:!observations.length?{reason:"Vector swing symbols were found, but no target tag could be reliably attached to one."}:{}) };
  } finally { focusedRaster?.destroy();await task.destroy(); }
}
