"use client";
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { cleanupDeletedFiles, pendingDeletionFiles, type DeletionJob } from "@/lib/deletion";

export function DeleteTargetDialog({ name, phase, busy, error, onClose, onConfirm }: {
  name: string; phase: boolean; busy: boolean; error: string;
  onClose: () => void; onConfirm: (confirmation: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="editor split-editor" aria-labelledby="delete-target-title"
    onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); if (confirmation === name && !busy) onConfirm(confirmation); }}>
      <header><div><span className="eyebrow">PERMANENT DELETION</span>
        <h2 id="delete-target-title">Delete {phase ? "phase" : "project"}?</h2></div></header>
      <div className="duplicate-project-copy">
        <p><strong>{name}</strong> and {phase ? "its openings, production records and exclusive attached files" : "all of its phases, openings, production records and attached files"} will be permanently removed. This cannot be undone.</p>
        {phase && <p>Files inherited by another phase will be kept for that phase. Deleting the last phase leaves an empty project.</p>}
        <label>Type <strong>{name}</strong> to confirm
          <input aria-label="Confirm deletion name" autoComplete="off" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
      </div>
      <footer><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="button danger" disabled={busy || confirmation !== name}><Trash2 size={16} />{busy ? "Deleting…" : "Permanently delete"}</button></footer>
    </form>
  </dialog>;
}

export function DeletionCleanup({ revision }: { revision: number }) {
  const [jobs, setJobs] = useState<DeletionJob[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void pendingDeletionFiles().then((next) => {
      if (!cancelled) { setJobs(next); setError(""); }
    }).catch(() => {
      if (!cancelled) setError("Could not check pending file deletions.");
    });
    return () => { cancelled = true; };
  }, [revision]);
  if (!jobs.length && !error) return null;
  return <section className="notice" aria-label="Pending file cleanup">
    <div><strong>File cleanup</strong><p>{jobs.length ? `${jobs.length} deletion${jobs.length === 1 ? " has" : "s have"} files still waiting to be removed. Project and phase records have already been deleted.` : error}</p>
      {!!jobs.length && <p>{jobs.map((job) => job.target_name).join(", ")}</p>}
      {!!jobs.length && error && <p role="alert">{error}</p>}
      <button className="button secondary" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { const pending = await pendingDeletionFiles(); await cleanupDeletedFiles(pending); setJobs([]); }
        catch { setError("File cleanup could not finish. Please retry."); }
        finally { setBusy(false); }
      }}>{busy ? "Removing files…" : "Retry file cleanup"}</button>
    </div>
  </section>;
}
