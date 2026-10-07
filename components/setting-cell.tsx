"use client";

import { useEffect, useId, useRef, useState } from "react";

export default function SettingCell({
  value,
  label,
  required = false,
  multiline = false,
  onSave,
}: {
  value: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  onSave: (value: string) => Promise<string>;
}) {
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const saving = useRef(false);
  const cancelled = useRef(false);
  const statusId = useId();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function save() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (saving.current || draft === value) return;
    if (required && !draft.trim()) {
      setError("Value cannot be empty. Your change has not been saved.");
      return;
    }
    saving.current = true;
    setStatus("Saving…");
    setError("");
    try {
      const saved = await onSave(draft);
      setDraft(saved);
      setStatus("Saved");
    } catch (cause) {
      setStatus("");
      setError(`Not saved: ${cause instanceof Error ? cause.message : "Please try again."}`);
    } finally {
      saving.current = false;
    }
  }

  const props = {
    className: "setting-input",
    "aria-label": label,
    "aria-describedby": statusId,
    "aria-invalid": Boolean(error),
    value: draft,
    readOnly: status === "Saving…",
    placeholder: "—",
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(event.target.value);
      setStatus("");
      setError("");
    },
    onBlur: () => { void save(); },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelled.current = true;
        setDraft(value);
        setError("");
        setStatus("");
        event.currentTarget.blur();
      } else if (event.key === "Enter" && !event.nativeEvent.isComposing && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
  };

  return (
    <div className="setting-cell">
      {multiline ? <textarea {...props} rows={1} /> : <input {...props} aria-required={required} />}
      <span id={statusId} className={error ? "setting-save-error" : "setting-save-status"} role={error ? "alert" : "status"}>
        {error || status}
      </span>
      {error && <button type="button" className="setting-retry" onClick={() => { void save(); }}>Retry save</button>}
    </div>
  );
}
