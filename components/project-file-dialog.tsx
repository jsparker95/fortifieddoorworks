"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Kind, ProjectDocument, ProjectPhase, Row } from "@/lib/types";
import { DocumentManager } from "./document-manager";

export function ProjectFileDialog({ document, phases, activePhaseId, onClose, onUpdated, onApply }: {
  document: ProjectDocument; phases: ProjectPhase[]; activePhaseId: string;
  onClose: () => void; onUpdated: (document: ProjectDocument) => void;
  onApply: (phaseId: string, rows: Partial<Record<Kind, Row[]>>) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const latestDocument = useRef(document);
  useEffect(() => { latestDocument.current = document; }, [document]);
  const [name, setName] = useState(document.file_name);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [phaseId, setPhaseId] = useState(phases.some((phase) => phase.id === document.phase_id) ? document.phase_id! : activePhaseId);
  const phase = phases.find((item) => item.id === phaseId);
  const extension = document.storage_path.split(".").pop()?.toLowerCase();
  const previewable = ["pdf", "png", "jpg", "jpeg", "txt"].includes(extension || "");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    return () => { element?.close(); window.document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase.storage.from("project-documents").createSignedUrl(document.storage_path, 3600);
      if (!alive) return;
      if (error || !data?.signedUrl) setError(error?.message || "Could not load the preview.");
      else setUrl(data.signedUrl);
    }
    void load();
    const timer = window.setInterval(() => void load(), 45 * 60 * 1000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [document.storage_path]);

  async function rename() {
    const fileName = name.trim();
    if (!fileName || fileName.length > 255 || /[/\\]/.test(fileName)) {
      setError("Enter a file name of 1–255 characters without slashes."); return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const { data, error } = await supabase.from("project_documents").update({ file_name: fileName })
        .eq("id", document.id).eq("project_id", document.project_id).select("*").single();
      if (error) throw error;
      onUpdated(data as ProjectDocument); setName(fileName); setNotice("File name saved.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not rename this file."); }
    finally { setSaving(false); }
  }

  return <dialog ref={dialog} className="editor project-file-dialog" aria-labelledby="project-file-title" onCancel={onClose}>
    <header className="project-file-dialog-heading">
      <div><h2 id="project-file-title">File details</h2><p>{document.page_count ? `${document.page_count} pages · ` : ""}{document.status.replaceAll("_", " ")}</p></div>
      <button type="button" className="icon-button" aria-label="Close file details" onClick={onClose}><X size={20} /></button>
    </header>
    <form className="project-file-rename" onSubmit={(event) => { event.preventDefault(); void rename(); }}>
      <label>File name<input autoFocus value={name} maxLength={255} onChange={(event) => setName(event.target.value)} /></label>
      <button className="button secondary" disabled={saving || name.trim() === document.file_name}>{saving ? "Saving…" : "Save name"}</button>
      {url && <a className="button secondary" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open in new tab</a>}
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="success-note" role="status">{notice}</p>}
    <div className="project-file-preview">
      {!url ? <p>{error ? "Preview could not be loaded. Close and reopen this file to try again." : "Loading file preview…"}</p> : previewable ?
        <iframe title={`Preview of ${document.file_name}`} src={url} /> :
        <p>A preview is unavailable for this file format. Use Open in new tab to view or download it.</p>}
    </div>
    {extension === "pdf" && <>
      <label className="project-file-phase">Add reviewed results to phase
        <select value={phaseId} onChange={(event) => setPhaseId(event.target.value)}>
          {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
        </select>
      </label>
      {phase ? <DocumentManager key={document.id} projectId={document.project_id} phaseId={phase.id} phaseName={phase.name}
        document={document} onApply={(rows) => onApply(phase.id, rows)}
        onAnalyzed={(analysis) => onUpdated({ ...latestDocument.current, analysis, status: "needs_review", page_count: Number(analysis.indexedPageCount) || document.page_count })} /> :
        <p>Create a project phase before extracting openings.</p>}
    </>}
  </dialog>;
}
