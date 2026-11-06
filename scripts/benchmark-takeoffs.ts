import fs from "node:fs/promises";
import path from "node:path";
import { compareOpeningBenchmark, type BenchmarkOpening } from "../lib/drawing-takeoff/benchmark";
const root = process.argv[2];
const input = process.argv[3] || "literal-findings.json";
const label = process.argv[4] || "working";
(async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
  const results = [];
  for (const project of manifest.projects) {
    let source;
    try { source = JSON.parse(await fs.readFile(path.join(root, project.id, input), "utf8")); } catch { continue; }
    const actual = source.findings.flatMap((f: { openingRows: BenchmarkOpening[] }) => f.openingRows);
    for (const human of project.humanBaselines) {
      const workbook = JSON.parse(await fs.readFile(human.file, "utf8"));
      const expected: BenchmarkOpening[] = workbook.sheets.Frames.rows.filter((r: { row: number; cells: Record<string, string> }) => r.row > 1 && r.cells.A && r.cells.A !== "0" && !["1", "TRUE"].includes(r.cells.P)).map((r: { row: number; cells: Record<string, string> }) => ({
        mark: r.cells.A, width: r.cells.C, height: r.cells.D, doorType: r.cells.M, handing: r.cells.G, wallType: r.cells.E, hardwareGroup: r.cells.O,
        sourceCells: Object.fromEntries([["width", "C"], ["height", "D"], ["doorType", "M"], ["handing", "G"], ["wallType", "E"], ["hardwareGroup", "O"]].map(([key, column]) => [key, `Frames!${column}${r.row}`])),
      }));
      const result = { recordedAt: new Date().toISOString(), project: project.id, humanWorkbook: human.url, sourceSha256: source.sourceSha256,
        label, stage: "literal-parser-only", modelCalls: 0, gatewayCostUsd: 0, fullAppExtraction: "not measured in this run", sourcePages: source.findings.length,
        humanTotals: workbook.summary, ...compareOpeningBenchmark(expected, actual) };
      results.push(result);
      console.log(JSON.stringify({ project: result.project, humanFrames: result.humanTotals.frameAssemblies, actualLiteralRows: result.actualRows, matchedHumanIds: result.matchedIdentifiers, missingHumanIds: result.missingIdentifiers.length, extraLiteralIds: result.extraIdentifiers.length, fieldScores: result.fields }));
    }
  }
  await fs.mkdir(path.join(root, "reports"), { recursive: true });
  await fs.writeFile(path.join(root, "reports", `literal-${label}.json`), JSON.stringify(results, null, 2));
  for (const result of results) await fs.appendFile(path.join(root, "test-results.jsonl"), JSON.stringify({ ...result, discrepanciesFile: `reports/literal-${label}.json`, discrepancies: undefined }) + "\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
