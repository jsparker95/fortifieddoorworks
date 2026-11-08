import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,rgb} from 'pdf-lib';
import {createCanvas,DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
import {pdfAssetOptions} from '../lib/drawing-takeoff/pdf-assets';
import {focusedPageRaster} from '../lib/drawing-takeoff/focused-page-raster';

test('multiple focused crops reuse one detailed raster and retain source pixels',async()=>{
 Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
 const pdf=await PDFDocument.create(),source=pdf.addPage([400,300]);
 source.drawRectangle({x:20,y:210,width:130,height:65,color:rgb(.7,.7,.7),borderColor:rgb(0,0,0),borderWidth:1});
 const {getDocument,AnnotationMode}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({...pdfAssetOptions(),data:await pdf.save(),useSystemFonts:true,disableFontFace:true});
 let raster:ReturnType<typeof focusedPageRaster>|undefined;
 try{
  const document=await task.promise,page=await document.getPage(1),render=page.render.bind(page);let calls=0;
  page.render=params=>{calls++;return render(params);};raster=focusedPageRaster(page,AnnotationMode.DISABLE);
  const first=await raster.pixels(10,20,300,200);await raster.pixels(200,200,100,100);assert.equal(calls,1);
  const canvas=createCanvas(300,200),context=canvas.getContext('2d');
  await render({canvas:canvas as never,canvasContext:context as never,viewport:page.getViewport({scale:2}),transform:[1,0,0,1,-10,-20],annotationMode:AnnotationMode.DISABLE,background:'white'}).promise;
  assert.deepEqual(first.data,context.getImageData(0,0,300,200).data);
  assert.ok(first.data.some((value,index)=>index%4!==3&&value<255));
  canvas.width=1;canvas.height=1;
 }finally{raster?.destroy();await task.destroy();}
});

test('oversized sheets use bounded viewports instead of allocating a whole-page raster',async()=>{
 Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
 const pdf=await PDFDocument.create();pdf.addPage([5000,5000]);
 const {getDocument,AnnotationMode}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({...pdfAssetOptions(),data:await pdf.save()});let raster:ReturnType<typeof focusedPageRaster>|undefined;
 try{
  const document=await task.promise,page=await document.getPage(1),render=page.render.bind(page),sizes:number[][]=[];
  page.render=params=>{sizes.push([params.viewport.width,params.viewport.height]);return render(params);};
  raster=focusedPageRaster(page,AnnotationMode.DISABLE);await raster.pixels(0,0,100,100);await raster.pixels(200,200,150,100);
  assert.deepEqual(sizes,[[100,100],[150,100]]);
  await assert.rejects(raster.pixels(0,0,2000,2000),/Invalid focused source crop/);
 }finally{raster?.destroy();await task.destroy();}
});
