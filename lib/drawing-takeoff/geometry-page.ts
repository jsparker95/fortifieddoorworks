import {PDFDocument,PDFName,PDFRawStream,PDFArray} from 'pdf-lib';
import {inflateSync} from 'node:zlib';

/** Copy only the architectural page graph. Annotation appearance streams are
 * optional markup, not trustworthy wall/swing geometry. Removing the page's
 * Annots reference before copying also excludes unreachable appearance/fonts
 * from the new document. The original upload and indexed annotation IDs remain.
 */
export async function geometryPage(bytes:Uint8Array){
 const source=await PDFDocument.load(bytes);
 if(source.getPageCount()!==1)throw new Error('Native geometry requires one segmented PDF page.');
 const page=source.getPage(0),annotationsRemoved=page.node.has(PDFName.of('Annots'));
 page.node.delete(PDFName.of('Annots'));
 const destination=await PDFDocument.create(),[copy]=await destination.copyPages(source,[0]);destination.addPage(copy);
 // PDF.js can replace a broken Flate stream with an empty stream even in
 // strict mode. Validate reachable non-image streams before that can hide
 // architectural paths. Bound both individual and aggregate expansion.
 let expanded=0;
 for(const [,object] of destination.context.enumerateIndirectObjects())if(object instanceof PDFRawStream&&object.dict.get(PDFName.of('Subtype'))!==PDFName.of('Image')){
  const raw=object.dict.get(PDFName.of('Filter')),filters=raw instanceof PDFArray?raw.asArray():raw?[raw]:[];
  if(!filters.some(filter=>['/FlateDecode','/Fl'].includes(String(filter))))continue;
  if(filters.length!==1)throw new Error('The architectural page uses a compressed filter chain that requires source review.');
  try{expanded+=inflateSync(object.contents,{maxOutputLength:64*1024*1024}).length;}catch{throw new Error('An architectural content or font stream is corrupt or exceeds the safe expansion limit. Source review is required.');}
  if(expanded>128*1024*1024)throw new Error('Architectural stream expansion exceeds the bounded page budget.');
 }
 return {bytes:await destination.save(),annotationsRemoved};
}
