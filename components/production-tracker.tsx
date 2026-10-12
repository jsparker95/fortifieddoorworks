"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Play, Square, Check, X, RefreshCw } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { ProductionWorkSession, Project, Row } from "@/lib/types";
import { str } from "@/lib/production";
import { summarizeDailyEfficiency } from "@/lib/production-efficiency";

const codedCategories = ["Cleaning / staging", "Delivery", "Inventory", "Project support", "Training", "Other approved work"];
const fmt = (hours: number) => `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
const sessionHours = (row: ProductionWorkSession, now: number) =>
  Math.max(0, (new Date(row.ended_at || now).getTime() - new Date(row.started_at).getTime()) / 3_600_000);
const dayKey = (value: string) => new Date(value).toLocaleDateString("en-CA");

export function ProductionTracker({
  projectId, phaseId, openings, projects, email, employeeName, manager, demo, scannedOpeningId, scannedKind, onMilestone,
}: {
  projectId: string; phaseId: string; openings: Row[]; projects: Project[]; email: string; employeeName: string; manager: boolean; demo: boolean;
  scannedOpeningId: string; scannedKind: string; onMilestone: (openingId: string, stage: string) => void;
}) {
  const [rows, setRows] = useState<ProductionWorkSession[]>([]);
  const ownEmail = email.toLowerCase();
  const [employeeNames, setEmployeeNames] = useState<Map<string, string>>(
    () => new Map([[ownEmail, employeeName.trim() || email]]),
  );
  const [selectedOpeningId, setSelectedOpeningId] = useState("");
  const [taskKind, setTaskKind] = useState<"frame" | "door" | "hardware">("frame");
  const [codedCategory, setCodedCategory] = useState(codedCategories[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    if (demo) return;
    const { data, error: queryError } = await supabase.from("production_work_sessions").select("*").order("started_at", { ascending: false }).limit(500);
    if (queryError) {
      setError(queryError.message);
      return;
    }
    const sessions = (data || []) as ProductionWorkSession[];
    setRows(sessions);
    if (!manager) {
      setEmployeeNames(new Map([[ownEmail, employeeName.trim() || email]]));
      return;
    }
    const employeeEmails = [...new Set(sessions.map((row) => row.worker_email.toLowerCase()))];
    if (!employeeEmails.length) {
      setEmployeeNames(new Map([[ownEmail, employeeName.trim() || email]]));
      return;
    }
    const nameResult = await supabase.rpc("list_production_employee_names", { p_emails: employeeEmails });
    if (nameResult.error) {
      setEmployeeNames(new Map([[ownEmail, employeeName.trim() || email]]));
      setError(nameResult.error.message);
      return;
    }
    setEmployeeNames(new Map(((nameResult.data || []) as { email: string; display_name: string }[])
      .map((member) => [member.email.toLowerCase(), member.display_name])));
  }, [demo, email, employeeName, manager, ownEmail]);

  useEffect(() => { void refresh(); const loadTimer = window.setInterval(() => void refresh(), 30_000); return () => window.clearInterval(loadTimer); }, [refresh]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!scannedOpeningId) return;
    if (openings.some((row) => row.id === scannedOpeningId)) setSelectedOpeningId(scannedOpeningId);
    if (["Frames", "Doors", "Hardware"].includes(scannedKind)) {
      setTaskKind(scannedKind === "Frames" ? "frame" : scannedKind === "Doors" ? "door" : "hardware");
    }
  }, [scannedOpeningId, scannedKind, openings]);

  const ownRows = useMemo(() => rows.filter((row) => row.worker_email.toLowerCase() === ownEmail), [rows, ownEmail]);
  const activeShift = ownRows.find((row) => row.work_kind === "shift" && row.status === "running");
  const activeTask = ownRows.find((row) => row.work_kind !== "shift" && row.status === "running");
  const selectedOpening = openings.find((row) => row.id === selectedOpeningId);
  const hoursCredit = Number(selectedOpening?.pieceRateHours || 0);
  const pendingApprovals = manager ? rows.filter((row) => row.work_kind === "coded" && row.status === "pending_approval") : [];

  async function insertSession(values: Partial<ProductionWorkSession>): Promise<boolean> {
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: insertError } = await supabase.from("production_work_sessions").insert({ worker_email: ownEmail, ...values });
      if (insertError) throw insertError;
      await refresh();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start this timer."); return false; }
    finally { setBusy(false); }
  }
  async function startShift() {
    if (await insertSession({ work_kind: "shift", coded_category: "", status: "running", started_at: new Date().toISOString(), piece_rate_hours: 0 })) setNotice("Shift started. Start a frame, door, hardware, or coded-time timer below.");
  }
  async function stopRow(row: ProductionWorkSession) {
    if (row.work_kind === "shift" && activeTask) { setError("Stop the active work timer before ending the shift."); return; }
    setBusy(true); setError(""); setNotice("");
    const end = new Date().toISOString();
    const nextStatus = row.work_kind === "coded" ? "pending_approval" : "completed";
    const { error: updateError } = await supabase.from("production_work_sessions").update({ ended_at: end, status: nextStatus }).eq("id", row.id).eq("status", "running");
    if (updateError) setError(updateError.message);
    else {
      if (["frame", "door", "hardware"].includes(row.work_kind) && row.opening_id) {
        const stage = row.work_kind === "frame" ? "Frames produced" : row.work_kind === "door" ? "Doors produced" : "Hardware packaged";
        onMilestone(row.opening_id, stage);
      }
      setNotice(row.work_kind === "coded" ? "Coded time submitted for a manager to review; it will not be excluded from efficiency until approved." : `Work timer stopped · ${fmt(sessionHours({ ...row, ended_at: end }, now))}. Saving the production milestone automatically.`);
      await refresh();
    }
    setBusy(false);
  }
  async function startTask(kind: "frame" | "door" | "hardware" | "coded") {
    if (kind !== "coded" && !selectedOpening) { setError("Choose or scan an opening first."); return; }
    if (kind !== "coded" && !selectedOpening?.id) return;
    const inserted = await insertSession(kind === "coded" ? {
      work_kind: kind, coded_category: codedCategory, status: "running", started_at: new Date().toISOString(), piece_rate_hours: 0,
    } : {
      work_kind: kind, coded_category: "", project_id: projectId, phase_id: phaseId, opening_id: selectedOpening!.id,
      opening_mark: str(selectedOpening!.name), status: "running", started_at: new Date().toISOString(), piece_rate_hours: 0,
    });
    if (inserted) setNotice(kind === "coded" ? `${codedCategory} timer started.` : `${kind[0].toUpperCase()}${kind.slice(1)} timer started for ${str(selectedOpening!.name)}.`);
  }
  async function reviewCoded(row: ProductionWorkSession, approve: boolean) {
    setBusy(true); setError("");
    const { error: updateError } = await supabase.from("production_work_sessions").update({ status: approve ? "approved" : "rejected", approved_by: ownEmail, approved_at: new Date().toISOString() }).eq("id", row.id).eq("status", "pending_approval");
    if (updateError) setError(updateError.message); else { setNotice(approve ? "Coded time approved and excluded from efficiency hours." : "Coded time rejected; it remains included in efficiency hours."); await refresh(); }
    setBusy(false);
  }

  const today = dayKey(new Date(now).toISOString());
  const efficiencyRows = useMemo(
    () => summarizeDailyEfficiency(rows, today, now, employeeNames),
    [rows, today, now, employeeNames],
  );

  if (demo) return <section className="panel"><h2>Shop-floor time &amp; piece rate</h2><p>Clock and approval records require a signed-in employee account in the connected workspace.</p></section>;
  return <section className="panel production-tracker">
    <div className="panel-heading"><div><h2>Shop-floor time &amp; piece rate</h2><p>Shift and task timers run in the mobile-first production app. Review efficiency and coded-time approvals here.</p></div><div className="production-workspace-actions"><Link className="button" href="/production"><Play size={15}/> Open production app</Link><button className="button secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15}/> Refresh</button></div></div>

    <div className="efficiency-summary">
      <h3>Today’s efficiency</h3>
      <p>Piece-rate hours ÷ (shift hours − approved coded hours). Coded entries pending approval still count against the total.</p>
      {efficiencyRows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Completed items</th>
                <th>Shift</th>
                <th>Approved coded</th>
                <th>Piece-rate hours</th>
                <th>Productive hours</th>
                <th>Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {efficiencyRows.map((stats) => (
                <tr key={stats.employeeEmail}>
                  <td>{stats.employee}</td>
                  <td>
                    {stats.completedItems.length ? (
                      <ul className="efficiency-items">
                        {stats.completedItems.map((item) => {
                          const project = projects.find(
                            (candidate) => candidate.id === item.project_id,
                          );
                          const phaseName = project?.data.phases?.find(
                            (phase) => phase.id === item.phase_id,
                          )?.name;
                          const kind =
                            item.work_kind === "frame"
                              ? "Frame"
                              : item.work_kind === "door"
                                ? "Door"
                                : "Hardware";

                          return (
                            <li key={item.id}>
                              <strong>
                                {kind} · {item.opening_mark || "Opening"}
                              </strong>
                              {project && (
                                <small>
                                  {project.name}
                                  {phaseName ? ` · ${phaseName}` : ""}
                                </small>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{fmt(stats.shift)}</td>
                  <td>
                    {fmt(stats.coded)}
                    {stats.unreviewed ? ` · ${fmt(stats.unreviewed)} pending` : ""}
                  </td>
                  <td>{stats.credit.toFixed(2)}</td>
                  <td>{fmt(stats.productive)}</td>
                  <td>{stats.efficiency === null ? "—" : `${stats.efficiency}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No shift or production entries recorded today.</p>
      )}
    </div>

    {manager && <div className="approval-queue"><h3>Coded time pending approval <span>{pendingApprovals.length}</span></h3>{pendingApprovals.map((row) => <div className="approval-row" key={row.id}><span><strong>{row.worker_email}</strong><small>{row.coded_category} · {new Date(row.started_at).toLocaleString()} – {row.ended_at ? new Date(row.ended_at).toLocaleTimeString() : "running"} · {fmt(sessionHours(row, now))}</small></span><button aria-label="Approve coded time" disabled={busy} onClick={() => void reviewCoded(row, true)}><Check size={16}/></button><button aria-label="Reject coded time" disabled={busy} onClick={() => void reviewCoded(row, false)}><X size={16}/></button></div>)}{!pendingApprovals.length && <p>No coded entries need review.</p>}</div>}

    <div className="session-history"><h3>Recent time entries</h3>{rows.slice(0, 18).map((row) => <div className="session-row" key={row.id}><span><strong>{row.worker_email}</strong><small>{row.work_kind === "shift" ? "Shift" : row.work_kind === "coded" ? row.coded_category : `${row.work_kind}: ${row.opening_mark}`} · {new Date(row.started_at).toLocaleString()} · {row.status.replaceAll("_", " ")}</small></span><span>{row.ended_at ? fmt(sessionHours(row, now)) : "In progress"}{row.work_kind === "frame" && row.piece_rate_hours ? ` · ${Number(row.piece_rate_hours).toFixed(2)} PR h` : ""}</span></div>)}</div>
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="success-note">{notice}</p>}
  </section>;
}
