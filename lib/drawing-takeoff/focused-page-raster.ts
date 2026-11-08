import {createCanvas} from '@napi-rs/canvas';
import type {PDFPageProxy} from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {SourcePixels} from './tag-visibility';

export const MAX_FOCUSED_PAGE_PIXELS=28_000_000;
export type FocusedPageRaster=ReturnType<typeof focusedPageRaster>;

/** Render a normal plan sheet once, then read small crops from that raster.
 * Repainting the entire architectural graph for every tiny label creates large
 * temporary PDF pattern canvases. Oversized sheets retain bounded tile renders.
 * All buffers belong to this page and are released when its analysis ends. */
export function focusedPageRaster(page:PDFPageProxy,annotationMode:number){
 const viewport=page.getViewport({scale:2}),fullWidth=Math.ceil(viewport.width),fullHeight=Math.ceil(viewport.height);
 const full=fullWidth*fullHeight<=MAX_FOCUSED_PAGE_PIXELS,canvas=createCanvas(1,1);
 let rendered=false;
 return {
  async pixels(x:number,y:number,width:number,height:number):Promise<SourcePixels>{
   if(![x,y,width,height].every(Number.isInteger)||width<1||height<1||width>1536||height>1536)throw new Error('Invalid focused source crop.');
   if(full&&!rendered){
    canvas.width=fullWidth;canvas.height=fullHeight;const context=canvas.getContext('2d');
    await page.render({canvas:canvas as never,canvasContext:context as never,viewport,annotationMode,background:'white'}).promise;
    rendered=true;
   }
   if(full){
    const context=canvas.getContext('2d');
    return {data:context.getImageData(x,y,width,height).data,width,height,scale:2,offsetX:x,offsetY:y};
   }
   canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');
   const cropped=viewport.clone({offsetX:-x,offsetY:-y});cropped.width=width;cropped.height=height;
   await page.render({canvas:canvas as never,canvasContext:context as never,viewport:cropped,annotationMode,background:'white'}).promise;
   return {data:context.getImageData(0,0,width,height).data,width,height,scale:2,offsetX:x,offsetY:y};
  },
  destroy(){canvas.width=1;canvas.height=1;rendered=false;},
 };
}
