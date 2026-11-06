"""Build a private, read-only HTML test report from recorded benchmark data."""
import argparse
import html
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('root', type=Path)
args = parser.parse_args()
root = args.root
manifest = json.loads((root / 'manifest.json').read_text())
notes = json.loads((root / 'ai-analysis-notes.json').read_text())
results = {}
for label in ['baseline', 'geometric']:
    path = root / 'reports' / ('literal-' + label + '.json')
    results[label] = json.loads(path.read_text()) if path.exists() else []

def esc(value): return html.escape(str(value if value is not None else 'Not measured'))
def score(value): return f"{value['matched']}/{value['comparable']}" if value['comparable'] else 'Not comparable'
events = [json.loads(line) for line in (root / 'test-results.jsonl').read_text().splitlines() if line.strip()]
model_events = [event for event in events if event.get('modelCalls')]
model_calls = sum(event.get('modelCalls', 0) for event in model_events)
model_cost = sum(float(event.get('gatewayCostUsd') or 0) for event in model_events)
visual_summary = ''
for comparison_file in sorted((root / 'reports').glob('image-comparison-*.json')):
    comparison = json.loads(comparison_file.read_text())
    visual_summary += f"<p><b>{esc(comparison['project'])}:</b> {comparison['matchedIdentifiers']}/{comparison['expectedIdentifiers']} human opening IDs recovered; widths {score(comparison['fields']['width'])}, heights {score(comparison['fields']['height'])}, hardware group references {score(comparison['fields']['hardwareGroup'])}. The source has {len(comparison['extraIdentifiers'])} additional rows needing scope review. Handing, hardware components and saved phase rows are still separate tests.</p>"
frame_total = sum(human['summary']['frameAssemblies'] for project in manifest['projects'] for human in project.get('humanBaselines', []))
hardware_total = sum(human['summary']['hardwareUnits'] for project in manifest['projects'] for human in project.get('humanBaselines', []))
visual_results = ''.join(f"<li>{esc(event.get('project'))} · PDF page {esc(event.get('sourcePage'))} · {esc(event.get('stage'))} · {esc(event.get('rows'))} rows · {float(event.get('gatewayCostUsd') or 0):.6f} USD · {esc(event.get('elapsedMs'))} ms</li>" for event in model_events)
rows = []
for project in manifest['projects']:
    for human in project.get('humanBaselines', []):
        name = Path(human['file']).stem
        baseline = next((r for r in results['baseline'] if r['project'] == project['id'] and r['humanWorkbook'] == human['url']), None)
        current = next((r for r in results['geometric'] if r['project'] == project['id'] and r['humanWorkbook'] == human['url']), None)
        display = project['name'] + (' — guest rooms' if 'guest' in name else ' — common spaces' if 'common' in name else '')
        rows.append(f"<tr><td><a href='{esc(human['url'])}'>{esc(display)}</a></td><td>{human['summary']['frameAssemblies']}</td><td>{human['summary']['hardwareUnits']}</td><td>{baseline['actualRows'] if baseline else '—'}</td><td>{current['actualRows'] if current else '—'}</td><td>{current['matchedIdentifiers'] if current else '—'}</td><td>{score(current['fields']['width']) if current else '—'}</td><td>{score(current['fields']['height']) if current else '—'}</td><td><span class='pending'>Pending full-app run</span></td></tr>")
details = []
for result in results['geometric']:
    project = next(p for p in manifest['projects'] if p['id'] == result['project'])
    fields = ''.join(f"<tr><td>{esc(field)}</td><td>{value['comparable']}</td><td>{value['matched']}</td><td>{value['missing']}</td><td>{value['mismatched']}</td><td>{value['unknownExpected']}</td></tr>" for field,value in result['fields'].items())
    discrepancies = ''.join(f"<li><b>{esc(d.get('mark'))}</b> · {esc(d.get('field',d.get('kind')))} · {esc(d.get('status','review'))}: expected <code>{esc(d.get('expected'))}</code>; extracted <code>{esc(d.get('actual'))}</code>; human cell {esc(d.get('humanCell'))}; PDF page {esc(d.get('sourcePage'))}</li>" for d in result['discrepancies'])
    details.append(f"<details><summary>{esc(project['name'])} · human baseline {result['humanTotals']['frameAssemblies']} assemblies</summary><p>Missing exact identifiers at the literal-parser stage: {esc(', '.join(result['missingIdentifiers']) or 'None')}. Extra literal identifiers: {esc(', '.join(result['extraIdentifiers']) or 'None')}.</p><p>Catalog types and estimator-created instance names need a separate floor-plan comparison; these counts are not a full-app accuracy score.</p><table><tr><th>Field</th><th>Comparable</th><th>Match</th><th>Missing</th><th>Different</th><th>Human unknown / unmapped</th></tr>{fields}</table><details><summary>Field discrepancy evidence</summary><ul>{discrepancies}</ul></details></details>")
notes_html = []
for note in notes:
    evidence = ''.join(f"<p><b>{esc(key)}</b> <code>{esc(json.dumps(value,ensure_ascii=False))}</code></p>" for key,value in note.items() if key.endswith('Evidence'))
    notes_html.append(f"<article><h3>{esc(note['project'])} · {esc(note['topic'])}</h3>{evidence}<p><b>Question for Brian:</b> {esc(note['question'])}</p></article>")
activity = ''.join(f"<li><b>{esc(event.get('recordedAt'))}</b> · {esc(event.get('stage'))} · {esc(event.get('project',event.get('sourceCase','')))} · {esc(event.get('result',event.get('finding','')))} {esc('Rows: ' + str(event['rows']) if 'rows' in event else '')}</li>" for event in events)
sources = ''.join(f"<li><a href='{esc(p['sourceFolder'])}'>{esc(p['name'])}</a><ul>" + ''.join(f"<li>{esc(f['name'])} · {f['bytes']:,} bytes · SHA-256 <code>{esc(f['sha256'])}</code></li>" for f in p['files']) + '</ul></li>' for p in manifest['projects'])
page = f"""<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Fortified Doorworks · Pipeline extraction test log</title><style>body{{font:15px/1.5 system-ui,sans-serif;background:#f5f6f8;color:#1c2938;margin:0}}main{{max-width:1280px;margin:36px auto;padding:0 24px}}h1{{font-size:30px;margin-bottom:6px}}h2{{margin-top:32px}}.muted{{color:#596675}}.notice,article,details,.panel{{background:white;border:1px solid #dce1e7;border-radius:12px;padding:18px;margin:14px 0}}.notice{{border-left:4px solid #ea5919}}table{{border-collapse:collapse;width:100%;font-size:13px}}th,td{{text-align:left;padding:12px 9px;border-bottom:1px solid #e3e7eb;vertical-align:top}}th{{color:#596675;background:#fafbfc}}a{{color:#a34113}}code{{overflow-wrap:anywhere;font-size:12px}}.pending{{color:#8b5c12}}summary{{cursor:pointer;font-weight:650}}li{{margin:8px 0}}.scroll{{overflow:auto}}@media print{{body{{background:white}}details{{break-inside:avoid}}}}</style><main><h1>Pipeline extraction test log</h1><p class='muted'>Fortified Doorworks · started November 6, 2026 · {len(manifest['projects'])} project folders / {sum(len(p.get('humanBaselines', [])) for p in manifest['projects'])} human takeoffs</p><div class='notice'><b>Current stage: source extraction benchmarks; full-app tests pending.</b> Full-app extraction, saved phase rows, handing and complete hardware-link accuracy are not yet verified by these runs. Human baseline totals: <b>{frame_total:,} assemblies / {hardware_total:,} hardware units</b>. The shared Drive sources are read-only. <b>Recorded paid model calls: {model_calls}; reported API cost: ${model_cost:.6f}.</b></div><h2>Per-project baseline</h2><p>“Human IDs found” compares exact opening identifiers, not reusable door-type codes. Paired assemblies and door leaves are kept distinct. Extra plan rows remain scope-review items until supported.</p><div class='panel scroll'><table><tr><th>Project / human Takeoff</th><th>Human assemblies</th><th>Human HW units</th><th>Old literal rows</th><th>Working literal rows</th><th>Human IDs found</th><th>Widths correct</th><th>Heights correct</th><th>Full app</th></tr>{''.join(rows)}</table></div><h2>Field-level results and evidence</h2>{''.join(details)}<h2>Image-section tests</h2><p>These are separate source-only experiments, not a saved-phase accuracy score. Repeated calls use cached responses where available.</p>{visual_summary}<ul>{visual_results}</ul><h2>AI analysis notes for review with Brian</h2>{''.join(notes_html)}<h2>Recorded test activity</h2><details><summary>Chronological test log</summary><ul>{activity}</ul></details><h2>Source versions</h2><ul>{sources}</ul><p class='muted'>Machine-readable records: test-results.jsonl, manifest.json, AI analysis notes, and reports/literal-*.json in the private benchmark folder. Completed model responses will be cached separately from comparison answers. No parity claim is made from matching counts alone.</p></main></html>"""
(root / 'reports' / 'index.html').write_text(page)
print(root / 'reports' / 'index.html')
