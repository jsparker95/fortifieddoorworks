import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { PDFDocument } from 'pdf-lib';
import { pageFromSegment } from '../lib/drawing-takeoff/segment-page';

test('page preparation uses a bounded saved segment and preserves original page identity', async () => {
 const pdf = await PDFDocument.create();
 pdf.addPage([101,201]); pdf.addPage([102,202]); pdf.addPage([103,203]);
 const bytes = await pdf.save();
 const output = await PDFDocument.load(await pageFromSegment(bytes,[35,39,88],88));
 assert.equal(output.getPageCount(),1);
 assert.deepEqual(output.getPage(0).getSize(),{width:103,height:203});
 await assert.rejects(pageFromSegment(bytes,[35,39,88],80),/missing from its saved segment/);
 await assert.rejects(pageFromSegment(bytes,[35,88],88),/mapping is inconsistent/);
});

test('large-file preparation never opens the original PDF and checkpoints each page before continuing', async () => {
 const source=await readFile('lib/drawing-takeoff/job-prepare.ts','utf8');
 const file=ts.createSourceFile('prepare.ts',source,ts.ScriptTarget.Latest,true);
 const functions=file.statements.filter(ts.isFunctionDeclaration);
 for(const name of ['planExtraction','preparePage','finishPreparation']) {
  const fn=functions.find(fn=>fn.name?.text===name)!;
  assert.ok(fn);
  assert.doesNotMatch(fn.getText(file),/storage\.from\("project-documents"\)|document\.storage_path|PDFDocument\.load/);
 }
 assert.match(source,/pageFromSegment\(await getArtifact\(sourceArtifact\), sourcePages, page.page\)/);
 assert.match(source,/\.range\(offset, offset \+ 499\)/);
 const workflow=await readFile('workflows/document-extraction.ts','utf8');
 assert.match(workflow,/await sleep\("1s"\);\s*warnings.push\(\.\.\.await preparePageStep/);
 assert.match(workflow,/async function preparePageStep[^\n]+"use step"/);
 assert.ok(workflow.indexOf('await finishPreparationStep')>workflow.indexOf('await preparePageStep'));
 assert.match(source,/preparedPages: ordinal/);
});
