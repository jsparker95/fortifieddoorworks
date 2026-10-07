"use client";
import { useState } from "react";
import { ElevationDrawing, Row } from "@/lib/types";
import { str } from "@/lib/production";

const blankDrawing = (openingId: string): ElevationDrawing => ({
  openingId,
  kind: "Window / borrowed light",
  widthIn: 48,
  heightIn: 48,
  doorWidthIn: 36,
  doorHeightIn: 84,
  chairRailIn: 0,
  verticalMullions: 0,
  horizontalRails: 0,
  weldCount: 4,
  glassStopFeet: 0,
  notes: "",
});

export function ElevationBuilder({
  openings,
  drawings,
  onChange,
}: {
  openings: Row[];
  drawings: ElevationDrawing[];
  onChange: (drawings: ElevationDrawing[]) => void;
}) {
  const [openingId, setOpeningId] = useState(openings[0]?.id || "");
  const update = (index: number, patch: Partial<ElevationDrawing>) =>
    onChange(drawings.map((drawing, i) => i === index ? { ...drawing, ...patch } : drawing));
  const add = () => {
    if (!openingId) return;
    onChange([...drawings, blankDrawing(openingId)]);
  };
  const input = (label: string, value: number, onValue: (value: number) => void) => (
    <label className="elevation-field" key={label}>{label}<input type="number" min="0" step="1" value={value} onChange={(e) => onValue(Number(e.target.value))} /></label>
  );
  return <section className="panel">
    <div className="panel-heading"><div><h2>Elevation drawings</h2><p>Create a production elevation for a borrowed light, window, or door with sidelight.</p></div></div>
    <div className="elevation-add"><label>Opening<select value={openingId} onChange={(e) => setOpeningId(e.target.value)}>{openings.map((o) => <option key={o.id} value={o.id}>{str(o.name)}</option>)}</select></label><button className="button" disabled={!openingId} onClick={add}>Add elevation</button></div>
    {!drawings.length && <p className="muted">No elevations added. Select an opening and add one when a custom glazed frame needs a drawing.</p>}
    <div className="elevation-list">{drawings.map((drawing, index) => {
      const opening = openings.find((item) => item.id === drawing.openingId);
      return <article className="elevation-card" key={`${drawing.openingId}-${index}`}>
        <div className="elevation-card-head"><strong>{str(opening?.name) || "Opening"}</strong><button className="button secondary" onClick={() => onChange(drawings.filter((_, i) => i !== index))}>Remove</button></div>
        <div className="form-grid">
          <label className="elevation-field">Drawing type<select value={drawing.kind} onChange={(e) => update(index, { kind: e.target.value as ElevationDrawing["kind"] })}><option>Window / borrowed light</option><option>Door + sidelight</option></select></label>
          {input("Overall width (in)", drawing.widthIn, (widthIn) => update(index, { widthIn }))}
          {input("Overall height (in)", drawing.heightIn, (heightIn) => update(index, { heightIn }))}
          {drawing.kind === "Door + sidelight" && <>{input("Door width (in)", drawing.doorWidthIn, (doorWidthIn) => update(index, { doorWidthIn }))}{input("Door height (in)", drawing.doorHeightIn, (doorHeightIn) => update(index, { doorHeightIn }))}</>}
          {input("Chair rail height (in)", drawing.chairRailIn, (chairRailIn) => update(index, { chairRailIn }))}
          {input("Vertical mullions", drawing.verticalMullions, (verticalMullions) => update(index, { verticalMullions }))}
          {input("Horizontal rails", drawing.horizontalRails, (horizontalRails) => update(index, { horizontalRails }))}
          {input("Weld count", drawing.weldCount, (weldCount) => update(index, { weldCount }))}
          {input("Glass stop (linear ft)", drawing.glassStopFeet, (glassStopFeet) => update(index, { glassStopFeet }))}
          <label className="elevation-field elevation-notes">Production notes<textarea value={drawing.notes} onChange={(e) => update(index, { notes: e.target.value })} /></label>
        </div>
      </article>;
    })}</div>
  </section>;
}
