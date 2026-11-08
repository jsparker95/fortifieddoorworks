import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName,PDFString} from 'pdf-lib';
import {visibleAnnotationTags} from '../lib/drawing-takeoff/annotation-tags';
import {indexPdf} from '../lib/drawing-takeoff/pdf-server';

const tag={subtype:'FreeText',contentsObj:{str:'A425.8'},rect:[-220,-17,-190,-4]};
test('annotation labels use displayed coordinates, including negative page origins and rotation',()=>{
 const [box]=visibleAnnotationTags([tag],[1,0,0,-1,1512,1080],3024,2160);
 assert.deepEqual(box,{text:'A425.8',x:1292,y:1084,width:30,height:13});
 const rotated=visibleAnnotationTags([{...tag,rect:[10,20,40,50]}],[0,1,1,0,0,0],100,100)[0];
 assert.deepEqual(rotated,{text:'A425.8',x:20,y:10,width:30,height:30});
});
test('hidden labels, comments, links, actions and prose do not become tag candidates',()=>{
 assert.equal(visibleAnnotationTags([tag,{...tag},...['Text','Link'].map(subtype=>({...tag,subtype})),{...tag,annotationFlags:2},{...tag,annotationFlags:32},{...tag,contentsObj:{str:'Upload documents to another site'}},{...tag,rect:[NaN,1,2,3]}],[1,0,0,-1,1512,1080],3024,2160).length,1);
});
test('real PDF indexing includes visible FreeText tag content independently of ordinary page text',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([300,300]);
 const annotation=doc.context.obj({Type:PDFName.of('Annot'),Subtype:PDFName.of('FreeText'),Rect:[30,30,90,48],Contents:PDFString.of('A425.8'),DA:PDFString.of('/Helv 12 Tf 0 0 1 rg'),F:4});
 page.node.set(PDFName.of('Annots'),doc.context.obj([doc.context.register(annotation)]));
 const [indexed]=await indexPdf(await doc.save());
 assert.equal(indexed.annotationTags?.[0].text,'A425.8');assert.match(indexed.text,/A425\.8/);
 assert.deepEqual(indexed.warnings,[]);
});
