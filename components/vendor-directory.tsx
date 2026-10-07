"use client";
import { useState } from "react";
import { Pencil, Plus, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Vendor } from "@/lib/types";

type Draft = Omit<Vendor, "updated_at"> & { updated_at?: string; categoriesText: string };
const blank: Draft = { id: "", name: "", lead_time_days: 21, categories: [], categoriesText: "", contact: "", email: "", phone: "", notes: "", active: true };

export function VendorDirectory({ vendors, setVendors, manager, demo }: {
  vendors: Vendor[]; setVendors: (items: Vendor[]) => void; manager: boolean; demo: boolean;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function edit(vendor?: Vendor) {
    setError(""); setNotice("");
    setDraft(vendor ? { ...vendor, categoriesText: vendor.categories.join(", ") } : { ...blank });
  }
  async function save() {
    if (!draft || !draft.name.trim()) { setError("Enter a vendor name."); return; }
    setBusy(true); setError(""); setNotice("");
    const { categoriesText } = draft;
    const vendorValues = {
      name: draft.name.trim(),
      lead_time_days: draft.lead_time_days,
      categories: categoriesText.split(",").map((value) => value.trim()).filter(Boolean),
      contact: draft.contact,
      email: draft.email,
      phone: draft.phone,
      notes: draft.notes,
      active: draft.active,
    };
    const result = draft.id
      ? await supabase.from("vendors").update(vendorValues).eq("id", draft.id).select().single()
      : await supabase.from("vendors").insert(vendorValues).select().single();
    if (result.error) setError(result.error.message);
    else {
      const saved = result.data as Vendor;
      setVendors([...vendors.filter((vendor) => vendor.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft(null); setNotice("Vendor and default lead time saved. Project schedules now use this value.");
    }
    setBusy(false);
  }
  async function toggleActive(vendor: Vendor) {
    const { data, error: updateError } = await supabase.from("vendors").update({ active: !vendor.active }).eq("id", vendor.id).select().single();
    if (updateError) setError(updateError.message);
    else setVendors(vendors.map((item) => item.id === vendor.id ? data as Vendor : item));
  }
  return <section className="panel vendor-directory">
    <div className="panel-heading"><div><h2>Vendors &amp; lead times</h2><p>Supplier defaults are shared. Project opening, door-type, and hardware schedules show the current lead time for their selected vendor.</p></div>{manager && !demo && <button className="button" onClick={() => edit()}><Plus size={16}/> Add vendor</button>}</div>
    {draft && <div className="vendor-form">
      <label>Vendor name<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={!!draft.id}/>{draft.id && <small>Names are fixed after creation so existing project references keep resolving. Add a replacement vendor and reassign projects to rename.</small>}</label>
      <label>Lead time (days)<input type="number" min="0" max="730" value={draft.lead_time_days} onChange={(event) => setDraft({ ...draft, lead_time_days: Number(event.target.value) })}/></label>
      <label>Supplies<input value={draft.categoriesText} onChange={(event) => setDraft({ ...draft, categoriesText: event.target.value })} placeholder="Frames, doors, hardware"/></label>
      <label>Contact<input value={draft.contact} onChange={(event) => setDraft({ ...draft, contact: event.target.value })}/></label>
      <label>Email<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })}/></label>
      <label>Phone<input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })}/></label>
      <label className="vendor-notes">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })}/></label>
      {!!draft.id && <label className="vendor-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })}/> Active for new schedules</label>}
      <div className="vendor-form-actions"><button className="button secondary" onClick={() => setDraft(null)}><X size={15}/> Cancel</button><button className="button" disabled={busy} onClick={() => void save()}><Save size={15}/> {busy ? "Saving…" : "Save vendor"}</button></div>
    </div>}
    <div className="table-scroll"><table><thead><tr><th>Vendor</th><th>Lead time</th><th>Supplies</th><th>Contact</th><th>Status</th>{manager && !demo && <th>Actions</th>}</tr></thead><tbody>{vendors.map((vendor) => <tr key={vendor.id}><td className="strong">{vendor.name}</td><td>{vendor.lead_time_days} days</td><td>{vendor.categories.join(", ") || "—"}</td><td>{vendor.contact || vendor.email || vendor.phone || "—"}</td><td>{vendor.active ? "Active" : "Inactive"}</td>{manager && !demo && <td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${vendor.name}`} onClick={() => edit(vendor)}><Pencil size={15}/></button><button className="button secondary vendor-toggle" onClick={() => void toggleActive(vendor)}>{vendor.active ? "Deactivate" : "Reactivate"}</button></div></td>}</tr>)}</tbody></table>{!vendors.length && <p className="empty-inline">No vendor defaults yet. Add vendors such as DKS, DCI, and IML to show their current lead times on project schedules.</p>}</div>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success-note" role="status">{notice}</p>}
  </section>;
}
