Warning: truncated output (original token count: 32171)
Total output lines: 3384

"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Search,
  Plus,
  Settings,
  Truck,
  LayoutGrid,
  LayoutDashboard,
  DoorOpen,
  Package,
  Building2,
  Download,
  LogOut,
  ChevronRight,
  Copy,
  Pencil,
  Trash2,
  AlertCircle,
  Check,
  Save,
  Layers,
  Camera,
  FileText,
  X,
  Menu,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import SettingCell from "./setting-cell";
import { DeleteTargetDialog, DeletionCleanup } from "./delete-target";
import { cleanupDeletedFiles, pendingDeletionFiles } from "@/lib/deletion";
import { AccessManagement } from "./access-management";
import { canManageProduction, isWorkspaceRole, roleLabels, type WorkspaceRole } from "@/lib/access";
import { applyCatalogField, catalogFieldValue, type CatalogField } from "@/lib/catalog-settings";
import {
  Project,
  ProjectData,
  Contractor,
  Catalog,
  Row,
  Kind,
  stages,
  statuses,
  newProject,
  ProjectPhase,
  Vendor,
} from "@/lib/types";
import {
  activePhase,
  makeSplit,
  normalizeProject,
  persistActivePhase,
  selectPhase,
  resolvePhaseForOpening,
} from "@/lib/phases";
import { duplicateProject } from "@/lib/duplicate-project";
import { derive, str } from "@/lib/production";
import { Field, fields } from "@/lib/fields";
import { Editor } from "./editor";
import { ProjectFiles } from "./project-files";
import { ProductionTracker } from "./production-tracker";
import { VendorDirectory } from "./vendor-directory";
import { InstallationEstimator } from "./installation-estimator";
import { AnchorPackage } from "./anchor-package";
import { ElevationBuilder } from "./elevation-builder";
import { DoorProductionForms } from "./door-production-forms";
import { supplierFor } from "@/lib/vendors";
import { parseTable, csvCell } from "@/lib/tabular";
import { getProfileDisplayName, isValidAvatarFile } from "@/lib/profile";
import {
  compareProjects,
  projectSortColumns,
  type ProjectSortColumnKey,
  type ProjectSortKey,
} from "@/lib/project-sorting";
const sections = [
  "Overview",
  "Openings",
  "Walls",
  "Door types",
  "Hardware",
  "Frames",
  "Doors",
  "Takeoff",
  "Production",
  "Documents",
  "Label printing",
];
const kindNames: Record<string, Kind> = {
  Openings: "openings",
  Walls: "walls",
  "Door types": "doorTypes",
  Hardware: "hardware",
};
const categories = [
  "Door brands",
  "Door materials",
  "Windows",
  "Handing",
  "Fire ratings",
  "Frame brands",
  "Frame types",
  "Anchors",
  "Hardware brands",
  "Hardware components",
  "Frame modifications",
  "Door modifications",
  "Material reference",
];
async function readAll(table: string, order: string) {
  const rows: unknown[] = [];
  for (let start = 0; ; start += 500) {
    const result = await supabase
      .from(table)
      .select("*")
      .order(order)
      .range(start, start + 499);
    if (result.error) return { data: null, error: result.error };
    rows.push(...result.data);
    if (result.data.length < 500) return { data: rows, error: null };
  }
}
const initials = (s: string) =>
  s
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
function Brand() {
  return (
    <div className="brand" aria-label="Fortified Doorworks">
      <Image
        className="brand-logo"
        src="/fortified-doorworks-logo.png"
        alt="Fortified Doorworks"
        width={612}
        height={422}
        priority
      />
    </div>
  );
}
function Login({ onReady }: { onReady: () => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState("signin");
  return (
    <main className="login">
      <section>
        <Brand />
        <div className="login-copy">
          <span className="eyebrow">THE PRODUCTION WORKSPACE</span>
          <h1>
            Every opening.
            <br />
            Every detail.
          </h1>
          <p>
            From project takeoff to the last hardware package. One place to keep
            the shop moving.
          </p>
          <div className="login-line">
            <Layers /> Projects <span>/</span> Production <span>/</span>{" "}
            Delivery
          </div>
        </div>
        <small>Fortified Doorworks LLC · Logan, Utah</small>
      </section>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const r =
              mode === "signup"
                ? await supabase.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: window.location.origin },
                  })
                : await supabase.auth.signInWithPassword({ email, password });
            if (r.error) throw r.error;
            if (r.data.session) onReady();
            else
              setMessage(
                "Check your email and click the confirmation link, then return here to sign in. If the confirmation opens an unavailable page, return here and try signing in; your email may already be confirmed.",
              );
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Sign-in failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="eyebrow">WELCOME TO THE WORKSPACE</span>
        <h2>{mode === "signup" ? "Create your account" : "Sign in"}</h2>
        <p>Access is limited to approved team members.</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
          <ArrowUpRight size={16} />
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage("");
          }}
        >
          {mode === "signin"
            ? "First time here? Create your account"
            : "Already registered? Sign in"}
        </button>
      </form>
    </main>
  );
}
export default function Workspace() {
  const router = useRouter();
  const pathname = usePathname();
  const routeParams = useParams<{ projectId?: string; phaseId?: string }>();
  const [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [demo, setDemo] = useState(false),
    [email, setEmail] = useState("");
  const [profileName, setProfileName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [profileUserId, setProfileUserId] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("operator");
  const [accessApproved, setAccessApproved] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]),
    [contractors, setContractors] = useState<Contractor[]>([]),
    [catalogs, setCatalogs] = useState<Catalog[]>([]),
    [vendors, setVendors] = useState<Vendor[]>([]);
  const [active, setActive] = useState<Project | null>(null),
    [phaseDetail, setPhaseDetail] = useState(false),
    [view, setView] = useState("Dashboard"),
    [section, setSection] = useState("Overview"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All statuses"),
    [building, setBuilding] = useState("All buildings");
  const [projectSort, setProjectSort] = useState<{ key: ProjectSortKey; direction: "asc" | "desc" }>({ key: "updated_at", direction: "desc" });
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [edit, setEdit] = useState<{
      title: string;
      fields: Field[];
      initial: Row;
      save: (r: Row) => void;
    } | null>(null);
  const [mobile, setMobile] = useState(false),
    [tableQuery, setTableQuery] = useState(""),
    [page, setPage] = useState(0),
    [cat, setCat] = useState("Door brands");
  const [labelKind, setLabelKind] = useState("Doors"),
    [selected, setSelected] = useState<string[]>([]),
    [labelMode, setLabelMode] = useState("all");
  const [splitOpen, setSplitOpen] = useState(false),
    [splitFirstName, setSplitFirstName] = useState(""),
    [splitSecondName, setSplitSecondName] = useState(""),
    [splitSecondIds, setSplitSecondIds] = useState<string[]>([]);
  const [duplicateConfirmationOpen, setDuplicateConfirmationOpen] =
    useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ project: Project; phase?: ProjectPhase } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletionRevision, setDeletionRevision] = useState(0);
  const [scannedItem, setScannedItem] = useState("");
  const [scannedKind, setScannedKind] = useState("");
  const operation = useRef(false);
  const scanOpened = useRef("");
  const profileReturnPath = useRef("/");
  async function load() {
    setLoading(true);
    setError("");
    try {
      if (
        process.env.NODE_ENV === "development" &&
        new URLSearchParams(location.search).has("preview")
      ) {
        const r = await fetch("/api/local-preview");
        const data = await r.json();
        setProjects(data.projects);
        setContractors(data.contractors);
        setCatalogs(data.catalogs);
        setVendors([]);
        setDemo(true);
        setAccessApproved(true);
        setEmail("Local preview");
        setProfileName("Local preview");
        setAccountName("Local preview");
        setProfileEmail("");
        setReady(true);
        return;
      }
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        setReady(false);
        return;
      }
      setEmail(user.email || "");
      setProfileEmail(user.email || "");
      setProfileUserId(user.id);
      setProfileAvatar(
        typeof user.user_metadata?.avatar_url === "string"
          ? user.user_metadata.avatar_url
          : "",
      );
      const member = await supabase
        .from("workspace_members")
        .select("email,role,display_name")
        .eq("email", (user.email || "").toLowerCase())
        .maybeSingle();
      if (member.error) throw member.error;
      if (!member.data || !isWorkspaceRole(member.data.role)) {
        setAccessApproved(false);
        setReady(true);
        throw new Error(
          "Your account is signed in but has not been approved for this workspace. Ask the workspace owner to add your email.",
        );
      }
      setRole(member.data.role);
      setAccessApproved(true);
      const displayName = getProfileDisplayName(
        user.user_metadata?.full_name || user.user_metadata?.name,
        member.data.display_name,
        user.email || "",
      );
      setProfileName(displayName);
      setAccountName(displayName);
      const all = await Promise.all([
        readAll("projects", "id"),
        readAll("contractors", "id"),
        readAll("catalogs", "id"),
        readAll("vendors", "name"),
      ]);
      for (const r of all) if (r.error) throw r.error;
      setProjects(
        ((all[0].data as Project[]) || [])
          .map(normalizeProject)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      );
      setContractors(
        ((all[1].data as Contractor[]) || []).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setCatalogs(
        ((all[2].data as Catalog[]) || []).sort((a, b) =>
          a.value.localeCompare(b.value),
        ),
      );
      setVendors(
        ((all[3].data as Vendor[]) || []).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setReady(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : str((e as { message?: string }).message) ||
              "Unable to load workspace.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { setReady(false); setAccessApproved(false); return; }
      const result = await supabase.from("workspace_members").select("role")
        .eq("email", (user.email || "").toLowerCase()).maybeSingle();
      if (cancelled || result.error) return;
      if (!result.data || !isWorkspaceRole(result.data.role)) {
        setAccessApproved(false); setProjects([]); setActive(null);
        setContractors([]); setCatalogs([]); setVendors([]);
        setError("Your workspace access has been revoked. Contact a Global Admin.");
      } else { setRole(result.data.role); }
    }
    const interval = window.setInterval(() => void checkAccess(), 60_000);
    const focus = () => void checkAccess();
    window.addEventListener("focus", focus);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener("focus", focus); };
  }, [ready, demo]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    setPage(0);
  }, [tableQuery, section, cat]);
  useEffect(() => {
    if (!ready || demo) return;
    let alive = true;
    const refreshVendors = async () => {
      const { data } = await supabase.from("vendors").select("*").order("name");
      if (alive && data) setVendors(data as Vendor[]);
    };
    const timer = window.setInterval(() => void refreshVendors(), 15_000);
    window.addEventListener("focus", refreshVendors);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVendors);
    };
  }, [ready, demo]);
  const derived = useMemo(
    () => (active ? derive(active.data) : null),
    [active],
  );
  const summaries = useMemo(
    () =>
      projects.map((p) => {
        const phases = p.data.phases?.length
          ? p.data.phases
          : [{ id: p.data.activePhaseId || "legacy", name: "Phase 1", createdAt: p.updated_at, data: p.data }];
        const phaseData = phases.map((phase) => ({
          content: phase.data,
          computed: derive(phase.data),
        }));
        const totalStages = phaseData.reduce(
          (sum, phase) =>
            sum +
            phase.computed.frames.length * stages.length,
          0,
        );
        const completedStages = phaseData.reduce(
          (sum, phase) =>
            sum +
            phase.computed.frames.reduce(
              (count, opening) =>
                count +
                stages.filter(
                  (stage) => phase.content.milestones[opening.id]?.[stage],
                ).length,
              0,
            ),
          0,
        );
        return {
          ...p,
          computed: {
            frames: phaseData.flatMap((phase) => phase.computed.frames),
            progress: totalStages
              ? Math.round((completedStages / totalStages) * 100)
              : 0,
            phaseCount: phases.length,
          },
        };
      }),
    [projects],
  );
  const contractorNames = useMemo(
    () => new Map(contractors.map((contractor) => [contractor.id, contractor.name])),
    [contractors],
  );
  const visible = summaries.filter(
    (p) =>
      (filter === "All statuses"
        ? p.status !== "Archived"
        : p.status === filter) &&
      (building === "All buildings" || p.building === building) &&
      [
        p.name,
        p.building,
        p.pm,
        p.jobsite,
        contractors.find((c) => c.id === p.contractor_id)?.name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  ).sort((a, b) =>
    compareProjects(a, b, projectSort.key, projectSort.direction, contractorNames),
  );
  function sortProjects(key: ProjectSortColumnKey) {
    setProjectSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  }
  function projectColumn(label: string, key: ProjectSortColumnKey) {
    return <button type="button" className="project-sort" onClick={() => sortProjects(key)} aria-label={`Sort by ${label}`}>
      {label}<span aria-hidden="true">{projectSort.key === key ? (projectSort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>;
  }
  function message(e: unknown) {
    return e instanceof Error
      ? e.message
      : str((e as { message?: string })?.message) || "Something went wrong.";
  }
  function update(p: Project) {
    setActive(p);
    setDirty(true);
    setNotice("");
  }
  function updateData(data: ProjectData) {
    if (active) update({ ...active, data: persistActivePhase(data) });
  }
  function openProfile() {
    if (pathname !== "/profile") profileReturnPath.current = pathname || "/";
    setProfileName(accountName || getProfileDisplayName(null, null, email));
    setProfileEmail(email);
    setView("Profile");
    setMobile(false);
    setProfileMessage("");
    setProfileError("");
    router.push("/profile");
  }
  function closeProfile() {
    const returnPath = profileReturnPath.current || "/";
    setView(
      returnPath.startsWith("/projects")
        ? "Projects"
        : returnPath === "/contractors"
          ? "Contractors"
          : returnPath === "/access"
            ? "Access"
            : returnPath === "/vendors"
              ? "Vendors"
              : returnPath === "/settings"
                ? "Settings"
                : "Dashboard",
    );
    router.push(returnPath);
  }
  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = profileName.trim();
    const nextEmail = profileEmail.trim().toLowerCase();
    if (!nextName || !nextEmail) {
      setProfileError("Enter your name and email address.");
      return;
    }
    setProfileSaving(true);
    setProfileError("");
    setProfileMessage("");
    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!data.user) throw new Error("Sign in again to update your profile.");
      const { error: nameError } = await supabase.auth.updateUser({
        data: { ...data.user.user_metadata, full_name: nextName },
      });
      if (nameError) throw nameError;
      setProfileName(nextName);
      setAccountName(nextName);

      if (nextEmail !== (data.user.email || "").toLowerCase()) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: nextEmail,
        });
        if (emailError)
          throw new Error(
            `Your name was saved, but the email update failed: ${emailError.message}`,
          );
        setProfileMessage(
          `Your name was saved. Confirm the link sent to ${nextEmail} to finish changing your email.`,
        );
      } else {
        setProfileMessage("Your profile was saved.");
      }
    } catch (error) {
      setProfileError(message(error));
    } finally {
      setProfileSaving(false);
    }
  }
  async function uploadProfileAvatar(file: File | undefined) {
    if (!file) return;
    if (!isValidAvatarFile(file)) {
      setProfileError("Choose a JPEG, PNG, or WebP image under 2 MB.");
      return;
    }
    if (!profileUserId || demo) {
      setProfileError("Profile pictures are unavailable in local preview.");
      return;
    }
    setAvatarBusy(true);
    setProfileError("");
    setProfileMessage("");
    try {
      const path = `${profileUserId}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "60",
          contentType: file.type,
          upsert: true,
        });
      if (uploadError) throw uploadError;
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user)
        throw new Error("Sign in again to update your profile picture.");
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { ...userData.user.user_metadata, avatar_url: avatarUrl },
      });
      if (metadataError) throw metadataError;
      setProfileAvatar(avatarUrl);
      setProfileMessage("Your profile picture was updated.");
    } catch (error) {
      setProfileError(message(error));
    } finally {
      setAvatarBusy(false);
    }
  }
  async function removeProfileAvatar() {
    if (!profileUserId || demo) return;
    setAvatarBusy(true);
    setProfileError("");
    setProfileMessage("");
    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!data.user)
        throw new Error("Sign in again to update your profile picture.");
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { ...data.user.user_metadata, avatar_url: "" },
      });
      if (metadataError) throw metadataError;
      setProfileAvatar("");
      const { error: removeError } = await supabase.storage
        .from("avatars")
        .remove([`${profileUserId}/avatar`]);
      if (removeError) throw removeError;
      setProfileMessage("Your profile picture was removed.");
    } catch (error) {
      setProfileError(message(error));
    } finally {
      setAvatarBusy(false);
    }
  }
  async function signOut() {
    if (dirty && !confirm("Discard unsaved changes and sign out?")) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setProfileError(message(signOutError));
      return;
    }
    setReady(false);
    setActive(null);
    setProjects([]);
    setProfileUserId("");
    setView("Dashboard");
    router.push("/");
  }
  function navigate(v: string) {
    if (dirty && !confirm("Discard your unsaved project changes?")) return;
    setActive(null);
    setDirty(false);
    setView(v);
    setMobile(false);
    setError("");
    router.push(v === "Dashboard" ? "/" : `/${v.toLowerCase()}`);
  }
  function open(p: Project) {
    router.push(`/projects/${p.id}`);
    setActive(structuredClone(normalizeProject(p)));
    setPhaseDetail(false);
    setDirty(false);
    setSection("Overview");
    setTableQuery("");
    setSelected([]);
  …20171 tokens truncated…                projectId={active.id}
                  phaseId={activePhase(active.data).id}
                  openings={derived.frames}
                  email={email}
                  manager={canManageProduction(role)}
                  demo={demo}
                  scannedOpeningId={scannedItem}
                  scannedKind={scannedKind}
                  onMilestone={recordWorkMilestone}
                />
                <AnchorPackage
                  data={activePhase(active.data).data}
                  onChange={(phaseData) => updateData({ ...active.data, ...phaseData })}
                />
                <InstallationEstimator
                  data={activePhase(active.data).data}
                  onChange={(phaseData) => updateData({ ...active.data, ...phaseData })}
                />
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Production board</h2>
                      <p>
                        Check a milestone to record today’s date. Click its date
                        to correct it.
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => exportPDF("Build sheet")}
                    >
                      <Download size={16} /> Build sheet
                    </button>
                  </div>
                  {scannedItem && (
                    <div className="scan-action-card" role="status">
                      <div>
                        <strong>{scannedKind} label scanned</strong>
                        <p>
                          {derived.frames.find((row) => row.id === scannedItem)
                            ?.name || scannedItem} — verify this is the right item, then record its next stage.
                        </p>
                      </div>
                      <button className="button" onClick={completeScannedStep}>
                        Record next stage
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setScannedItem("");
                          setScannedKind("");
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                  <div className="table-toolbar">
                    <div className="search">
                      <Search size={16} />
                      <input
                        aria-label="Search production openings"
                        placeholder="Search opening mark…"
                        value={tableQuery}
                        onChange={(e) => setTableQuery(e.target.value)}
                      />
                    </div>
                    <span className="label">{derived.progress}% complete</span>
                  </div>
                  <div className="table-scroll production">
                    <table>
                      <thead>
                        <tr>
                          <th>Opening</th>
                          {stages.map((s) => (
                            <th key={s}>{s}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {derived.frames
                          .filter((o) =>
                            str(o.name)
                              .toLowerCase()
                              .includes(tableQuery.toLowerCase()),
                          )
                          .map((o) => (
                            <tr key={o.id}>
                              <td className="strong">{o.name}</td>
                              {stages.map((s) => {
                                const date =
                                  active.data.milestones[o.id]?.[s] || "";
                                return (
                                  <td key={s}>
                                    <input
                                      aria-label={`${o.name}: ${s}`}
                                      type="checkbox"
                                      checked={!!date}
                                      onChange={(e) =>
                                        updateData({
                                          ...active.data,
                                          milestones: {
                                            ...active.data.milestones,
                                            [o.id]: {
                                              ...active.data.milestones[o.id],
                                              [s]: e.target.checked
                                                ? new Date().toLocaleDateString(
                                                    "en-CA",
                                                  )
                                                : "",
                                            },
                                          },
                                        })
                                      }
                                    />
                                    {date && (
                                      <input
                                        aria-label={`${o.name}: ${s} date`}
                                        type="date"
                                        value={date === "Complete" ? "" : date}
                                        onChange={(e) =>
                                          updateData({
                                            ...active.data,
                                            milestones: {
                                              ...active.data.milestones,
                                              [o.id]: {
                                                ...active.data.milestones[o.id],
                                                [s]:
                                                  e.target.value || "Complete",
                                              },
                                            },
                                          })
                                        }
                                      />
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                </>
              )}
              {section === "Documents" && (
                <>
                  <ElevationBuilder
                    openings={activePhase(active.data).data.openings}
                    drawings={activePhase(active.data).data.elevations || []}
                    onChange={(elevations) => updateData({ ...active.data, elevations })}
                  />
                  <DoorProductionForms
                    openings={activePhase(active.data).data.openings}
                    woodOrders={activePhase(active.data).data.woodDoorOrders || []}
                    machiningSpecs={activePhase(active.data).data.machiningSpecs || []}
                    onWoodOrders={(woodDoorOrders) => updateData({ ...active.data, woodDoorOrders })}
                    onMachiningSpecs={(machiningSpecs) => updateData({ ...active.data, machiningSpecs })}
                  />
                  <div className="document-grid">
                    {[
                      "Submittal",
                      "Takeoff",
                      "Opening schedule",
                      "Build sheet",
                      "Elevation drawings",
                      "Wood door order form",
                      "Door machining specifications",
                    ].map((t) => (
                      <button
                        className="document-card"
                        disabled={busy}
                        key={t}
                        onClick={() => exportPDF(t)}
                      >
                        <span className="document-icon">
                          <FileText />
                        </span>
                        <h3>{t}</h3>
                        <span>
                          Download PDF <ArrowUpRight size={16} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <section className="panel reference-panel">
                    <div className="panel-heading">
                      <h2>Document references</h2>
                      <button
                        className="text-button"
                        onClick={() =>
                          setEdit({
                            title: "Add document reference",
                            fields: [
                              {
                                key: "name",
                                label: "Reference",
                                required: true,
                              },
                              { key: "page", label: "Document / page number" },
                              { key: "selection", label: "Selection" },
                            ],
                            initial: { id: crypto.randomUUID() },
                            save: (r) => {
                              updateData({
                                ...active.data,
                                references: [...active.data.references, r],
                              });
                              setEdit(null);
                            },
                          })
                        }
                      >
                        <Plus size={16} /> Add reference
                      </button>
                    </div>
                    <div className="reference-list">
                      {active.data.references.map((r) => (
                        <div key={r.id}>
                          <strong>{r.name}</strong>
                          <input
                            aria-label={r.name + " page"}
                            placeholder="Document / page"
                            value={str(r.page)}
                            onChange={(e) =>
                              updateData({
                                ...active.data,
                                references: active.data.references.map((x) =>
                                  x.id === r.id
                                    ? { ...x, page: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                          <input
                            aria-label={r.name + " selection"}
                            placeholder="Selection"
                            value={str(r.selection)}
                            onChange={(e) =>
                              updateData({
                                ...active.data,
                                references: active.data.references.map((x) =>
                                  x.id === r.id
                                    ? { ...x, selection: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                          <button
                            className="icon-button"
                            aria-label={"Remove " + r.name}
                            onClick={() =>
                              updateData({
                                ...active.data,
                                references: active.data.references.filter(
                                  (x) => x.id !== r.id,
                                ),
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="links">
                      <label>
                        Submittal links (one URL per line)
                        <textarea
                          value={active.data.links.join("\n")}
                          onChange={(e) =>
                            updateData({
                              ...active.data,
                              links: e.target.value.split("\n"),
                            })
                          }
                        />
                      </label>
                      {active.data.links
                        .filter((url) => /^https?:\/\//i.test(url))
                        .map((url, i) => (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            key={i}
                          >
                            Open linked document {i + 1}{" "}
                            <ArrowUpRight size={14} />
                          </a>
                        ))}
                    </div>
                  </section>
                  <div className="section-heading">
                    <p>
                      Download a complete project backup, including any unsaved
                      changes.
                    </p>
                    <button className="button secondary" onClick={backup}>
                      Export JSON backup
                    </button>
                  </div>
                </>
              )}
              {section === "Label printing" && (
                <>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Print labels</h2>
                        <p>{labelKind === "Anchors"
                          ? "One consolidated anchor package label for this phase."
                          : "One label per opening. Long hardware lists continue onto additional labels."}</p>
                      </div>
                    </div>
                    <div className="label-controls">
                      <label>
                        Label contents
                        <select
                          value={labelKind}
                          onChange={(e) => setLabelKind(e.target.value)}
                        >
                          {["Doors", "Frames", "Hardware", "Anchors"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Opening selection
                        <select
                          value={labelMode}
                          onChange={(e) => setLabelMode(e.target.value)}
                        >
                          <option value="all">All active openings</option>
                          <option value="selected">
                            Choose openings below
                          </option>
                        </select>
                      </label>
                    </div>
                    <div className="opening-chips">
                      {derived.frames.map((o) => (
                        <label
                          className={selected.includes(o.id) ? "chosen" : ""}
                          key={o.id}
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(o.id)}
                            onChange={(e) => {
                              setLabelMode("selected");
                              setSelected(
                                e.target.checked
                                  ? [...selected, o.id]
                                  : selected.filter((id) => id !== o.id),
                              );
                            }}
                          />
                          {o.name}
                        </label>
                      ))}
                    </div>
                    <div className="label-actions">
                      <button
                        className="button"
                        disabled={
                          busy ||
                          derived.frames.length === 0 ||
                          (labelKind !== "Anchors" && labelMode === "selected" && !selected.length)
                        }
                        onClick={() => exportPDF("labels")}
                      >
                        <Download size={16} /> Generate labels
                      </button>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          </div>
          )}
        </main>
      </div>
      {edit && (
        <Editor
          key={edit.initial.id + edit.title}
          {...edit}
          onSave={edit.save}
          externalError={error}
          busy={busy}
          onClose={() => setEdit(null)}
        />
      )}
      {splitOpen && active && (
        <PhaseSplitDialog
          phase={activePhase(active.data)}
          firstName={splitFirstName}
          secondName={splitSecondName}
          secondOpeningIds={splitSecondIds}
          error={error}
          onFirstName={setSplitFirstName}
          onSecondName={setSplitSecondName}
          onToggle={(id, checked) =>
            setSplitSecondIds((ids) =>
              checked ? [...ids, id] : ids.filter((value) => value !== id),
            )
          }
          onClose={() => setSplitOpen(false)}
          onConfirm={confirmPhaseSplit}
        />
      )}
      {deleteTarget && <DeleteTargetDialog name={deleteTarget.phase?.name || deleteTarget.project.name} phase={!!deleteTarget.phase} busy={busy} error={deleteError} onClose={() => setDeleteTarget(null)} onConfirm={(confirmation) => void deleteWorkspaceTarget(confirmation)} />}
      {duplicateConfirmationOpen && active && (
        <DuplicateProjectDialog
          projectName={active.name}
          busy={busy}
          onClose={() => setDuplicateConfirmationOpen(false)}
          onConfirm={() => {
            setDuplicateConfirmationOpen(false);
            void duplicate();
          }}
        />
      )}
    </div>
  );
}
function DuplicateProjectDialog({
  projectName,
  busy,
  onClose,
  onConfirm,
}: {
  projectName: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog ref={dialog} className="editor split-editor" onCancel={onClose}>
      <header>
        <div>
          <span className="eyebrow">DUPLICATE PROJECT</span>
          <h2>Make a copy of {projectName}?</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </header>
      <div className="duplicate-project-copy">
        <p>The copy will be a separate project and will include:</p>
        <ul>
          <li>
            Project details, every phase, and all opening and takeoff data.
          </li>
          <li>Attached project and phase documents.</li>
          <li>
            New project, phase, and opening IDs, so the copy is independent.
          </li>
        </ul>
        <p>
          Production milestones and takeoff selections will be cleared, and the
          copy will start in Planning. The original project will not change.
        </p>
      </div>
      <footer>
        <button
          type="button"
          className="button secondary"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button"
          onClick={onConfirm}
          disabled={busy}
        >
          <Copy size={16} /> Duplicate project
        </button>
      </footer>
    </dialog>
  );
}
function PhaseSplitDialog({
  phase,
  firstName,
  secondName,
  secondOpeningIds,
  error,
  onFirstName,
  onSecondName,
  onToggle,
  onClose,
  onConfirm,
}: {
  phase: ProjectPhase;
  firstName: string;
  secondName: string;
  secondOpeningIds: string[];
  error: string;
  onFirstName: (value: string) => void;
  onSecondName: (value: string) => void;
  onToggle: (id: string, checked: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog ref={dialog} className="editor split-editor" onCancel={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <header>
          <div>
            <span className="eyebrow">SPLIT WORK PACKAGE</span>
            <h2>Split {phase.name}</h2>
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
        <div className="form-grid split-name-fields">
          <label>
            First phase
            <input
              required
              value={firstName}
              onChange={(event) => onFirstName(event.target.value)}
            />
          </label>
          <label>
            Second phase
            <input
              required
              value={secondName}
              onChange={(event) => onSecondName(event.target.value)}
            />
          </label>
        </div>
        <section className="split-allocation">
          <div>
            <h3>Assign openings</h3>
            <p>Selected openings move to the second phase. The rest stay in the first.</p>
          </div>
          {phase.data.openings.length ? (
            <div className="split-opening-list">
              {phase.data.openings.map((opening) => (
                <label key={opening.id}>
                  <input
                    type="checkbox"
                    checked={secondOpeningIds.includes(opening.id)}
                    onChange={(event) => onToggle(opening.id, event.target.checked)}
                  />
                  <span>{str(opening.name) || "Unnamed opening"}</span>
                  <small>
                    {str(opening.room) || str(opening.doorType) || "Opening"}
                  </small>
                </label>
              ))}
            </div>
          ) : (
            <p className="empty-phase-note">This phase has no openings yet. Both new phases will start empty.</p>
          )}
        </section>
        {error && <p role="alert" className="error split-error">{error}</p>}
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button">Create phases</button>
        </footer>
      </form>
    </dialog>
  );
}
function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <span className="metric-icon">{icon}</span>
    </div>
  );
}
