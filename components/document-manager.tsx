"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, ExternalLink, Check, LoaderCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Kind, ProjectDocument, Row } from "@/lib/types";
import { mapAnalysisToPhaseRows, mapPhaseCandidate } from "@/lib/drawing-takeoff/phase-import";

type Analysis = {
  pipelineVersion?: string; serverImported?: boolean; extractionProgress?: { completed: number; failed: number; pending: number; total: number };
  scheduleSearch?: { completed?: boolean; schedules?: Array<{ kind: "hardware" | "door" | "frame"; pages: number[]; description: string; evidence: string; confidence: number }>; pages?: number[]; summary?: string };
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

export function DocumentManager({ projectId, phaseId, phaseName, document, onApply, onAnalyzed, onProgressSaved }: {
  projectId: string; phaseId: string; phaseName: string; document: ProjectDocument;
  onApply: (rows: Partial<Record<Kind, Row[]>>, onlyIfEmpty?: boolean) => boolean | void | Promise<boolean | void>;
  onProgressSaved?: () => Promise<void>;
  onAnalyzed: (analysis: Record<string, unknown>, description: string, status: ProjectDocument["status"]) => void;
}) {
  const current = document;
  const storedAnalysis = current.analysis as Analysis | null;
  const doorwayHandCounts = (storedAnalysis?.matchedDoorways || []).reduce<Record<string, number>>((counts, doorway) => {
    const hand = ["LH", "RH", "LHR", "RHR"].includes(doorway.handing) ? doorway.handing : "Needs review";
    counts[hand] = (counts[hand] || 0) + 1;
    return counts;
  }, {});
  const [job, setJob] = useState<{ id: string; status: string; updated_at: string; analysis: Analysis | null; description: string; error?: string; progress?: { message?: string } } | null>(null);
  const analysis = job?.analysis || storedAnalysis;
  const [categoryFilter, setCategoryFilter] = useState("openings");
  const [visibleCount, setVisibleCount] = useState(25);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [pollGeneration, setPollGeneration] = useState(0);
  const callbacks = useRef({ onAnalyzed, onProgressSaved });
  callbacks.current = { onAnalyzed, onProgressSaved };
  const [busyAction, setBusyAction] = useState<"analysis" | null>(null);
  const [activeStep, setActiveStep] = useState<"locate" | "extract" | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualPageInput, setManualPageInput] = useState("");
  const autoStarted = useRef(false);
  const recoveryImportStarted = useRef(false);
  const jobRunning = !!job && ["queued", "indexing", "locating", "extracting"].includes(job.status);
  const busy = busyAction !== null || jobRunning;
  const scheduleSearchComplete = analysis?.scheduleSearch?.completed === true && (!job || !["queued", "indexing", "locating"].includes(job.status));
  const extractionComplete = job ? job.status === "complete" : scheduleSearchComplete && current.status === "needs_review" && Array.isArray(analysis?.openings);

  const analyze = useCallback(async () => {
    if (!current) return;
    setBusyAction("analysis"); setActiveStep("locate"); setSelected(new Set()); setError(""); setNotice("");
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
      if (!response.ok) throw new Error(result.error || "Could not start analysis.");
      setJob(result.job); setPollGeneration(value => value + 1);
      setNotice("Analysis is saved and runs in the background. You can close this popup and return to its progress.");
    } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed."); }
    finally { setBusyAction(null); }
  }, [current.id, manualPageInput, phaseId, projectId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastUpdate = "";
    const poll = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const response = await fetch(`/api/documents/analyze?${new URLSearchParams({ documentId: current.id, projectId, phaseId })}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not read analysis progress.");
        if (cancelled) return;
        const next = result.job;
        setJob(next);
        if (next) {
          const running = ["queued", "indexing", "locating", "extracting"].includes(next.status);
          setActiveStep(running ? next.status === "extracting" ? "extract" : "locate" : null);
          if (next.updated_at !== lastUpdate) {
            lastUpdate = next.updated_at;
            if (next.analysis?.scheduleSearch) {
              callbacks.current.onAnalyzed(next.analysis, next.description || "", running ? "indexed" : "needs_review");
              if (next.analysis.serverImported) await callbacks.current.onProgressSaved?.();
            }
            setNotice(next.progress?.message || "");
            setError(next.error || (next.status === "partial" ? "Some sections remain incomplete. Resume to process them; saved results are retained." : ""));
          }
          if (!running) return;
        } else return;
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Could not refresh progress."); }
      if (!cancelled) timer = setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [current.id, projectId, phaseId, pollGeneration]);

  useEffect(() => {
    if (current.status !== "uploaded" || autoStarted.current) return;
    autoStarted.current = true;
    void analyze();
  }, [analyze, current.status]);

  useEffect(() => {
    if ((current.analysis as Analysis)?.pipelineVersion || !current.analysis || !(current.analysis as Analysis).scheduleSearch?.completed || recoveryImportStarted.current) return;
    recoveryImportStarted.current = true;
    const rows = mapAnalysisToPhaseRows(current.id, current.analysis);
    if (Object.values(rows).some((items) => items?.length)) {
      void (async () => {
        try {
          const imported = await onApply(rows, true);
          setNotice(imported === false
            ? `This phase already has data in at least one takeoff tab. Saved extraction candidates were left for review and were not added.`
            : `Saved the existing extraction as AI draft rows in ${phaseName}. Review them in the phase tabs.`);
        }
        catch (e) { setError(e instanceof Error ? e.message : "Could not add the saved extraction to this phase."); }
      })();
    }
  }, [current.analysis, current.id, onApply, phaseName]);
  async function stopAnalysis() {
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/documents/analyze", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` }, body: JSON.stringify({ documentId: current.id, projectId, phaseId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not stop extraction.");
      setPollGeneration(value => value + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not stop extraction."); }
  }
  async function openPage(page: number) {
    if (!current) return;
    const { data, error: linkError } = await supabase.storage.from("project-documents").createSignedUrl(current.storage_path, 300);
    if (linkError || !data?.signedUrl) { setError(linkError?.message || "Could not open PDF."); return; }
    window.open(`${data.signedUrl}#page=${page}`, "_blank", "noopener,noreferrer");
  }
  async function openDocument() { await openPage(1); }
  const candidates = useMemo(() => categories.flatMap((category) => ((analysis?.[category.key] as Array<Record<string, unknown>> | undefined) || []).map((row, index) => ({ category, row, id: `${category.key}:${index}` }))), [analysis]);
  const filteredCandidates = candidates.filter(candidate => candidate.category.key === categoryFilter &&
    (!candidateQuery.trim() || JSON.stringify(candidate.row).toLowerCase().includes(candidateQuery.trim().toLowerCase())));
  const extractionProgress = analysis?.extractionProgress;
  const percent = extractionProgress?.total ? Math.round(extractionProgress.completed / extractionProgress.total * 100) : 0;
  async function applySelected() {
    const byKind: Partial<Record<Kind, Row[]>> = {};
    candidates.filter((candidate) => selected.has(candidate.id)).forEach(({ category, row, id }) => {
      const index = Number(id.split(":").at(-1)) || 0;
      (byKind[category.kind] ||= []).push(mapPhaseCandidate(current.id, category.kind, row, index, "human-reviewed"));
    });
    if (!Object.keys(byKind).length) return;
    try { await onApply(byKind); } catch (e) { setError(e instanceof Error ? e.message : "Could not save the selected items."); return; }
    setSelected(new Set()); setNotice(`Marked ${Object.values(byKind).reduce((sum, rows) => sum + (rows?.length || 0), 0)} selected item(s) as reviewed and saved automatically. Verify dimensions, handing, scope, and hardware before ordering or production.`);
  }
  function toggle(id: string) { setSelected((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; }); }

  return <section className="panel doc-intake">
      {current && <div className="analysis-panel"><div className="panel-heading"><div><h3>Extract schedules &amp; door information</h3><p>Find schedule pages, read each opening, and save draft results to your phase. You can close this window while processing continues.</p></div><div className="doc-analysis-actions"><button className="button secondary" onClick={() => void openDocument()}><ExternalLink size={15}/>Open full PDF</button><button className="button" disabled={busy || !phaseId} onClick={() => void analyze()}>{busy ? <LoaderCircle size={16} className="document-spinner" aria-hidden="true"/> : <Sparkles size={16}/>} {busy ? activeStep === "locate" ? "Finding schedule pages…" : "Extracting phase data…" : job && ["partial", "failed"].includes(job.status) ? "Resume incomplete sections" : analysis ? "Analyze again" : "Find pages & extract"}</button></div></div>
        <ol className="document-analysis-steps" aria-label="Document analysis progress" aria-live="polite">
          <li className={`${activeStep === "locate" ? "is-running" : scheduleSearchComplete ? "is-complete" : ""}`}>
            <span className="document-step-icon">{activeStep === "locate" ? <LoaderCircle size={16} className="document-spinner"/> : scheduleSearchComplete ? <Check size={16} className="document-check"/> : <span>1</span>}</span>
            <span><strong>Find hardware, door, and frame schedules</strong><small>{activeStep === "locate" ? "Searching page text and drawings…" : scheduleSearchComplete ? current.description || analysis?.scheduleSearch?.summary || "Schedule search completed." : "Waiting to search the PDF"}</small></span>
          </li>
          <li className={`${activeStep === "extract" ? "is-running" : extractionComplete ? "is-complete" : ""}`}>
            <span className="document-step-icon">{activeStep === "extract" ? <LoaderCircle size={16} className="document-spinner"/> : extractionComplete ? <Check size={16} className="document-check"/> : <span>2</span>}</span>
            <span><strong>Extract phase information</strong><small>{activeStep === "extract" ? `Reading schedules and relevant drawings for ${phaseName}…` : extractionComplete ? "Phase extraction completed." : scheduleSearchComplete ? "Schedule search is complete; extraction will start next." : "Starts after schedule pages are found"}</small></span>
          </li>
        </ol>
        {job && <div className={`extraction-status ${job.status === "partial" || job.status === "failed" ? "needs-attention" : ""}`} role="status">
          <strong>{busy ? "Processing in background" : job.status === "complete" ? "Extraction finished · ready to review" : "Saved results · some sections need attention"}</strong>
          {extractionProgress && <><progress max={extractionProgress.total || 1} value={extractionProgress.completed} aria-label="Extraction sections completed"/><small>{extractionProgress.completed} of {extractionProgress.total} sections complete{extractionProgress.failed ? ` · ${extractionProgress.failed} need retrying` : ""} · {percent}%</small></>}
          <p>{job.progress?.message || notice}</p>{jobRunning && <button type="button" className="inline-link" onClick={() => void stopAnalysis()}>Stop extraction and keep saved results</button>}
        </div>}
        {scheduleSearchComplete && !!analysis?.scheduleSearch?.schedules?.length && <div className="schedule-search-results"><strong>Schedule pages found</strong>{analysis.scheduleSearch.schedules.map((schedule) => <p key={schedule.kind}><span>{schedule.kind === "door" ? "Door / opening" : schedule.kind[0].toUpperCase() + schedule.kind.slice(1)} schedule:</span> {schedule.pages.map((page, index) => <span key={page}>{index > 0 ? ", " : ""}<button type="button" className="inline-link" onClick={() => void openPage(page)}>p. {page}</button></span>)}{schedule.description ? ` · ${schedule.description}` : ""}{schedule.evidence ? <small className="schedule-search-evidence">Evidence: “{schedule.evidence}”</small> : null}</p>)}</div>}
        {busy && <p className="document-progress" role="status" aria-live="polite"><LoaderCircle size={16} className="document-spinner" aria-hidden="true"/> {activeStep === "locate" ? "Searching for schedule pages. Phase extraction will wait until this step is saved." : `Schedule search is complete. Now extracting draft rows for ${phaseName}.`}</p>}
        <details className="extraction-options"><summary>Help locate specific pages</summary><label className="manual-page-selection">Include known PDF pages or ranges (optional)<input disabled={busy} value={manualPageInput} onChange={(event) => setManualPageInput(event.target.value)} placeholder="e.g. 22, 45-49, 207-209"/><small>Every page is indexed. Relevant schedules are processed in smaller sections and floor plans in overlapping image regions. You can identify up to 36 pages to help locate unclear content.</small></label></details>
        {analysis && <>
          <p className="printing-note">Indexed {analysis.indexedPageCount || current.page_count || "?"} pages; selected {analysis.candidatePageCount ?? analysis.relevantPages?.length ?? 0} relevant pages; {analysis.relevantPages?.length || 0} relevant pages detected; {analysis.scannedPageCount || 0} pages had no searchable text. PDF page numbering refers to the file’s page order.</p>
          {analysis.matchedDoorways && <p className="printing-note"><strong>Door scan:</strong> {analysis.matchedDoorways.length} doorway symbols detected across the analyzed sheets. Handing: {Object.entries(doorwayHandCounts).map(([hand, count]) => `${hand} ${count}`).join(" · ") || "not determined"}. Counts are plan-symbol detections; verify the marks and handings before use.</p>}
          {!!analysis.pageCoverage?.totalScannedPages && <p className="printing-note">Visual review screened {analysis.pageCoverage.visuallyReviewedScannedPages} of {analysis.pageCoverage.totalScannedPages} scanned pages{analysis.pageCoverage.unreviewedScannedPages ? `; ${analysis.pageCoverage.unreviewedScannedPages} scanned pages remain unscreened. Add their page numbers above and analyze again.` : "."}</p>}
          {!!analysis.relevantPages?.length && <div className="relevant-pages"><h4>Relevant page index</h4>{analysis.relevantPages.map((item, index) => <button key={`${item.page}:${index}`} className="page-citation" onClick={() => void openPage(item.page)}><strong>p. {item.page}</strong><span>{item.section}</span><small>{item.reason} · {Math.round(item.confidence * 100)}%</small><ExternalLink size={14}/></button>)}</div>}
          {!!analysis.matchedDoorways?.length && <div className="relevant-pages"><h4>Detected door symbols · matched to schedule</h4>{analysis.matchedDoorways.map((item, index) => <div className="spec-finding" key={`${item.sourcePage}:${item.mark}:${index}`}><span><strong>{item.mark ? `Door ${item.mark}` : "Unlabeled doorway"}</strong><small>Plan p. {item.sourcePage} · schedule {item.schedulePage ? `p. ${item.schedulePage}` : "unmatched"}{item.width || item.height ? ` · ${item.width || "?"} × ${item.height || "?"}` : ""} · ${Math.round(item.confidence * 100)}%</small><small>{item.hingeSide} hinge · swings ${item.swingDirection.replaceAll("_", " ")} · hand ${item.handing || "needs review"}</small>{item.handingEvidence && <small>Handing evidence: “{item.handingEvidence}”</small>}<small>Drawing evidence: “{item.evidence || "No symbol evidence supplied"}”</small>{item.scheduleEvidence && <small>Schedule evidence: “{item.scheduleEvidence}”</small>}{!!item.reviewReasons.length && <small>Review: {item.reviewReasons.join(" · ")}</small>}<small>Page region: {Math.round(item.boundingBox.x * 100)}%, {Math.round(item.boundingBox.y * 100)}%, {Math.round(item.boundingBox.width * 100)}% × {Math.round(item.boundingBox.height * 100)}%</small></span><button type="button" className="inline-link" onClick={() => void openPage(item.sourcePage)}>Open p. {item.sourcePage}</button></div>)}</div>}
          {!!analysis.unmatchedSchedule?.length && <p className="printing-note">{analysis.unmatchedSchedule.length} schedule row(s) did not match a detected floor-plan door mark. Review the schedule pages and plans.</p>}
          {!!analysis.doorwayDetectionConflicts && <p className="printing-note">{analysis.doorwayDetectionConflicts} overlapping doorway detections had different marks and were kept for review.</p>}
          {!!analysis.suppressedDuplicateDoorSymbols && <p className="printing-note">{analysis.suppressedDuplicateDoorSymbols} overlapping doorway detections were treated as duplicates. Review the cited plan pages.</p>}
          {!!analysis.uncertainties?.length && <ul className="uncertainty-list">{analysis.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul>}
          {!!analysis.specFindings?.length && <div className="spec-findings"><h4>Specification findings — review against your approved suppliers</h4>{analysis.specFindings.map((finding, index) => <div className="spec-finding" key={`${finding.sourcePage}:${index}`}><span><strong>{String(finding.subject || "Division 08 requirement")}</strong><small>{String(finding.requirement || "")}</small><small>Allowed: {(finding.allowedManufacturers as string[] || []).join(", ") || "Not extracted"} · Restricted: {(finding.restrictedManufacturers as string[] || []).join(", ") || "None identified"} · {finding.exclusive ? "exclusive / no substitution indicated" : "substitution language not marked exclusive"}</small><small>Evidence: “{String(finding.evidence || "") }” · {Math.round(Number(finding.confidence || 0) * 100)}%</small></span><button type="button" className="inline-link" onClick={() => void openPage(Number(finding.sourcePage || 1))}>Open p. {String(finding.sourcePage || "?")}</button></div>)}</div>}
          {!!candidates.length && <div className="extraction-review">
          <h4>Review extracted information</h4><p>Results are drafts. Check missing details against the cited page before approving.</p>
          <div className="extraction-category-tabs" role="group" aria-label="Extraction categories">{categories.map(category => <button type="button" key={category.key} aria-pressed={categoryFilter === category.key} onClick={() => { setCategoryFilter(category.key); setVisibleCount(25); }}>
            {category.label}<span>{((analysis?.[category.key] as unknown[]) || []).length}</span></button>)}</div>
          <input aria-label="Search extraction results" placeholder="Search marks, parts, or descriptions…" value={candidateQuery} onChange={event => { setCandidateQuery(event.target.value); setVisibleCount(25); }}/>
          <small>{filteredCandidates.length} results · {selected.size} selected</small><button type="button" className="button secondary" disabled={busy || !filteredCandidates.length} onClick={() => setSelected(previous => new Set([...previous, ...filteredCandidates.slice(0, visibleCount).map(candidate => candidate.id)]))}>Select shown results</button>
        </div>}
        {filteredCandidates.slice(0, visibleCount).map(({ category, row, id }) => <div className="candidate-row extraction-candidate" key={id}>
          <label><input type="checkbox" checked={selected.has(id)} disabled={busy} onChange={() => toggle(id)}/><span>
            <strong>{String(row.mark || row.code || row.group || row.component || row.name || "Candidate")}</strong>
            <small>{category.label} · PDF p. {String(row.sourcePage || "?")}{row.sourceBuilding ? ` · ${row.sourceBuilding}` : ""} · AI draft</small>
            <small>{Object.entries(row).filter(([key, value]) => !["sourcePage", "sourceBuilding", "evidence", "confidence", "mark", "code", "handingEvidence"].includes(key) && value !== "" && value !== null && value !== undefined && !Array.isArray(value)).slice(0, 7).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</small>
          </span></label>
          <details><summary>Source evidence</summary><p>{String(row.evidence || "No evidence supplied. Check the cited page.")}</p>{!!row.handingEvidence && <p>{String(row.handingEvidence)}</p>}</details>
          <button type="button" className="inline-link" onClick={() => void openPage(Number(row.sourcePage || 1))}>Open p. {String(row.sourcePage || "?")} <ExternalLink size={12}/></button>
        </div>)}
          {filteredCandidates.length > visibleCount && <button type="button" className="button secondary" onClick={() => setVisibleCount(count => count + 25)}>Show 25 more results</button>}
          {!!candidates.length && <button className="button" disabled={!selected.size || busy} onClick={() => void applySelected()}><Check size={16}/> Mark {selected.size || "selected"} items reviewed</button>}
          {!candidates.length && !busy && <p>No structured takeoff candidates were extracted. Use the page index and open the cited plan pages to review manually.</p>}
        </>}
      </div>}
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="success-note">{notice}</p>}
  </section>;
}
