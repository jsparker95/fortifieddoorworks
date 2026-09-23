"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Field } from "@/lib/fields";
import { Row } from "@/lib/types";
export function Editor({
  title,
  fields,
  initial,
  onSave,
  onClose,
  externalError,
  busy,
}: {
  title: string;
  fields: Field[];
  initial: Row;
  onSave: (row: Row) => void;
  onClose: () => void;
  externalError?: string;
  busy?: boolean;
}) {
  const [row, setRow] = useState(initial),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog ref={dialog} onCancel={onClose} className="editor">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (row.veSelected && (!row.veBrand || !row.veComponent)) {
            setError("Choose both an alternate brand and component.");
            return;
          }
          onSave(row);
        }}
      >
        <header>
          <div>
            <span className="eyebrow">WORKSPACE RECORD</span>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="form-grid">
          {fields.map((f) => (
            <label key={f.key} className={f.type === "textarea" ? "wide" : ""}>
              <span>
                {f.label}
                {f.required ? " *" : ""}
              </span>
              {f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={!!row[f.key]}
                  onChange={(e) =>
                    setRow({ ...row, [f.key]: e.target.checked })
                  }
                />
              ) : f.type === "textarea" ? (
                <textarea
                  value={String(row[f.key] || "")}
                  onChange={(e) => setRow({ ...row, [f.key]: e.target.value })}
                />
              ) : f.options ? (
                <>
                  <input
                    list={"opts-" + f.key}
                    value={String(row[f.key] ?? "")}
                    required={f.required}
                    onChange={(e) =>
                      setRow({ ...row, [f.key]: e.target.value })
                    }
                  />
                  <datalist id={"opts-" + f.key}>
                    {f.options.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </>
              ) : (
                <input
                  type={f.type || "text"}
                  min={f.type === "number" ? 0 : undefined}
                  step="any"
                  required={f.required}
                  value={String(row[f.key] ?? "")}
                  onChange={(e) =>
                    setRow({
                      ...row,
                      [f.key]:
                        f.type === "number"
                          ? e.target.value === ""
                            ? ""
                            : Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
              )}
            </label>
          ))}
        </div>
        {(error || externalError) && (
          <p role="alert" className="error">
            {error || externalError}
          </p>
        )}
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Apply changes"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
