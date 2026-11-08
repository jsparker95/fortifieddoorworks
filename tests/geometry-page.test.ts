import test from 'node:test';import assert from 'node:assert/strict';import {PDFDocument,PDFName,PDFString,StandardFonts,moveTo,lineTo,stroke} from 'pdf-lib';
import {geometryPage} from '../lib/drawing-takeoff/geometry-page';import {analyzeVectorPlan} from '../lib/drawing-takeoff/vector-pdf';import {indexPdf} from '../lib/drawing-takeoff/pdf-server';

test('large malformed annotation appearances are separated without losing original annotation identifiers',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([400,300]),font=await doc.embedFont(StandardFonts.Helvetica);page.drawText('FLOOR PLAN',{x:10,y:270,font,size:10});
 const points=Array.from({length:13},(_,i)=>({x:100+40*Math.cos(i*Math.PI/24),y:150-40*Math.sin(i*Math.PI/24)}));page.pushOperators(moveTo(points[0].x,points[0].y),...points.slice(1).map(p=>lineTo(p.x,p.y)),stroke(),moveTo(100,150),lineTo(100,110),stroke());
 const bad=doc.context.register(doc.context.stream(new Uint8Array(9*1024*1024).fill(90),{Type:'XObject',Subtype:'Form',BBox:[0,0,30,20],Filter:'FlateDecode'}));
 const annotation=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'FreeText',Rect:[110,145,140,155],Contents:PDFString.of('A101'),DA:PDFString.of('/Helv 10 Tf 0 g'),AP:{N:bad}}));page.node.set(PDFName.of('Annots'),doc.context.obj([annotation]));
 const bytes=await doc.save({useObjectStreams:false}),before=Buffer.from(bytes),index=await indexPdf(bytes);assert.ok(index[0].annotationTags?.some(t=>t.text==='A101'));
 const geometry=await geometryPage(bytes);assert.ok(bytes.length>8*1024*1024);assert.ok(geometry.bytes.length<100_000);assert.equal(geometry.annotationsRemoved,true);
 assert.equal((await PDFDocument.load(bytes)).getPage(0).node.has(PDFName.of('Annots')),true);assert.deepEqual(Buffer.from(bytes),before);
 const vector=await analyzeVectorPlan(bytes,{...index[0],lines:['ENLARGED FLOOR PLAN - LEVEL 1 - B']},['A101']);
 assert.equal(vector.supported,true);assert.equal(vector.observations[0].mark,'A101');assert.equal(vector.observations[0].handing,'');assert.equal(vector.decodeEvidence?.annotationsSeparated,true);assert.ok(vector.decodeEvidence!.geometryBytes<bytes.length);
});

test('architectural stream corruption is not hidden by annotation separation',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([400,300]);const bad=doc.context.register(doc.context.stream(new Uint8Array([90,90,90,90]),{Filter:'FlateDecode'}));page.node.set(PDFName.of('Contents'),bad);
 const bytes=await doc.save();await assert.rejects(()=>analyzeVectorPlan(bytes,{page:1,lines:[]},[]));
});
