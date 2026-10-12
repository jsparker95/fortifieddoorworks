"use client";
import { useId, useRef, useState } from "react";
import { ExternalLink, Upload } from "lucide-react";
import type { Catalog } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { HARDWARE_DOCUMENT_ACCEPT, HARDWARE_DOCUMENT_BUCKET, hardwareDocumentPath, hardwareDocumentType } from "@/lib/hardware-component-documents";

type Props = { component: Catalog; demo: boolean; onChange: (patch: Pick<Catalog, "id"> & Partial<Catalog>) => void };
function message(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: string })?.message || "Please try again."); }

export function HardwareComponentBrand({ component, brands, demo, onChange }: Props & { brands: Catalog[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const statusId = useId();
  async function save(brandId: string) {
    if (!brands.some((brand) => brand.id === brandId)) return;
    setBusy(true); setError("");
    try {
      if (!demo) {
        const result = await supabase.from("catalogs").update({ brand_id: brandId }).eq("id", component.id).select("brand_id").single();
        if (result.error) throw result.error;
      }
      onChange({ id: component.id, brand_id: brandId });
    } catch (cause) { setError(`Brand not saved: ${message(cause)}`); }
    finally { setBusy(false); }
  }
  return <div className="hardware-brand-cell">
    <select aria-label={`Brand for ${component.value}`} aria-required="true" aria-describedby={statusId} aria-invalid={Boolean(error)} value={component.brand_id || ""} disabled={busy || !brands.length} onChange={(event) => void save(event.target.value)}>
      <option value="" disabled>{brands.length ? "Brand required" : "Add a hardware brand first"}</option>
      {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.value}</option>)}
    </select>
    <span id={statusId} className={error ? "setting-save-error" : "setting-save-status"} role={error ? "alert" : "status"}>{error || (busy ? "Saving…" : "")}</span>
  </div>;
}

export function HardwareComponentDocument({ component, demo, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = useRef(false);
  async function upload(file: File | undefined) {
    if (!file || working.current) return;
    working.current = true; setBusy(true); setError("");
    let uploadedPath: string | null = null;
    try {
      const contentType = hardwareDocumentType(file);
      const path = hardwareDocumentPath(component.id, crypto.randomUUID(), file.name);
      const result = await supabase.storage.from(HARDWARE_DOCUMENT_BUCKET).upload(path, file, { contentType, upsert: false });
      if (result.error) throw result.error;
      uploadedPath = path;
      let query = supabase.from("catalogs").update({ document_path: path, document_name: file.name }).eq("id", component.id);
      query = component.document_path ? query.eq("document_path", component.document_path) : query.is("document_path", null);
      const saved = await query.select("id, document_path, document_name").single();
      if (saved.error) throw new Error("The document could not be attached. Refresh the components and try again.");
      uploadedPath = null;
      onChange(saved.data);
      if (component.document_path) await supabase.storage.from(HARDWARE_DOCUMENT_BUCKET).remove([component.document_path]);
    } catch (cause) {
      if (uploadedPath) await supabase.storage.from(HARDWARE_DOCUMENT_BUCKET).remove([uploadedPath]);
      setError(message(cause));
    } finally { working.current = false; setBusy(false); }
  }
  async function view() {
    if (!component.document_path || working.current) return;
    // Open on the user's click so the browser doesn't block the document after the async request.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    working.current = true; setBusy(true); setError("");
    try {
      const result = await supabase.storage.from(HARDWARE_DOCUMENT_BUCKET).createSignedUrl(component.document_path, 300);
      if (result.error) throw result.error;
      if (!tab) throw new Error("Allow pop-ups to view this document, then try again.");
      tab.location.href = result.data.signedUrl;
    } catch (cause) { tab?.close(); setError(message(cause)); }
    finally { working.current = false; setBusy(false); }
  }
  return <div className="hardware-document-cell">
    {component.document_path && <button type="button" className="hardware-document-view" disabled={busy} title={component.document_name || "View document"} aria-label={`View document for ${component.value}: ${component.document_name || "Document"}`} onClick={() => void view()}><ExternalLink size={14} />{component.document_name || "View document"}</button>}
    {demo ? <span className="muted">Sign in to attach a document</span> : <label className={`hardware-document-upload ${busy ? "is-busy" : ""}`}><Upload size={14} /><span>{busy ? "Working…" : component.document_path ? "Replace document" : "Attach document"}</span><input type="file" accept={HARDWARE_DOCUMENT_ACCEPT} disabled={busy} aria-label={`Attach document to ${component.value}`} onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>}
    {error && <span className="setting-save-error" role="alert">{error}</span>}
  </div>;
}
