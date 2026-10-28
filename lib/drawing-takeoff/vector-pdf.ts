import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import type { Point } from "./geometry";
import type { TextBox, PageIndex } from "./indexing";
import { detectVectorDoors, distance, type VectorPath } from "./vector-geometry";
import { planRegions, referenceHand, regionReferences } from "./vector-regions";
import type { z } from "zod";
import type { extractionSchema } from "./extraction-schema";
import { displayedTextBox } from "./text-geometry";

export const VECTOR_VERSION = 2;
type Observation = z.infer<typeof extractionSchema>["doorwayObservations"][number];
export type VectorPlan = { version: number; supported: boolean; geometryCount: number; observations: Observation[]; reason?: string };
const multiply = (a: number[], b: number[]) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];

export function completePlanContext(lines: string[]) {
  const titles=lines.filter(line=>line.length<180&&!/\b(?:SEE|REFER|REFERENCE)\b/i.test(line));
  return titles.some(line=>/\bFLOOR\s+PLAN\b|\bLEVEL\s+\d+\s+PLAN\b/i.test(line))
    && !titles.some(line=>/\bPLAN\s+ENLARGEMENTS?\b|\bENLARGED\s+[A-Z ]{0,24}PLAN\b|\bBATHROOM\s+PLANS\b/i.test(line));
}

/** Read the actual drawn paths, not an LLM's interpretation of a small swing symbol. */
export async function analyzeVectorPlan(bytes: Uint8Array, index: Pick<PageIndex, "page" | "lines">, knownMarks: string[]): Promise<VectorPlan> {
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true, disableFontFace: true });
  try {
    const pdf = await task.promise, page = await pdf.getPage(1), base = page.getViewport({ scale: 1 });
    const operatorList = await page.getOperatorList();
    const unsupported = (reason: string): VectorPlan => ({ version: VECTOR_VERSION, supported: false, geometryCount: 0, observations: [], reason });
    if (operatorList.fnArray.length > 400_000 || operatorList.fnArray.includes(OPS.beginGroup)) return unsupported("Complex or transparent path transforms require visual review.");
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
    const allDoors = detectVectorDoors(paths);
    if (!allDoors.length) return unsupported("No complete vector arc and straight-leaf combinations were found.");
    const content = await page.getTextContent();
    const boxes: TextBox[] = content.items.flatMap(item => {
      if (!("str" in item) || !item.str.trim()) return [];
      return [displayedTextBox(item,base.transform)];
    });
    const scale = Math.min(1, 2200/Math.max(base.width,base.height)), view = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(view.width),Math.ceil(view.height)), context = canvas.getContext("2d");
    await page.render({ canvas: canvas as never, canvasContext: context as never, viewport: view, background: "white" }).promise;
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
    if (!doors.length) return unsupported("Candidate vector paths were not confirmed as visible ink.");
    const fullContext = completePlanContext(index.lines);
    const allowExterior = fullContext;
    const maps = [false,true].map(dilate => { const map=planRegions(pixels,canvas.width,canvas.height,scale,doors,dilate);return { map, references:regionReferences(map,boxes,doors,allowExterior) }; });
    const known = new Set(knownMarks.map(mark=>mark.trim().toUpperCase()));
    const tags = boxes.filter(box=>known.size?known.has(box.text.toUpperCase()):/^[A-Z]?\d{1,5}(?:-[A-Z0-9]+|[A-Z])?$/.test(box.text));
    const observations: Observation[] = [];
    for (const tag of tags) {
      const center={x:tag.x+tag.width/2,y:tag.y+tag.height/2};
      const matches=doors.map(door=>({door,d:distance(center,{x:(door.hinge.x+door.jamb.x)/2,y:(door.hinge.y+door.jamb.y)/2})/door.radius})).filter(row=>row.d<0.8).sort((a,b)=>a.d-b.d);
      if (!matches.length) continue;
      const door=matches[0].door;
      const hands=matches.length===1?maps.map(({map,references})=>referenceHand(map,references,door)):[];
      const agreed=fullContext && hands.length===2 && hands[0] && hands[1] && hands[0].handing===hands[1].handing && hands[0].referenceKind===hands[1].referenceKind?hands[0]:null;
      const points=matches.flatMap(row=>[row.door.hinge,row.door.jamb,row.door.leaf]);points.push({x:tag.x,y:tag.y},{x:tag.x+tag.width,y:tag.y+tag.height});
      const x=Math.max(0,Math.min(...points.map(point=>point.x))-1),y=Math.max(0,Math.min(...points.map(point=>point.y))-1);
      const right=Math.min(base.width,Math.max(...points.map(point=>point.x))+1),bottom=Math.min(base.height,Math.max(...points.map(point=>point.y))+1);
      if(right<=x||bottom<=y)continue;
      observations.push({mark:tag.text,sourcePage:index.page,boundingBox:{x:x/base.width,y:y/base.height,width:(right-x)/base.width,height:(bottom-y)/base.height},
        hingeSide:agreed?.hingeSide||"unknown",swingDirection:agreed?.swingDirection||"unclear",handing:agreed?.handing||"",
        symbolEvidence:`Visible vector quarter-arc and straight leaf at tag ${tag.text}. Hinge (${door.hinge.x.toFixed(2)},${door.hinge.y.toFixed(2)}), closed jamb (${door.jamb.x.toFixed(2)},${door.jamb.y.toFixed(2)}), open leaf tip (${door.leaf.x.toFixed(2)},${door.leaf.y.toFixed(2)}), in displayed PDF points.${door.paired?" Paired leaves share the closed jamb; a single hand is not assigned.":""}`,
        handingEvidence:agreed?`Calculated from vector geometry and ${agreed.reference}; both boundary checks agree. Traditional hand ${agreed.handing}.`:!fullContext?"An enlarged/detail view does not establish the overall reference side. Review the complete floor plan before assigning a hand.":"Reference side, paired leaves, or region boundary requires review; no automatic swing hand assigned.",confidence:agreed?0.95:0.8});
    }
    return { version:VECTOR_VERSION,supported:!!observations.length||!!knownMarks.length,geometryCount:doors.length,observations,
      ...(!observations.length?{reason:"Vector swing symbols were found, but no target tag could be reliably attached to one."}:{}) };
  } finally { await task.destroy(); }
}
