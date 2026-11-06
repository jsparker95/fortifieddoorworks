import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,copyFile,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const routes=['api/documents/analyze','.well-known/workflow/v1/flow'];
const required=['package.json','wasm/openjpeg.wasm','wasm/openjpeg_nowasm_fallback.js','wasm/jbig2.wasm'];
const staged=await mkdtemp(join(tmpdir(),'fortified-pdf-runtime-'));
try{
 for(const route of routes){
  const trace=join(root,'.next/server/app',route,'route.js.nft.json');
  const files=JSON.parse(await readFile(trace,'utf8')).files;
  for(const asset of required)assert.ok(files.some(file=>file.endsWith(`/node_modules/pdfjs-dist/${asset}`)),`${route}: missing deployed PDF asset ${asset}`);
  for(const file of files){
   const marker='node_modules/pdfjs-dist/',offset=file.indexOf(marker);
   if(offset<0)continue;
   const target=join(staged,file.slice(offset));await mkdir(dirname(target),{recursive:true});await copyFile(resolve(dirname(trace),file),target);
  }
 }
 const result=spawnSync(process.execPath,['--import',pathToFileURL(join(root,'node_modules/tsx/dist/loader.mjs')).href,'--test',join(root,'tests/drawing-takeoff-pdf-images.test.ts')],{cwd:staged,stdio:'inherit'});
 assert.equal(result.status,0,'PDF image decoding must work with only deployed runtime assets');
 console.log('PDF runtime package, codecs and fonts verified from both function traces.');
}finally{await rm(staged,{recursive:true,force:true});}
