/** Evaluation only: human answers never become extraction prompts or saved phase rows. */
export type BenchmarkOpening = { mark: string; width?: string; height?: string; doorType?: string; handing?: string; wallType?: string; hardwareGroup?: string; sourcePage?: number; evidence?: string; sourceCells?: Record<string, string> };
export type BenchmarkField = "width" | "height" | "doorType" | "handing" | "wallType" | "hardwareGroup";
export const benchmarkFields: BenchmarkField[] = ["width", "height", "doorType", "handing", "wallType", "hardwareGroup"];
export const canonicalMark = (value: string) => value.trim().toUpperCase().replace(/^(\d+)\.0+$/, "$1");
export function benchmarkDimension(value: string) {
  const legacy = value.trim().match(/^(\d+)\/(\d+)$/);
  if (legacy) return Number(legacy[1]) * 12 + Number(legacy[2]);
  const match = value.replace(/[’]/g, "'").replace(/[”]/g, '"').trim().match(/^(\d+)\s*'\s*-?\s*(\d+(?:\s+\d+\/\d+)?|\d+\/\d+)\s*"$/);
  if (!match) return null;
  return Number(match[1]) * 12 + match[2].split(/\s+/).reduce((sum, part) => sum + (part.includes("/") ? Number(part.split("/")[0]) / Number(part.split("/")[1]) : Number(part)), 0);
}
function normalized(field: BenchmarkField, value: string | undefined) {
  const text = String(value || "").trim().toUpperCase();
  if (!text || /^(TBD|UNKNOWN|N\/A|UNCLEAR|NOT DETERMINED)$/.test(text)) return null;
  if (field === "width" || field === "height") return benchmarkDimension(text);
  if (field === "handing") return ({ L: "LH", R: "RH", LH: "LH", RH: "RH", LHR: "LHR", RHR: "RHR" } as Record<string, string>)[text] || null;
  return text.replace(/^(\d+)\.0+$/, "$1").replace(/\s+/g, " ");
}
export function compareOpeningBenchmark(expected: BenchmarkOpening[], actual: BenchmarkOpening[]) {
  const expectedByMark = new Map(expected.map(row => [canonicalMark(row.mark), row]));
  const actualByMark = new Map<string, BenchmarkOpening[]>();
  for (const row of actual) { const key = canonicalMark(row.mark); actualByMark.set(key, [...(actualByMark.get(key) || []), row]); }
  const fields = Object.fromEntries(benchmarkFields.map(key => [key, { comparable: 0, matched: 0, missing: 0, mismatched: 0, unknownExpected: 0 }])) as Record<BenchmarkField, { comparable: number; matched: number; missing: number; mismatched: number; unknownExpected: number }>;
  const discrepancies: Array<Record<string, unknown>> = [];
  let matchedIdentifiers = 0;
  for (const [mark, row] of expectedByMark) {
    const candidates = actualByMark.get(mark) || [];
    if (candidates.length === 1) matchedIdentifiers++;
    if (candidates.length > 1) discrepancies.push({ mark, kind: "duplicate-identifier", actualRows: candidates.length, sourcePages: candidates.map(r => r.sourcePage) });
    for (const field of benchmarkFields) {
      const wanted = normalized(field, row[field]);
      if (wanted === null) { fields[field].unknownExpected++; continue; }
      fields[field].comparable++;
      const got = candidates.length === 1 ? normalized(field, candidates[0][field]) : null;
      const status = got === null ? "missing" : typeof wanted === "number" && typeof got === "number" ? Math.abs(wanted - got) < 0.0001 ? "matched" : "mismatched" : wanted === got ? "matched" : "mismatched";
      fields[field][status]++;
      if (status !== "matched") discrepancies.push({ mark, field, status, expected: row[field], actual: candidates[0]?.[field] || "", humanCell: row.sourceCells?.[field], sourcePage: candidates[0]?.sourcePage, sourceEvidence: candidates[0]?.evidence });
    }
  }
  return { expectedIdentifiers: expectedByMark.size, actualRows: actual.length, matchedIdentifiers,
    missingIdentifiers: [...expectedByMark.keys()].filter(mark => !actualByMark.has(mark)),
    extraIdentifiers: [...actualByMark.keys()].filter(mark => !expectedByMark.has(mark)),
    duplicateIdentifiers: [...actualByMark.entries()].filter(([, rows]) => rows.length > 1).map(([mark]) => mark), fields, discrepancies };
}
