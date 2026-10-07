"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Upload, Sparkles, ExternalLink, Check, RefreshCw, LoaderCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Kind, ProjectDocument, Row } from "@/lib/types";

type Analysis = {
  relevantPages?: Array<{ page: number; section: string; reason: string; confidence: number }>;
  walls?: Array<Record<string, unknown>>; doorTypes?: Array<Record<string, unknown>>;
  openings?: Array<Record<string, unknown>>; hardwareGroups?: Array<Record<string, unknown>>;
  specFindings?: Array<Record<string, unknown>>; uncertainties?: string[];
  indexedPageCount?: number; scannedPageCount?: number;
};
const categories: Array<{ key: keyof Analysis; label: string; kind: Kind }> = [
  { key: "openings", label: "Openings", kind: "openings" },
  { key: "walls", label: "Wall types", kind: "walls" },
  { key: "doorTypes", label: "Door types", kind: "doorTypes" },
  { key: "hardwareGroups", label: "Hardware components", kind: "hardware" },
];

export function DocumentManager({ projectId, phaseId, phaseAliases, phaseName, demo, onApply }: {
  projectId: string; phaseId: string; phaseAliases: string[]; phaseName: string; demo: boolean;
  onApply: (rows: Partial<Record<Kind, Row[]>>) => void;
}) {
  const [docs, setDocs] = useState<ProjectDocument[]>([]), [file, setFile] = useState<File | null>(null),
    [docType, setDocType] = useState("plan_set"), [revision, setRevision] = useState(""),
    [busyAction, setBusyAction] = useState<"upload" | "analysis" | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""),
    [selectedDoc, setSelectedDoc] = useState(""), [selected, setSelected] = useState<Set<string>>(new Set()),
    [manualPageInput, setManualPageInput] = useState("");
  const current = docs.find((doc) => doc.id === selectedDoc);
  const analysis = current?.analysis as Analysis | null;
  const busy = busyAction !== null;

  const refresh = useCallback(async () => {
    if (demo) return;
    const { data, error: queryError } = await supabase.from("project_documents").select("*").eq("project_id", projectId).in("phase_id", phaseAliases).order("created_at", { ascending: false });
    if (queryError) setError(queryError.message); else {
      const rows = (data || []) as ProjectDocument[]; setDocs(rows);
      if (!selectedDoc && rows[0]) setSelectedDoc(rows[0].id);
    }
  }, [demo, projectId, phaseAliases, selectedDoc]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function upload() {
    if (!file) return;
    setBusyAction("upload"); setError(""); setNotice("");
    try {
      if (file.type !== "application/pdf" || file.size > 100 * 1024 * 1024) throw new Error("Choose a PDF under 100 MB.");
      const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
      if (!header.includes("%PDF-")) throw new Error("This file does not contain a PDF header. Choose the original PDF and try again.");
      const id = crypto.randomUUID();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${projectId}/${phaseId}/${id}/${safeName}`;
      const { error: uploadError } = await supabase.storage.from("project-documents").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
      const { error: rowError } = await supabase.from("project_documents").insert({ id, project_id: projectId, phase_id: phaseId, file_name: file.name, storage_path: path, document_type: docType, revision_label: revision, status: "uploaded" });
      if (rowError) {
        await supabase.storage.from("project-documents").remove([path]);
        throw rowError;
      }
      setFile(null); setRevision(""); setNotice("PDF uploaded to this phase."); setSelectedDoc(id); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusyAction(null); }
  }
  async function analyze() {
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
      setNotice("Extraction finished. Review every item and page citation before adding anything to the phase."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed."); }
    finally { setBusyAction(null); }
  }
  async function openPage(page: number) {
    if (!current) return;
    const { data, error: linkError } = await supabase.storage.from("project-documents").createSignedUrl(current.storage_path, 300);
    if (linkError || !data?.signedUrl) { setError(linkError?.message || "Could not open PDF."); return; }
    window.open(`${data.signedUrl}#page=${page}`, "_blank", "noopener,noreferrer");
  }
  async function openDocument() { await openPage(1); }
  const candidates = useMemo(() => categories.flatMap((category) => ((analysis?.[category.key] as Array<Record<string, unknown>> | undefined) || []).map((row, index) => ({ category, row, id: `${category.key}:${index}` }))), [analysis]);
  function applySelected() {
    const byKind: Partial<Record<Kind, Row[]>> = {};
    candidates.filter((candidate) => selected.has(candidate.id)).forEach(({ category, row }) => {
      const stamp = { sourceDocumentId: current?.id || "", sourcePage: Number(row.sourcePage || 1), sourceEvidence: String(row.evidence || ""), extractionConfidence: Number(row.confidence || 0), reviewState: "human-reviewed" };
      let mapped: Row;
      if (category.kind === "openings") mapped = { ...row, ...stamp, id: crypto.randomUUID(), name: String(row.mark || ""), wall: String(row.wallType || ""), doorType: String(row.doorType || ""), group: String(row.hardwareGroup || ""), qty: String(row.quantity || "") } as Row;
      else if (category.kind === "walls") mapped = { ...row, ...stamp, id: crypto.randomUUID(), name: String(row.code || ""), size: String(row.finishedThickness || "") } as Row;
      else if (category.kind === "doorTypes") mapped = { ...row, ...stamp, id: crypto.randomUUID(), name: String(row.code || ""), brand: String(row.manufacturer || ""), material: String(row.material || ""), window: String(row.windowOrLouver || ""), fire: String(row.fireRating || "") } as Row;
      else mapped = { ...row, ...stamp, id: crypto.randomUUID(), group: String(row.group || ""), component: String(row.component || row.name || ""), qty: Number(row.quantity || 0), frameMod: String(row.frameModification || ""), doorMod: String(row.doorModification || ""), doorPrep: String(row.doorPrep || "") } as Row;
      (byKind[category.kind] ||= []).push(mapped);
    });
    if (!Object.keys(byKind).length) return;
    onApply(byKind); setSelected(new Set()); setNotice(`Added ${Object.values(byKind).reduce((sum, rows) => sum + (rows?.length || 0), 0)} reviewed candidate(s). Verify dimensions, handing, scope, and hardware before issuing takeoff.`);
  }
  function toggle(id: string) { setSelected((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; }); }

  return <section className="panel doc-intake">
    <div className="panel-heading"><div><h2>Plans &amp; specifications</h2><p>Upload plan sets, specs, addenda, and revised construction sets to this project phase.</p></div><button className="button secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15}/> Refresh</button></div>
    {demo && <p className="printing-note">PDF upload and AI review are available after signing in to the connected workspace.</p>}
    {!demo && <>
      <div className="doc-upload-row">
        <label className="doc-file">PDF file<input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)}/></label>
        <label>Document kind<select value={docType} onChange={(event) => setDocType(event.target.value)}><option value="plan_set">Plan set</option><option value="specification">Specifications</option><option value="addendum">Addendum</option><option value="construction_set">Construction set</option><option value="other">Other</option></select></label>
        <label>Revision / issue<input value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="e.g. Rev 2 · 2026-10-06"/></label>
        <button className="button" disabled={!file || busy} onClick={() => void upload()}>{busyAction === "upload" ? <LoaderCircle size={16} className="document-spinner" aria-hidden="true"/> : <Upload size={16}/>} {busyAction === "upload" ? "Uploading PDF…" : "Upload PDF"}</button>
      </div>
      {busyAction === "upload" && <p className="document-progress" role="status" aria-live="polite"><LoaderCircle size={16} className="document-spinner" aria-hidden="true"/> Uploading the PDF and saving it to this phase…</p>}
      <div className="doc-list">{docs.map((doc) => <button key={doc.id} className={`doc-list-item ${doc.id === selectedDoc ? "selected" : ""}`} onClick={() => { setSelectedDoc(doc.id); setSelected(new Set()); }}><FileText size={18}/><span><strong>{doc.file_name}</strong><small>{doc.document_type.replaceAll("_", " ")} · {doc.revision_label || "No revision"} · {doc.page_count ? `${doc.page_count} pages · ` : ""}{doc.status.replaceAll("_", " ")}</small></span></button>)}{!docs.length && <p className="empty-inline">No PDFs uploaded to {phaseName} yet.</p>}</div>
      {current && <div className="analysis-panel"><div className="panel-heading"><div><h3>AI page finding &amp; takeoff candidates</h3><p>Searches long PDFs for Division 08, door/hardware/wall schedules, and relevant drawings. AI results stay provisional until you review them.</p></div><div className="doc-analysis-actions"><button className="button secondary" disabled={busy} onClick={() => void openDocument()}><ExternalLink size={15}/>Open full PDF</button><button className="button" disabled={busy} onClick={() => void analyze()}>{busyAction === "analysis" ? <LoaderCircle size={16} className="document-spinner" aria-hidden="true"/> : <Sparkles size={16}/>} {busyAction === "analysis" ? "Finding pages & extracting…" : analysis ? "Analyze again" : "Find pages & extract"}</button></div></div>
        {busyAction === "analysis" && <p className="document-progress" role="status" aria-live="polite"><LoaderCircle size={16} className="document-spinner" aria-hidden="true"/> Checking the PDF pages and extracting schedule candidates. Larger plan sets can take up to about two minutes.</p>}
        <label className="manual-page-selection">Include known PDF pages or ranges (optional)<input value={manualPageInput} onChange={(event) => setManualPageInput(event.target.value)} placeholder="e.g. 22, 45-49, 207-209"/><small>Useful for scanned pages or when you already know where a schedule is. Up to 36 manually selected pages are sent alongside the highest-ranked text matches.</small></label>
        {analysis && <>
          <p className="printing-note">Indexed {analysis.indexedPageCount || current.page_count || "?"} pages; {analysis.relevantPages?.length || 0} relevant pages detected; {analysis.scannedPageCount || 0} pages had no searchable text. PDF page numbering refers to the file’s page order.</p>
          {!!analysis.relevantPages?.length && <div className="relevant-pages"><h4>Relevant page index</h4>{analysis.relevantPages.map((item, index) => <button key={`${item.page}:${index}`} className="page-citation" onClick={() => void openPage(item.page)}><strong>p. {item.page}</strong><span>{item.section}</span><small>{item.reason} · {Math.round(item.confidence * 100)}%</small><ExternalLink size={14}/></button>)}</div>}
          {!!analysis.uncertainties?.length && <ul className="uncertainty-list">{analysis.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul>}
          {!!analysis.specFindings?.length && <div className="spec-findings"><h4>Specification findings — review against your approved suppliers</h4>{analysis.specFindings.map((finding, index) => <div className="spec-finding" key={`${finding.sourcePage}:${index}`}><span><strong>{String(finding.subject || "Division 08 requirement")}</strong><small>{String(finding.requirement || "")}</small><small>Allowed: {(finding.allowedManufacturers as string[] || []).join(", ") || "Not extracted"} · Restricted: {(finding.restrictedManufacturers as string[] || []).join(", ") || "None identified"} · {finding.exclusive ? "exclusive / no substitution indicated" : "substitution language not marked exclusive"}</small><small>Evidence: “{String(finding.evidence || "") }” · {Math.round(Number(finding.confidence || 0) * 100)}%</small></span><button type="button" className="inline-link" onClick={() => void openPage(Number(finding.sourcePage || 1))}>Open p. {String(finding.sourcePage || "?")}</button></div>)}</div>}
          {candidates.map(({ category, row, id }) => <label className="candidate-row" key={id}><input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)}/><span><strong>{category.label}: {String(row.mark || row.code || row.group || row.component || row.name || "candidate")}</strong><small>p. {String(row.sourcePage || "?")} · {Math.round(Number(row.confidence || 0) * 100)}% · {String(row.evidence || "No evidence note supplied")}</small><small>{Object.entries(row).filter(([key, value]) => !["sourcePage", "evidence", "confidence"].includes(key) && value !== "" && value !== null && value !== undefined && !Array.isArray(value)).slice(0, 8).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</small><button type="button" className="inline-link" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void openPage(Number(row.sourcePage || 1)); }}>Open evidence p. {String(row.sourcePage || "?")}</button></span></label>)}
          {!!candidates.length && <button className="button" disabled={!selected.size} onClick={applySelected}><Check size={16}/> Add {selected.size || "selected"} reviewed candidates to {phaseName}</button>}
          {!candidates.length && <p>No structured takeoff candidates were extracted. Use the page index and open the cited plan pages to review manually.</p>}
        </>}
      </div>}
    </>}
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="success-note">{notice}</p>}
  </section>;
}
