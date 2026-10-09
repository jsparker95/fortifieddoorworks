"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, DoorOpen, LogOut, Play, Square } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { normalizeProject } from "@/lib/phases";
import { productionWorkKindForLabel } from "@/lib/production-qr";
import { str } from "@/lib/production";
import { recordProductionMilestone } from "@/lib/production-milestones";
import { formatProductionDuration } from "@/lib/production-timer";
import type { ProductionWorkSession, Project, ProjectPhase, Row } from "@/lib/types";

const codedCategories = ["Cleaning / staging", "Delivery", "Inventory", "Project support", "Training", "Other approved work"];
const elapsed = (row: ProductionWorkSession, now: number) => Math.max(0, new Date(row.ended_at || now).getTime() - new Date(row.started_at).getTime());
const asProject = (row: Record<string, unknown>) => normalizeProject(row as unknown as Project);
type ScannedOpening = { projectId: string; phaseId: string; openingId: string; kind: "frame" | "door" | "hardware" };

export function ProductionApp() {
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<ProductionWorkSession[]>([]);
  const [activeProject, setActiveProject] = useState("");
  const [activePhase, setActivePhase] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [workKind, setWorkKind] = useState<"frame" | "door" | "hardware">("frame");
  const [scannedOpening, setScannedOpening] = useState<ScannedOpening | null>(null);
  const [scanError, setScanError] = useState("");
  const [codedCategory, setCodedCategory] = useState(codedCategories[0]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (userEmail: string) => {
    setError("");
    const member = await supabase.from("workspace_members").select("email,role").eq("email", userEmail.toLowerCase()).maybeSingle();
    if (member.error) throw member.error;
    if (!member.data) throw new Error("This account does not have access to the workspace. Ask a manager to add you.");
    const [projectResult, sessionResult] = await Promise.all([
      supabase.from("projects").select("*").order("name"),
      supabase.from("production_work_sessions").select("*").eq("worker_email", userEmail.toLowerCase()).order("started_at", { ascending: false }).limit(40),
    ]);
    if (projectResult.error) throw projectResult.error;
    if (sessionResult.error) throw sessionResult.error;
    setProjects((projectResult.data || []).map((row) => asProject(row as Record<string, unknown>)));
    setSessions((sessionResult.data || []) as ProductionWorkSession[]);
    setEmail(userEmail);
    setAuthenticated(true);
  }, []);

  const refresh = useCallback(async () => {
    const user = await supabase.auth.getUser();
    if (user.error) throw user.error;
    if (!user.data.user?.email) return;
    const result = await supabase.from("production_work_sessions").select("*").eq("worker_email", user.data.user.email.toLowerCase()).order("started_at", { ascending: false }).limit(40);
    if (result.error) throw result.error;
    setSessions((result.data || []) as ProductionWorkSession[]);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const result = await supabase.auth.getUser();
        if (!alive) return;
        if (result.data.user?.email) await load(result.data.user.email);
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : "Could not load production."); }
      finally { if (alive) setChecking(false); }
    })();
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    const poll = window.setInterval(() => { void refresh().catch(() => undefined); }, 30_000);
    return () => { alive = false; window.clearInterval(tick); window.clearInterval(poll); };
  }, [load, refresh]);

  useEffect(() => {
    if (!projects.length) return;
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project") || params.get("projectId");
    const phaseId = params.get("phase") || params.get("phaseId");
    const itemId = params.get("item") || params.get("openingId");
    const kindValue = params.get("kind");
    if (!projectId && !phaseId && !itemId && !kindValue) return;

    const kind = productionWorkKindForLabel(kindValue);
    if (!projectId || !phaseId || !itemId || !kind) {
      setScanError("This QR label is incomplete or isn’t a frame, door, or hardware label. Choose the job and opening below.");
      return;
    }
    const targetProject = projects.find((row) => row.id === projectId);
    const targetPhase = targetProject?.data.phases?.find((row) => row.id === phaseId);
    const targetOpening = targetPhase?.data.openings?.find((row) => row.id === itemId && !row.deleted && str(row.name).trim());
    if (!targetProject || !targetPhase || !targetOpening) {
      setScanError("We couldn’t find this opening in the scanned job. Choose the correct project, phase, and opening below.");
      return;
    }

    setActiveProject(targetProject.id);
    setActivePhase(targetPhase.id);
    setOpeningId(targetOpening.id);
    setWorkKind(kind);
    setScannedOpening({ projectId: targetProject.id, phaseId: targetPhase.id, openingId: targetOpening.id, kind });
    setScanError("");
    setError("");
  }, [projects]);

  const ownSessions = useMemo(() => sessions.filter((row) => row.worker_email.toLowerCase() === email.toLowerCase()), [sessions, email]);
  const shift = ownSessions.find((row) => row.work_kind === "shift" && row.status === "running");
  const task = ownSessions.find((row) => row.work_kind !== "shift" && row.status === "running");
  const project = projects.find((row) => row.id === activeProject);
  const phases = project?.data.phases || [];
  const phase = phases.find((row) => row.id === activePhase) || phases[0];
  const openings: Row[] = (phase?.data.openings || []).filter((row) => !row.deleted && str(row.name).trim());
  const opening = openings.find((row) => row.id === openingId);
  const scanMatchesCurrent = !!scannedOpening && scannedOpening.projectId === project?.id && scannedOpening.phaseId === phase?.id && scannedOpening.openingId === opening?.id && scannedOpening.kind === workKind;

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password });
      if (result.error) throw result.error;
      if (!result.data.user?.email) throw new Error("Could not read the signed-in account.");
      await load(result.data.user.email);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign in."); }
    finally { setBusy(false); }
  }

  async function startShift() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await supabase.from("production_work_sessions").insert({ worker_email: email.toLowerCase(), work_kind: "shift", coded_category: "", status: "running", started_at: new Date().toISOString(), piece_rate_hours: 0 });
      if (result.error) throw result.error;
      setMessage("Shift started. Choose a job and start your first task when you’re ready.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start your shift."); }
    finally { setBusy(false); }
  }

  async function startTask(kind: "frame" | "door" | "hardware" | "coded") {
    if (kind !== "coded" && (!project || !phase || !opening)) { setError("Choose a job, phase, and opening first."); return; }
    setBusy(true); setError(""); setMessage("");
    const values = kind === "coded" ? {
      worker_email: email.toLowerCase(), work_kind: kind, coded_category: codedCategory, status: "running", started_at: new Date().toISOString(), piece_rate_hours: 0,
    } : {
      worker_email: email.toLowerCase(), work_kind: kind, coded_category: "", project_id: project!.id, phase_id: phase!.id, opening_id: opening!.id, opening_mark: str(opening!.name), status: "running", started_at: new Date().toISOString(), piece_rate_hours: 0,
    };
    try {
      const result = await supabase.from("production_work_sessions").insert(values as never);
      if (result.error) throw result.error;
      setMessage(kind === "coded" ? `${codedCategory} timer started.` : `${kind[0].toUpperCase()}${kind.slice(1)} work started for ${str(opening!.name)}.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start this timer."); }
    finally { setBusy(false); }
  }

  async function syncMilestone(row: ProductionWorkSession): Promise<boolean> {
    if (!["frame", "door", "hardware"].includes(row.work_kind)) return true;
    if (!row.project_id || !row.phase_id || !row.opening_id) return false;
    const projectResult = await supabase.from("projects").select("id,data,version").eq("id", row.project_id).maybeSingle();
    if (projectResult.error || !projectResult.data) return false;
    const data = recordProductionMilestone(projectResult.data.data, row.phase_id, row.opening_id, row.work_kind as "frame" | "door" | "hardware", new Date().toLocaleDateString("en-CA"));
    if (!data) return false;
    const update = await supabase.from("projects").update({ data }).eq("id", row.project_id).eq("version", projectResult.data.version).select("id").maybeSingle();
    return !update.error && !!update.data;
  }

  async function stop(row: ProductionWorkSession) {
    if (row.work_kind === "shift" && task) { setError("Finish the active task before ending your shift."); return; }
    setBusy(true); setError(""); setMessage("");
    const endedAt = new Date().toISOString();
    try {
      const result = await supabase.from("production_work_sessions").update({ ended_at: endedAt, status: row.work_kind === "coded" ? "pending_approval" : "completed" }).eq("id", row.id).eq("status", "running");
      if (result.error) throw result.error;
      if (row.work_kind === "coded") setMessage("Coded time sent to a manager for review.");
      else if (row.work_kind === "shift") setMessage(`Shift recorded · ${formatProductionDuration(elapsed({ ...row, ended_at: endedAt }, now))}.`);
      else {
        const milestoneSaved = await syncMilestone(row);
        setMessage(milestoneSaved
          ? `${row.work_kind} timer saved · ${formatProductionDuration(elapsed({ ...row, ended_at: endedAt }, now))}. Project milestone updated.`
          : `${row.work_kind} timer saved · ${formatProductionDuration(elapsed({ ...row, ended_at: endedAt }, now))}. Update the milestone in the project workspace; the project changed while this task was running.`);
      }
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this timer."); }
    finally { setBusy(false); }
  }

  if (checking) return <main className="production-app"><div className="production-app-loading">Loading production…</div></main>;
  if (!authenticated) return <main className="production-app"><section className="production-login"><img src="/production-hardware-logo.png" alt="Fortified Doorworks"/><h1>Production</h1><p>Sign in to clock your shift and record shop-floor work.</p><form onSubmit={signIn}><label>Email<input type="email" autoComplete="username" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)}/></label><button className="production-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form>{error && <p role="alert" className="production-error">{error}</p>}<Link href="/">Workspace sign in</Link></section></main>;

  return <main className="production-app"><header className="production-app-header"><div><span className="production-eyebrow">FORTIFIED DOORWORKS</span><h1>Production</h1><p>{email}</p></div><button className="production-icon-button" aria-label="Sign out" title="Sign out" onClick={async () => { await supabase.auth.signOut(); setEmail(""); setAuthenticated(false); }}><LogOut size={19}/></button></header>
    <section className="production-shift-card"><div className="production-status-icon"><Clock3 size={21}/></div><div className="production-shift-copy"><strong>{shift ? "Shift in progress" : "Ready to start"}</strong><span>{shift ? `Started ${new Date(shift.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${formatProductionDuration(elapsed(shift, now))} elapsed` : "Start your shift before recording work."}</span></div>{shift ? <button className="production-stop" disabled={busy || !!task} onClick={() => void stop(shift)}><Square size={16}/> End</button> : <button className="production-primary production-start" disabled={busy} onClick={() => void startShift()}><Play size={16}/> Start shift</button>}</section>
    {shift && <>
      <section className="production-card"><div className="production-card-title"><DoorOpen size={19}/><h2>Choose your work</h2></div>{scanError && <p role="alert" className="production-scan-warning">{scanError}</p>}<label>Project<select value={activeProject} onChange={(event) => { setActiveProject(event.target.value); setActivePhase(""); setOpeningId(""); setScannedOpening(null); setScanError(""); }}><option value="">Select a project</option>{projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{project && <label>Phase<select value={phase?.id || ""} onChange={(event) => { setActivePhase(event.target.value); setOpeningId(""); setScannedOpening(null); setScanError(""); }}>{phases.map((row: ProjectPhase) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}{phase && <label>Opening<select value={openingId} onChange={(event) => { setOpeningId(event.target.value); setScannedOpening(null); setScanError(""); }}><option value="">Select an opening</option>{openings.map((row) => <option key={row.id} value={row.id}>{str(row.name)} · {str(row.width)} × {str(row.height)}</option>)}</select></label>}
        {scanMatchesCurrent && opening && <section className="production-scan-confirm" aria-label="Scanned opening confirmation"><span className="production-scan-eyebrow"><CheckCircle2 size={17}/> Scanned label · please verify</span><strong>{str(opening.name)}</strong><span className="production-scan-project">{project?.name} · {phase?.name}</span><span className="production-scan-details">{[`${str(opening.width) || "—"} × ${str(opening.height) || "—"}`, str(opening.handing), str(opening.frameType)].filter(Boolean).join(" · ")}</span><span className="production-scan-kind">{workKind[0].toUpperCase() + workKind.slice(1)} work</span></section>}
        <div className="production-kind-picker" aria-label="Work type">{([ ["frame", "Frame"], ["door", "Door"], ["hardware", "Hardware"] ] as const).map(([kind, label]) => <button key={kind} className={workKind === kind ? "selected" : ""} onClick={() => { setWorkKind(kind); if (kind !== workKind) setScannedOpening(null); }}>{label}</button>)}</div>
        {task && task.work_kind !== "coded" ? <button className="production-primary production-full-button" disabled={busy} onClick={() => void stop(task)}><Square size={18}/> Finish {task.work_kind} · {task.opening_mark}</button> : task?.work_kind === "coded" ? <button className="production-stop production-full-button" disabled={busy} onClick={() => void stop(task)}>Submit {task.coded_category}</button> : <button className="production-primary production-full-button" disabled={busy || !opening} onClick={() => void startTask(workKind)}><Play size={18}/> Start {workKind} work</button>}
      </section>
      {!task && <section className="production-card production-coded"><label>Coded work<select value={codedCategory} onChange={(event) => setCodedCategory(event.target.value)}>{codedCategories.map((category) => <option key={category}>{category}</option>)}</select></label><button className="production-secondary production-full-button" disabled={busy} onClick={() => void startTask("coded")}><Play size={17}/> Start coded time</button></section>}
      {task && <section className="production-active-card"><CheckCircle2 size={19}/><span><strong>Timer running</strong><small>{task.work_kind === "coded" ? task.coded_category : `${task.work_kind} · ${task.opening_mark}`} · {formatProductionDuration(elapsed(task, now))}</small></span></section>}
    </>}
    <section className="production-recent"><h2>Recent activity</h2>{ownSessions.slice(0, 8).map((row) => <div className="production-recent-row" key={row.id}><span className="production-recent-mark">{row.work_kind === "shift" ? "S" : row.work_kind === "coded" ? "C" : row.work_kind[0].toUpperCase()}</span><span className="production-recent-copy"><strong>{row.work_kind === "shift" ? "Shift" : row.work_kind === "coded" ? row.coded_category : `${row.work_kind} · ${row.opening_mark}`}</strong><small>{new Date(row.started_at).toLocaleDateString([], { month: "short", day: "numeric" })} · {row.status.replaceAll("_", " ")}</small></span><span className="production-recent-duration">{row.ended_at ? formatProductionDuration(elapsed(row, now)) : formatProductionDuration(elapsed(row, now))}</span></div>)}</section>
    {(error || message) && <p role={error ? "alert" : "status"} className={error ? "production-error" : "production-message"}>{error || message}</p>}
    <footer className="production-app-footer"><Link href="/">Open project workspace</Link></footer>
  </main>;
}
