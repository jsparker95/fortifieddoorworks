import {dirname,join} from 'node:path';

// PDF.js loads codecs and standard fonts at runtime; omitting these can render
// embedded JPEG2000/JBIG2 plan images as white rectangles without failing the PDF.
const runtimeRequire=process.getBuiltinModule('module').createRequire(`${process.cwd()}/package.json`);
const root=dirname(runtimeRequire.resolve('pdfjs-dist/package.json'));
export const pdfAssetOptions={wasmUrl:join(root,'wasm')+'/',standardFontDataUrl:join(root,'standard_fonts')+'/',useWorkerFetch:false};
