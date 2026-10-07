"use client";
import { derive, str } from "@/lib/production";
import type { ProjectData } from "@/lib/types";

export function AnchorPackage({ data, onChange }: { data: ProjectData; onChange: (data: ProjectData) => void }) {
  const takeoff = derive(data).anchorTakeoff;
  if (!takeoff.length) return null;
  const milestones = data.anchorMilestones || {};
  const setMilestone = (key: "staged" | "delivered") => {
    onChange({ ...data, anchorMilestones: { ...milestones, [key]: new Date().toISOString().slice(0, 10) } });
  };
  return <section className="panel anchor-package-panel">
    <div className="panel-heading"><div><h2>Anchor package</h2><p>Pull one combined box for this phase and stage it with the frames. Quantities come from the opening takeoff.</p></div></div>
    <div className="anchor-package-content"><div className="anchor-package-lines">{takeoff.map((row) => <div key={`${row.size}:${row.name}`}><span>{row.size} {row.name}</span><strong>{row.count}</strong></div>)}</div><div className="anchor-package-status"><div><span>Staged</span><strong>{milestones.staged || "Pending"}</strong></div><div><span>Delivered</span><strong>{milestones.delivered || "Pending"}</strong></div><button className="button secondary" disabled={!!milestones.staged} onClick={() => setMilestone("staged")}>Mark staged</button><button className="button secondary" disabled={!milestones.staged || !!milestones.delivered} onClick={() => setMilestone("delivered")}>Mark delivered with frames</button></div></div>
    <p className="printing-note">Changing a milestone marks this project phase as unsaved. Click Save changes to keep it.</p>
    <span className="sr-only">Anchor package entries: {takeoff.map((row) => `${row.count} ${str(row.size)} ${str(row.name)}`).join(", ")}</span>
  </section>;
}
