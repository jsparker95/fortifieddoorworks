import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName,pushGraphicsState,popGraphicsState,concatTransformationMatrix,drawObject} from 'pdf-lib';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {renderCrop} from '../lib/drawing-takeoff/pdf-server';

test('embedded JPEG2000 source images render instead of silently disappearing',async()=>{
 const bytes=Buffer.from('AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAACAAAAAgAAwcHAAAAAAAPY29scgEAAAAAABAAAACkanAyY/9P/1EALwAAAAAACAAAAAgAAAAAAAAAAAAAAAgAAAAIAAAAAAAAAAAAAwcBAQcBAQcBAf9SAAwAAAABAAMEBAAB/1wADUBASEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS4z/5AACgAAAAAAIwAB/5PPtAQA34AIB9+ACAeAgICAgICAgID/2Q==','base64');
 const pdf=await PDFDocument.create(),page=pdf.addPage([100,100]);
 const image=pdf.context.register(pdf.context.stream(bytes,{Type:PDFName.of('XObject'),Subtype:PDFName.of('Image'),Width:8,Height:8,ColorSpace:PDFName.of('DeviceRGB'),BitsPerComponent:8,Filter:PDFName.of('JPXDecode')}));
 const name=page.node.newXObject('SourceImage',image);
 page.pushOperators(pushGraphicsState(),concatTransformationMatrix(100,0,0,100,0,0),drawObject(name),popGraphicsState());
 const rendered=await loadImage(await renderCrop(await pdf.save()));const canvas=createCanvas(rendered.width,rendered.height),context=canvas.getContext('2d');context.drawImage(rendered,0,0);
 const pixel=context.getImageData(100,100,1,1).data;
 assert.ok(pixel[0]>230&&pixel[1]<30&&pixel[2]<30,`Expected source red pixel; received ${Array.from(pixel)}`);
});
