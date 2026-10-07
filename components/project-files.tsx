"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileText, LoaderCircle, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ProjectDocument } from "@/lib/types";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
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

export function ProjectFiles({ projectId, demo }: { projectId: string; demo: boolean }) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (demo) return;
    const { data, error: queryError } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .is("phase_id", null)
      .order("created_at", { ascending: false });
    if (queryError) setError(queryError.message);
    else setDocuments((data || []) as ProjectDocument[]);
  }, [demo, projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setNotice("");
    if (file.size > MAX_FILE_SIZE) {
      setError("Choose a file smaller than 100 MB.");
      return;
    }
    const mimeType = file.type || MIME_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() || ""];
    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      setError("Choose a PDF, Word or Excel file, JPG/PNG image, or plain text file.");
      return;
    }
    setBusy(true);
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${projectId}/project/${id}/${safeName}`;
    try {
      const { error: uploadError } = await supabase.storage
        .from("project-documents")
        .upload(path, file, { contentType: mimeType, upsert: false });
      if (uploadError) throw uploadError;
      const { error: rowError } = await supabase.from("project_documents").insert({
        id,
        project_id: projectId,
        phase_id: null,
        file_name: file.name,
        storage_path: path,
        document_type: "project_file",
        revision_label: "",
        status: "uploaded",
      });
      if (rowError) {
        await supabase.storage.from("project-documents").remove([path]);
        throw rowError;
      }
      setNotice("File added to project.");
      await refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function open(document: ProjectDocument) {
    const { data, error: linkError } = await supabase.storage
      .from("project-documents")
      .createSignedUrl(document.storage_path, 300);
    if (linkError || !data?.signedUrl) {
      setError(linkError?.message || "Could not open this file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="panel project-files-panel">
      <div className="project-files-heading">
        <span className="project-files-icon"><FileText size={19} /></span>
        <div><h2>Project files</h2><p>Plans, contracts, and other shared files.</p></div>
      </div>
      {demo ? (
        <p className="project-files-empty">Sign in to upload and manage project files.</p>
      ) : (
        <>
          <label className={`project-file-upload ${busy ? "is-busy" : ""}`}>
            {busy ? <LoaderCircle size={18} className="document-spinner" /> : <Upload size={18} />}
            <span><strong>{busy ? "Uploading file…" : "Add a file"}</strong><small>PDF, Word, Excel, JPG/PNG, or text · up to 100 MB</small></span>
            <input type="file" disabled={busy} onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          </label>
          {documents.length ? (
            <ul className="project-file-list">
              {documents.map((document) => (
                <li key={document.id}>
                  <button type="button" onClick={() => void open(document)}>
                    <FileText size={17} />
                    <span><strong>{document.file_name}</strong><small>{new Date(document.created_at).toLocaleDateString()} · {document.status}</small></span>
                    <ExternalLink size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="project-files-empty">Your shared project files will appear here.</p>}
        </>
      )}
      {error && <p className="project-files-message is-error" role="alert">{error}</p>}
      {notice && <p className="project-files-message" role="status">{notice}</p>}
    </section>
  );
}
