"use client";
import { DoorMachiningSpec, Row, WoodDoorOrder } from "@/lib/types";
import { str } from "@/lib/production";

const woodDefaults = (openingId: string): WoodDoorOrder => ({
  openingId, manufacturer: "", species: "", grade: "", cut: "", finish: "", core: "", thickness: "1 3/4", glazing: "", notes: "",
});
const machiningDefaults = (openingId: string): DoorMachiningSpec => ({
  openingId, hingeCount: "3", hingeLocations: "", lockBackset: "", lockHeight: "", closerPrep: "", exitDevicePrep: "", otherPrep: "", notes: "",
});

export function DoorProductionForms({
  openings, woodOrders, machiningSpecs, onWoodOrders, onMachiningSpecs,
}: {
  openings: Row[];
  woodOrders: WoodDoorOrder[];
  machiningSpecs: DoorMachiningSpec[];
  onWoodOrders: (items: WoodDoorOrder[]) => void;
  onMachiningSpecs: (items: DoorMachiningSpec[]) => void;
}) {
  const textFields = <T extends object>(item: T, onUpdate: (patch: Partial<T>) => void, fields: (keyof T)[]) => (
    <div className="form-grid">{fields.map((field) => <label className="elevation-field" key={String(field)}>{String(field).replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (s) => s.toUpperCase())}<input value={String(item[field] ?? "")} onChange={(e) => onUpdate({ [field]: e.target.value } as Partial<T>)} /></label>)}</div>
  );
  return <>
    <section className="panel">
      <div className="panel-heading"><div><h2>Wood door order forms</h2><p>Keep manufacturer and door construction selections with each opening for ordering.</p></div><button className="button" disabled={!openings.length} onClick={() => openings[0] && onWoodOrders([...woodOrders, woodDefaults(openings[0].id)])}>Add order</button></div>
      {!woodOrders.length && <p className="muted">No wood door orders yet.</p>}
      {woodOrders.map((item, index) => <div className="elevation-card" key={`${item.openingId}-${index}`}>
        <div className="elevation-card-head"><select value={item.openingId} onChange={(e) => onWoodOrders(woodOrders.map((record, i) => i === index ? { ...record, openingId: e.target.value } : record))}>{openings.map((o) => <option key={o.id} value={o.id}>{str(o.name)}</option>)}</select><button className="button secondary" onClick={() => onWoodOrders(woodOrders.filter((_, i) => i !== index))}>Remove</button></div>
        {textFields(item, (patch) => onWoodOrders(woodOrders.map((record, i) => i === index ? { ...record, ...patch } : record)), ["manufacturer", "species", "grade", "cut", "finish", "core", "thickness", "glazing", "notes"])}
      </div>)}
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h2>Door machining specifications</h2><p>Record shop prep dimensions and requirements per opening.</p></div><button className="button" disabled={!openings.length} onClick={() => openings[0] && onMachiningSpecs([...machiningSpecs, machiningDefaults(openings[0].id)])}>Add specification</button></div>
      {!machiningSpecs.length && <p className="muted">No machining specifications yet.</p>}
      {machiningSpecs.map((item, index) => <div className="elevation-card" key={`${item.openingId}-${index}`}>
        <div className="elevation-card-head"><select value={item.openingId} onChange={(e) => onMachiningSpecs(machiningSpecs.map((record, i) => i === index ? { ...record, openingId: e.target.value } : record))}>{openings.map((o) => <option key={o.id} value={o.id}>{str(o.name)}</option>)}</select><button className="button secondary" onClick={() => onMachiningSpecs(machiningSpecs.filter((_, i) => i !== index))}>Remove</button></div>
        {textFields(item, (patch) => onMachiningSpecs(machiningSpecs.map((record, i) => i === index ? { ...record, ...patch } : record)), ["hingeCount", "hingeLocations", "lockBackset", "lockHeight", "closerPrep", "exitDevicePrep", "otherPrep", "notes"])}
      </div>)}
    </section>
  </>;
}
