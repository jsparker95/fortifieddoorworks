"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, ExternalLink, Check, LoaderCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Kind, ProjectDocument, Row } from "@/lib/types";
import { mapAnalysisToPhaseRows, mapPhaseCandidate } from "@/lib/drawing-takeoff/phase-import";

type Analysis = {
  relevantPages?: Array<{ page: number; section: string; reason: string; confidence: number }>;
  doorwayObservations?: Array<{ mark: string; sourcePage: number; boundingBox: { x: number; y: number; width: number; height: number }; hingeSide: string; swingDirection: string; handing: string; handingEvidence: string; symbolEvidence: string; confidence: number }>;
  matchedDoorways?: Array<{ mark: string; sourcePage: number; boundingBox: { x: number; y: number; width: number; height: number }; confidence: number; evidence: string; schedulePage: number | null; scheduleEvidence: string; scheduleMatches: number; width: string; height: string; hingeSide: string; swingDirection: string; handing: string; handingEvidence: string; reviewReasons: string[] }>;
  unmatchedSchedule?: Array<{ mark: string; sourcePage: number; evidence: string }>;
  pageCoverage?: { totalScannedPages: number; visuallyReviewedScannedPages: number; unreviewedScannedPages: number };
  doorwayDetectionConflicts?: number;
  suppressedDuplicateDoorSymbols?: number;
  walls?: Array<Record<string, unknown>>; doorTypes?: Array<Record<string, unknown>>;
  openings?: Array<Record<string, unknown>>; hardwareGroups?: Array<Record<string, unknown>>;
  specFindings?: Array<Record<string, unknown>>; uncertainties?: string[];
  indexedPageCount?: number; scannedPageCount?: number; candidatePageCount?: number;
};
const categories: Array<{ key: keyof Analysis; label: string; kind: Kind }> = [
  { key: "openings", label: "Openings", kind: "openings" },
  { key: "walls", label: "Wall types", kind: "walls" },
  { key: "doorTypes", label: "Door types", kind: "doorTypes" },
  { key: "hardwareGroups", label: "Hardware components", kind: "hardware" },
];

export function DocumentManager({ projectId, phaseId, phaseName, document, onApply, onAnalyzed }: {
  projectId: string; phaseId: string; phaseName: string; document: ProjectDocument;
  onApply: (rows: Partial<Record<Kind, Row[]>>) => void | Promise<void>;
  onAnalyzed: (analysis: Record<string, unknown>) => void;
}) {
  const current = document;
  const analysis = current.analysis as Analysis | null;
  const doorwayHandCounts = (analysis?.matchedDoorways || []).reduce<Record<string, number>>((counts, doorway) => {
    const hand = ["LH", "RH", "LHR", "RHR"].includes(doorway.handing) ? doorway.handing : "Needs review";
    counts[hand] = (counts[hand] || 0) + 1;
    return counts;
  }, {});
  const [busyAction, setBusyAction] = useState<"analysis" | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualPageInput, setManualPageInput] = useState("");
  const autoStarted = useRef(false);
  const recoveryImportStarted = useRef(false);
  const busy = busyAction !== null;

  const analyze = useCallback(async () => {
    if (!current) return;
    setBusyAction("analysis"); setError(""); setNotice("");
    try {
      const manualPages = new Set<number>();
      for (const token of manualPageInput.split(",").map((part) => part.trim()).filter(Boolean)) {
        const match = token.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        if (!match) throw new Error("Enter page numbers like 22, 45-49. You can select up to 36 pages.");
        const start = Number(match[1]), end = Number(match[2] || match[1]);
        if (start < 1 || end < start || end - start > 35) throw new Error("Each page range must be valid and no range may exceed 36 pages.");
        for (let page = start; page <= end; page++) manualPages.add(page);
        if (manualPages.size > 36) throw new Error("Select no more than 36 manual pages at a time.");
      }
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Sign in again before analyzing this PDF.");
      const response = await fetch("/api/documents/analyze", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ documentId: current.id, projectId, phaseId, manualPages: [...manualPages] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Analysis failed.");
      const phaseRows = mapAnalysisToPhaseRows(current.id, result.analysis as Record<string, unknown>);
      const candidateCount = Object.values(phaseRows).reduce((sum, rows) => sum + (rows?.length || 0), 0);
      recoveryImportStarted.current = true;
      if (candidateCount) await onApply(phaseRows);
      setSelected(new Set()); onAnalyzed(result.analysis);
      setNotice(candidateCount
        ? `Extraction finished. ${candidateCount} AI draft item(s) were added to ${phaseName}; review them in the phase tabs before ordering or production.`
        : "Extraction finished. No phase rows were found; review the page findings and extraction notes.");
    } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed."); }
    finally { setBusyAction(null); }
  }, [current, manualPageInput, onAnalyzed, onApply, phaseId, phaseName, projectId]);

  useEffect(() => {
    if (current.status !== "uploaded" || autoStarted.current) return;
    autoStarted.current = true;
    void analyze();
  }, [analyze, current.status]);

  useEffect(() => {
    if (!current.analysis || recoveryImportStarted.current) return;
    recoveryImportStarted.current = true;
    const rows = mapAnalysisToPhaseRows(current.id, current.analysis);
    if (Object.values(rows).some((items) => items?.length)) {
      void (async () => {
        try { await onApply(rows); setNotice(`Saved the existing extraction as AI draft rows in ${phaseName}. Review them in the phase tabs.`); }
        catch (e) { setError(e instanceof Error ? e.message : "Could not add the saved extraction to this phase."); }
      })();
    }
  }, [current.analysis, current.id, onApply, phaseName]);
  async function openPage(page: number) {
    if (!current) return;
    const { data, error: linkError } = await supabase.storage.from("project-documents").createSignedUrl(current.storage_path, 300);
    if (linkError || !data?.signedUrl) { setError(linkError?.message || "Could not open PDF."); return; }
    window.open(`${data.signedUrl}#page=${page}`, "_blank", "noopener,noreferrer");
  }
  async function openDocument() { await openPage(1); }
  const candidates = useMemo(() => categories.flatMap((category) => ((analysis?.[category.key] as Array<Record<string, unknown>> | undefined) || []).map((row, index) => ({ category, row, id: `${category.key}:${index}` }))), [analysis]);
  async function applySelected() {
    const byKind: Partial<Record<Kind, Row[]>> = {};
    candidates.filter((candidate) => selected.has(candidate.id)).forEach(({ category, row, id }) => {
      const index = Number(id.split(":").at(-1)) || 0;
      (byKind[category.kind] ||= []).push(mapPhaseCandidate(current.id, category.kind, row, index, "human-reviewed"));
    });
    if (!Object.keys(byKind).length) return;
    await onApply(byKind); setSelected(new Set()); setNotice(`Marked ${Object.values(byKind).reduce((sum, rows) => sum + (rows?.length || 0), 0)} selected item(s) as reviewed and saved automatically. Verify dimensions, handing, scope, and hardware before ordering or production.`);
  }
  function toggle(id: string) { setSelected((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; }); }

  return <section className="panel doc-intake">
      {current && <div className="analysis-panel"><div className="panel-heading"><div><h3>AI page finding &amp; takeoff candidates</h3><p>Searches long PDFs for Division 08, door/hardware/wall schedules, and relevant drawings. AI results stay provisional until you review them.</p></div><div className="doc-analysis-actions"><button className="button secondary" disabled={busy} onClick={() => void openDocument()}><ExternalLink size={15}/>Open full PDF</button><button className="button" disabled={busy || !phaseId} onClick={() => void analyze()}>{busyAction === "analysis" ? <LoaderCircle size={16} className="document-spinner" aria-hidden="true"/> : <Sparkles size={16}/>} {busyAction === "analysis" ? "Finding pages & extracting…" : analysis ? "Analyze again" : "Find pages & extract"}</button></div></div>
        {busyAction === "analysis" && <p className="document-progress" role="status" aria-live="polite"><LoaderCircle size={16} className="document-spinner" aria-hidden="true"/> Checking the PDF pages and extracting draft rows for {phaseName}. Larger plan sets can take up to about two minutes.</p>}
        <label className="manual-page-selection">Include known PDF pages or ranges (optional)<input value={manualPageInput} onChange={(event) => setManualPageInput(event.target.value)} placeholder="e.g. 22, 45-49, 207-209"/><small>Useful for scanned pages or when you know where a schedule is. Up to 36 total pages are analyzed; PDFs with 10 pages or fewer are scanned in full, and longer files auto-select up to 10 pages.</small></label>
        {analysis && <>
          <p className="printing-note">Indexed {analysis.indexedPageCount || current.page_count || "?"} pages; visually analyzed {analysis.candidatePageCount ?? analysis.relevantPages?.length ?? 0}; {analysis.relevantPages?.length || 0} relevant pages detected; {analysis.scannedPageCount || 0} pages had no searchable text. PDF page numbering refers to the file’s page order.</p>
          {analysis.matchedDoorways && <p className="printing-note"><strong>Door scan:</strong> {analysis.matchedDoorways.length} doorway symbols detected across the analyzed sheets. Handing: {Object.entries(doorwayHandCounts).map(([hand, count]) => `${hand} ${count}`).join(" · ") || "not determined"}. Counts are plan-symbol detections; verify the marks and handings before use.</p>}
          {!!analysis.pageCoverage?.totalScannedPages && <p className="printing-note">Visual review screened {analysis.pageCoverage.visuallyReviewedScannedPages} of {analysis.pageCoverage.totalScannedPages} scanned pages{analysis.pageCoverage.unreviewedScannedPages ? `; ${analysis.pageCoverage.unreviewedScannedPages} scanned pages remain unscreened. Add their page numbers above and analyze again.` : "."}</p>}
          {!!analysis.relevantPages?.length && <div className="relevant-pages"><h4>Relevant page index</h4>{analysis.relevantPages.map((item, index) => <button key={`${item.page}:${index}`} className="page-citation" onClick={() => void openPage(item.page)}><strong>p. {item.page}</strong><span>{item.section}</span><small>{item.reason} · {Math.round(item.confidence * 100)}%</small><ExternalLink size={14}/></button>)}</div>}
          {!!analysis.matchedDoorways?.length && <div className="relevant-pages"><h4>Detected door symbols · matched to schedule</h4>{analysis.matchedDoorways.map((item, index) => <div className="spec-finding" key={`${item.sourcePage}:${item.mark}:${index}`}><span><strong>{item.mark ? `Door ${item.mark}` : "Unlabeled doorway"}</strong><small>Plan p. {item.sourcePage} · schedule {item.schedulePage ? `p. ${item.schedulePage}` : "unmatched"}{item.width || item.height ? ` · ${item.width || "?"} × ${item.height || "?"}` : ""} · ${Math.round(item.confidence * 100)}%</small><small>{item.hingeSide} hinge · swings ${item.swingDirection.replaceAll("_", " ")} · hand ${item.handing || "needs review"}</small>{item.handingEvidence && <small>Handing evidence: “{item.handingEvidence}”</small>}<small>Drawing evidence: “{item.evidence || "No symbol evidence supplied"}”</small>{item.scheduleEvidence && <small>Schedule evidence: “{item.scheduleEvidence}”</small>}{!!item.reviewReasons.length && <small>Review: {item.reviewReasons.join(" · ")}</small>}<small>Page region: {Math.round(item.boundingBox.x * 100)}%, {Math.round(item.boundingBox.y * 100)}%, {Math.round(item.boundingBox.width * 100)}% × {Math.round(item.boundingBox.height * 100)}%</small></span><button type="button" className="inline-link" onClick={() => void openPage(item.sourcePage)}>Open p. {item.sourcePage}</button></div>)}</div>}
          {!!analysis.unmatchedSchedule?.length && <p className="printing-note">{analysis.unmatchedSchedule.length} schedule row(s) did not match a detected floor-plan door mark. Review the schedule pages and plans.</p>}
          {!!analysis.doorwayDetectionConflicts && <p className="printing-note">{analysis.doorwayDetectionConflicts} overlapping doorway detections had different marks and were kept for review.</p>}
          {!!analysis.suppressedDuplicateDoorSymbols && <p className="printing-note">{analysis.suppressedDuplicateDoorSymbols} overlapping doorway detections were treated as duplicates. Review the cited plan pages.</p>}
          {!!analysis.uncertainties?.length && <ul className="uncertainty-list">{analysis.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul>}
          {!!analysis.specFindings?.length && <div className="spec-findings"><h4>Specification findings — review against your approved suppliers</h4>{analysis.specFindings.map((finding, index) => <div className="spec-finding" key={`${finding.sourcePage}:${index}`}><span><strong>{String(finding.subject || "Division 08 requirement")}</strong><small>{String(finding.requirement || "")}</small><small>Allowed: {(finding.allowedManufacturers as string[] || []).join(", ") || "Not extracted"} · Restricted: {(finding.restrictedManufacturers as string[] || []).join(", ") || "None identified"} · {finding.exclusive ? "exclusive / no substitution indicated" : "substitution language not marked exclusive"}</small><small>Evidence: “{String(finding.evidence || "") }” · {Math.round(Number(finding.confidence || 0) * 100)}%</small></span><button type="button" className="inline-link" onClick={() => void openPage(Number(finding.sourcePage || 1))}>Open p. {String(finding.sourcePage || "?")}</button></div>)}</div>}
          {candidates.map(({ category, row, id }) => <label className="candidate-row" key={id}><input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)}/><span><strong>{category.label}: {String(row.mark || row.code || row.group || row.component || row.name || "candidate")}</strong><small>p. {String(row.sourcePage || "?")} · {Math.round(Number(row.confidence || 0) * 100)}% · {String(row.evidence || "No evidence note supplied")}</small><small>{Object.entries(row).filter(([key, value]) => !["sourcePage", "evidence", "confidence"].includes(key) && value !== "" && value !== null && value !== undefined && !Array.isArray(value)).slice(0, 8).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</small><button type="button" className="inline-link" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void openPage(Number(row.sourcePage || 1)); }}>Open evidence p. {String(row.sourcePage || "?")}</button></span></label>)}
          {!!candidates.length && <button className="button" disabled={!selected.size || busy} onClick={() => void applySelected()}><Check size={16}/> Mark {selected.size || "selected"} items reviewed</button>}
          {!candidates.length && <p>No structured takeoff candidates were extracted. Use the page index and open the cited plan pages to review manually.</p>}
        </>}
      </div>}
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="success-note">{notice}</p>}
  </section>;
}
