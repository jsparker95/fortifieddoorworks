"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Field } from "@/lib/fields";
import { Row } from "@/lib/types";
function PlanSourceDetails({ source }: { source: Row }) {
  const notes = String(source.scheduleNotes || "");
  const leaves = String(source.leafCount || "");
  const leafWidth = String(source.leafWidth || "");
  const profile = String(source.sourceCatalogCode || "");
  const diagram = String(source.sourceScheduleDoorType || "");
  const frameDepthReview = source.frameDepthReviewRequired === true && !source.size;
  if (!source.sourceDocumentId || !(notes || leaves || diagram || source.layers || frameDepthReview || source.finishedThickness)) return null;
  const page = Number(source.sourcePage), schedule = Number(source.sourceSchedulePage);
  const facts = [
    ["Schedule profile", profile], ["Drawing door type", diagram],
    ["Door leaves", leaves], ["Width of each leaf", leafWidth || (Number(leaves) > 1 ? "Needs review" : "")],
    ["Finished wall thickness", String(source.finishedThickness || "")],
  ].filter(([, value]) => value);
  return (
    <section className="plan-source-details" aria-label="From the plans">
      <details open>
        <summary><strong>From the plans</strong></summary>
        <div className="plan-source-body">
          {page > 0 && <p className="plan-source-pages">{schedule > 0 && schedule !== page
            ? `Plan PDF page ${page} · Schedule PDF page ${schedule}` : `Source PDF page ${page}`}</p>}
          {!!facts.length && <dl className="plan-source-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
          {!!notes && <div className="plan-source-notes"><strong>Plan notes</strong><p>{notes}</p></div>}
          {Number(leaves) > 1 && !leafWidth && <p className="plan-source-review">Leaf sizes need review. The printed opening width has been retained.</p>}
          {frameDepthReview && <p className="plan-source-review">Ordered frame depth needs review. Wall construction or finished thickness alone does not establish the frame depth.</p>}
          {!!(source.sourceEvidence || source.handingEvidence) && <details className="plan-source-evidence"><summary>Source evidence</summary>
            {!!source.sourceEvidence && <p>{String(source.sourceEvidence)}</p>}
            {!!source.handingEvidence && <p>{String(source.handingEvidence)}</p>}
          </details>}
        </div>
      </details>
    </section>
  );
}

export function Editor({
  title,
  fields,
  initial,
  onSave,
  onClose,
  externalError,
  busy,
  singleColumn = false,
}: {
  title: string;
  fields: Field[];
  initial: Row;
  onSave: (row: Row) => void;
  onClose: () => void;
  externalError?: string;
  busy?: boolean;
  singleColumn?: boolean;
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
        <PlanSourceDetails source={initial} />
        <div className={`form-grid${singleColumn ? " form-grid-single-column" : ""}`}>
          {fields.filter((f) => !f.visibleWhen || row[f.visibleWhen.key] === f.visibleWhen.value).map((f) => (
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
