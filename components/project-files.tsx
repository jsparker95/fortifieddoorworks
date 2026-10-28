"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileText, LoaderCircle, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { projectFileSizeError, RESUMABLE_UPLOAD_THRESHOLD, uploadLargeProjectFile } from "@/lib/project-file-upload";
import { ProjectFileDialog } from "./project-file-dialog";
import type { Kind, Row, ProjectPhase, ProjectDocument } from "@/lib/types";

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  txt: "text/plain",
};
const ALLOWED_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));

export function ProjectFiles({ projectId, demo, phases, activePhaseId, onApply, onProgressSaved }: {
  projectId: string; demo: boolean; phases: ProjectPhase[]; activePhaseId: string;
  onProgressSaved?: () => Promise<void>;
  onApply: (phaseId: string, rows: Partial<Record<Kind, Row[]>>, onlyIfEmpty?: boolean) => boolean | void | Promise<boolean | void>;
}) {
  const [selectedDocument, setSelectedDocument] = useState<ProjectDocument | null>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [starting, setStarting] = useState(false);
  const [jobStates, setJobStates] = useState<Record<string, { status: string; progress?: { message?: string } }>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (demo) return;
    const [files, jobs] = await Promise.all([
      supabase.from("project_documents").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("document_extraction_jobs").select("document_id,status,progress").eq("project_id", projectId).order("created_at", { ascending: false }).limit(100),
    ]);
    if (files.error) setError(files.error.message);
    else setDocuments((files.data || []) as ProjectDocument[]);
    if (!jobs.error) {
      const latest: Record<string, { status: string; progress?: { message?: string } }> = {};
      for (const job of jobs.data || []) latest[job.document_id] ||= job;
      setJobStates(latest);
    }
  }, [demo, projectId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const hasActiveJobs = Object.values(jobStates).some(job => ["queued", "indexing", "locating", "extracting"].includes(job.status));
  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = setInterval(() => void refresh(), 8000);
    return () => clearInterval(timer);
  }, [hasActiveJobs, refresh]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setNotice("");
    const sizeError = projectFileSizeError(file.size);
    if (sizeError) {
      setError(sizeError);
      return;
    }
    const mimeType = file.type || MIME_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() || ""];
    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      setError("Choose a PDF, Word or Excel file, JPG/PNG image, or plain text file.");
      return;
    }
    setBusy(true);
    setUploadPercent(0);
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${projectId}/project/${id}/${safeName}`;
    try {
      if (file.size > RESUMABLE_UPLOAD_THRESHOLD) {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) throw new Error("Sign in before uploading files.");
        await uploadLargeProjectFile(new File([file], file.name, { type: mimeType }), path, session.session.access_token, setUploadPercent);
      } else {
        const { error: uploadError } = await supabase.storage.from("project-documents")
          .upload(path, file, { contentType: mimeType, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { data: row, error: rowError } = await supabase.from("project_documents").insert({
        id,
        project_id: projectId,
        phase_id: activePhaseId || null,
        file_name: file.name,
        storage_path: path,
        document_type: "project_file",
        revision_label: "",
        status: "uploaded",
      }).select("*").single();
      if (rowError) {
        await supabase.storage.from("project-documents").remove([path]);
        throw rowError;
      }
      setNotice(file.name.toLowerCase().endsWith(".pdf") && activePhaseId ? "PDF uploaded. Extracting draft takeoff data for the active phase…" : "File added to project.");
      if (row && file.name.toLowerCase().endsWith(".pdf") && activePhaseId) {
        setStarting(true);
        try {
        const { data: session } = await supabase.auth.getSession();
        const started = await fetch("/api/documents/analyze", { method: "POST", keepalive: true,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session?.access_token || ""}` },
          body: JSON.stringify({ documentId: row.id, projectId, phaseId: activePhaseId, manualPages: [] }) });
        if (!started.ok) {
          const failure = await started.json();
          setNotice(`PDF uploaded. Automatic extraction could not start: ${failure.error || "Open the file to retry."}`);
        }
        } catch { setNotice("PDF uploaded. Open the file to start or reconnect to extraction."); }
      }
      await refresh();
      if (row && file.name.toLowerCase().endsWith(".pdf")) setSelectedDocument(row as ProjectDocument);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusy(false); setStarting(false);
    }
  }

  return (
    <section className="panel project-files-panel">
      <div className="project-files-heading">
        <span className="project-files-icon"><FileText size={19} /></span>
        <div><h2>Files</h2><p>Plans, contracts, and other shared files.</p></div>
        {!demo && <label className={`project-files-add ${busy ? "is-busy" : ""}`}>
          {busy ? <LoaderCircle size={15} className="document-spinner" /> : <Upload size={15} />}
          <span>{busy ? starting ? "Starting extraction…" : "Uploading…" : "Upload File"}</span>
          <input type="file" disabled={busy} aria-label="Add a project file" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        </label>}
      </div>
      {demo ? (
        <p className="project-files-empty">Sign in to upload and manage project files.</p>
      ) : (
        <>
          {busy && <p className="project-file-uploading" role="status" aria-live="polite"><LoaderCircle size={14} className="document-spinner" /> {starting ? "File uploaded. Starting background extraction…" : `Uploading file… ${uploadPercent}% · Keep this page open until the upload finishes.`}</p>}
          {documents.length ? (
            <ul className="project-file-list">
              {documents.map((document) => (
                <li key={document.id}>
                  <button type="button" onClick={() => setSelectedDocument(document)}>
                    <FileText size={17} />
                    <span><strong>{document.file_name}</strong><small>{new Date(document.created_at).toLocaleDateString()} · {jobStates[document.id] ? ({ queued: "Queued", indexing: "Reading PDF", locating: "Finding schedule pages", extracting: "Extracting information", complete: "Ready to review", partial: "Some sections need attention", failed: "Extraction needs retrying" }[jobStates[document.id].status] || document.status) : document.status.replaceAll("_", " ")}
                      {jobStates[document.id] && ["queued", "indexing", "locating", "extracting"].includes(jobStates[document.id].status) && <LoaderCircle size={12} className="document-spinner" aria-label="Processing"/>}</small>{document.description && <small className="project-file-description">{document.description}</small>}</span>
                    <ExternalLink size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : !busy && <p className="project-files-empty">No files yet. Upload plans, contracts, or other shared project files.</p>}
        </>
      )}
      {selectedDocument && <ProjectFileDialog onProgressSaved={onProgressSaved} document={selectedDocument} phases={phases} activePhaseId={activePhaseId}
        onClose={() => { setSelectedDocument(null); void refresh(); }} onApply={onApply}
        onUpdated={(document) => { setSelectedDocument(document); setDocuments((rows) => rows.map((row) => row.id === document.id ? document : row)); }} />}
      {error && <p className="project-files-message is-error" role="alert">{error}</p>}
      {notice && <p className="project-files-message" role="status">{notice}</p>}
    </section>
  );
}
