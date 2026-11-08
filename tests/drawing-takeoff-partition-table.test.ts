import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionTableWallNotes } from '../lib/drawing-takeoff/partition-table';
import { findPageContent, groundedScheduleKinds, type PageIndex, type TextBox } from '../lib/drawing-takeoff/indexing';
import { inventoryWallNotes, reconcileWallNotes } from '../lib/drawing-takeoff/wall-evidence';
import { mapAnalysisToPhaseRows, mergePhaseCandidateRows } from '../lib/drawing-takeoff/phase-import';
import { taskIdsWithinBudget } from '../lib/drawing-takeoff/task-budget';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const box = (text: string, x: number, y: number, width = 20): TextBox => ({ text, x, y, width, height: 10 });
function fixture(): PageIndex {
  const boxes = [{ ...box('PARTITION SCHEDULE', 140, 30, 150), height: 20 }, box('TYPE', 20, 60, 30), box('DESCRIPTION', 200, 60, 100)];
  for (let i = 0; i < 11; i++) {
    const y = 100 + i * 40;
    boxes.push(box(String.fromCharCode(65 + i), 31, y, 8),
      box(`INTERIOR PARTITION - assembly ${i + 1}; 2X6 STUDS`, 80, y - 8, 300),
      box(i === 2 ? 'GYP. ON ONE SIDE ONLY (TYP.)' : 'GYP. ON BOTH SIDES (TYP.)', 80, y + 6, 260));
  }
  boxes.push(box('UNRELATED ADJACENT VIEW', 500, 100, 180), box('INTERIOR PARTITION - unrelated detail', 80, 800, 300), box('D', 31, 800, 8));
  return { page: 5, width: 1000, height: 1000, rotation: 0, boxes, text: boxes.map(b => b.text).join(' '), lines: boxes.map(b => b.text) };
}

test('literal partition tables preserve wrapped descriptions, row citations and missing ordered depths', () => {
  const page = fixture(), rows = partitionTableWallNotes(page);
  assert.deepEqual(rows.map(row => row.code), [...'ABCDEFGHIJK']);
  assert.match(rows[0].description, /assembly 1; 2X6 STUDS GYP\. ON BOTH SIDES/);
  assert.match(rows[2].description, /ONE SIDE ONLY/);
  assert.doesNotMatch(rows[1].description, /ONE SIDE|assembly 3/);
  assert.ok(rows.every(row => row.finishedThickness === '' && row.layers.length === 0 && row.sourcePage === 5));
  assert.match(rows[10].evidence, /PARTITION SCHEDULE, PDF page 5, printed row K:/);
  assert.deepEqual(inventoryWallNotes(page), rows);
  assert.ok(findPageContent(page).kinds.includes('walls'));
  assert.deepEqual(groundedScheduleKinds(page, []), ['walls']);
  const imported = mapAnalysisToPhaseRows('source-doc', { walls: rows }).walls!;
  assert.ok(imported.every(row => row.size === '' && row.finishedThickness === '' && row.frameDepthReviewRequired === true));
  const reviewed = { ...imported[0], size: 'chosen-frame-depth', reviewState: 'human-reviewed' };
  assert.deepEqual(mergePhaseCandidateRows([reviewed], [imported[0]]), [reviewed]);
});

test('unknown headers, missing code anchors and ambiguous duplicate rows retain visual fallback', () => {
  for (const change of [
    (p: PageIndex) => { p.boxes[0].text = 'SEE PARTITION SCHEDULE'; },
    (p: PageIndex) => { p.boxes[2].y += 25; },
    (p: PageIndex) => { p.boxes = p.boxes.filter(b => b.text !== 'B'); },
    (p: PageIndex) => { p.boxes.push(box('A', 31, 120, 8)); },
    (p: PageIndex) => { p.boxes.push(box('TYPE', 20, 60, 30)); },
  ]) {
    const page = fixture(); change(page);
    assert.deepEqual(partitionTableWallNotes(page), []);
  }
  const page = fixture(), prior = { code: 'C', description: 'Old model note', finishedThickness: '7"', layers: [], sourcePage: 5, evidence: 'old', confidence: .6 };
  const corrected = reconcileWallNotes(page, [prior]);
  assert.equal(corrected.filter(row => row.code === 'C').length, 1);
  assert.match(corrected.find(row => row.code === 'C')!.description, /ONE SIDE ONLY/);
  assert.equal(corrected.find(row => row.code === 'C')!.finishedThickness, '');
});

test('an explicit finished total stays separate from ordered frame depth and native work needs no paid budget', () => {
  const page = fixture(); page.boxes.find(b => b.text.startsWith('INTERIOR PARTITION - assembly 1;'))!.text += '; FINISHED WALL THICKNESS: 6 1/2"';
  const rows = partitionTableWallNotes(page), imported = mapAnalysisToPhaseRows('source-doc', { walls: rows }).walls!;
  assert.equal(rows[0].finishedThickness, '6 1/2"');
  assert.equal(imported[0].finishedThickness, '6 1/2"');
  assert.equal(imported[0].size, '');
  assert.equal(imported[0].sourceDocumentId, 'source-doc');
  assert.equal(imported[0].sourcePage, 5);
  const task = { task_key: 'walls:5', kind: 'walls', input: { pages: [5], wallTableArtifact: 'native-wall-table' } };
  assert.deepEqual(taskIdsWithinBudget([task], new Map([['walls:5', 'native-id']]), 0), ['native-id']);
});

test('native partition preparation and extraction complete without calling a model', async () => {
  const page = fixture(), tasks: any[] = [], artifacts = new Map<string, Uint8Array>(), refreshed: any[] = [];
  const input = { finding: findPageContent(page), page, knownMarks: [], marksHash: 'test', sourceArtifact: 'segment', sourcePages: [5], root: 'root', total: 1 };
  artifacts.set('input', new TextEncoder().encode(JSON.stringify(input)));
  artifacts.set('segment', new Uint8Array([1]));
  const chain: any = { eq: () => chain, then: (resolve: any) => resolve({ data: [], error: null }) };
  const db = { from: () => ({ select: () => chain, update: (value: any) => { refreshed.push(value); return chain; } }) };
  const req = createRequire(import.meta.url);
  const compile = async (file: string, mocks: Record<string, unknown>) => {
    const code = ts.transpileModule(await readFile(`lib/drawing-takeoff/${file}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const exports: Record<string, any> = {};
    vm.runInNewContext(code, { exports, TextDecoder, console: { info: () => {} }, require: (name: string) => mocks[name] || req(name.startsWith('.') ? path.resolve('lib/drawing-takeoff', name) : name) });
    return exports;
  };
  const preparation = await compile('job-prepare', {
    './job-store': { loadJob: async () => ({ db, job: { status: 'indexed', analysis: {}, progress: {} } }),
      getArtifact: async (key: string) => artifacts.get(key), putArtifact: async (key: string, data: string | Uint8Array) => { artifacts.set(key, typeof data === 'string' ? new TextEncoder().encode(data) : data); return key; },
      addTasks: async (_id: string, incoming: any[]) => { tasks.push(...incoming); }, updateJob: async () => {} },
    './segment-page': { pageFromSegment: async () => new Uint8Array([1]) },
    './pdf-server': {},
  });
  await preparation.preparePage('job', 'input', 1, 'schedules', 1);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].kind, 'walls');
  assert.equal(tasks[0].input.wallTableArtifact, 'root/partition-table-5-v1.json');
  assert.ok(refreshed.some(value => value.input?.wallTableArtifact === tasks[0].input.wallTableArtifact));
  let modelCalls = 0, completed: any;
  const task = { ...tasks[0], id: 'native', job_id: 'job', status: 'pending', attempts: 0, metrics: { responseId: 'retained-old-call', gatewayCostUsd: '.01' } };
  const extractionDb = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: task, error: null }) }) }),
    update: (value: any) => ({ eq: async () => { if (value.status === 'complete') completed = value; return { error: null }; } }) }) };
  const extraction = await compile('job-extract', {
    './job-store': { workerClient: () => extractionDb, loadJob: async () => ({ job: { status: 'extracting' } }), getArtifact: async (key: string) => artifacts.get(key) },
    './source-model': { readSourceModel: async () => { modelCalls++; throw new Error('A literal wall table must not call a model'); } },
    './pdf-server': {},
  });
  await extraction.extractTask('native');
  assert.equal(modelCalls, 0);
  assert.equal(completed.result.walls.length, 11);
  assert.equal(completed.result.walls[0].sourcePage, 5);
  assert.equal(completed.result.walls[0].finishedThickness, '');
  assert.equal(completed.metrics.aiCallsThisAttempt, 0);
  assert.equal(completed.metrics.gatewayCostUsd, '0');
  assert.equal(completed.metrics.previousMetrics.responseId, 'retained-old-call');
});
