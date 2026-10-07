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
  const [role, setRole] = useState<"operator" | "manager">("operator");
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
        .maybeSingle();
      if (member.error) throw member.error;
      if (!member.data) {
        setReady(true);
        throw new Error(
          "Your account is signed in but has not been approved for this workspace. Ask the workspace owner to add your email.",
        );
      }
      setRole(member.data.role === "manager" ? "manager" : "operator");
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
    setNotice("");
    setError("");
    setMobile(false);
  }
  useEffect(() => {
    if (pathname === "/profile") {
      setView("Profile");
      return;
    }
    if (pathname === "/") setView("Dashboard");
    if (pathname === "/projects") setView("Projects");
    if (pathname === "/settings") setView("Settings");
    if (pathname === "/contractors") setView("Contractors");
    if (!ready || !projects.length || !routeParams?.projectId) return;
    const project = projects.find((item) => item.id === routeParams.projectId);
    if (!project) return;
    const normalized = normalizeProject(project);
    setActive((current) => current?.id === project.id ? current : structuredClone(normalized));
    setView("Projects");
    setDirty(false);
    setSection("Overview");
    const routePhase = normalized.data.phases?.find((item) => item.id === routeParams.phaseId);
    setPhaseDetail(Boolean(routePhase));
    if (routeParams.phaseId) {
      if (routePhase) setActive((current) => {
        const source = current?.id === project.id ? current : normalized;
        return source.data.activePhaseId === routePhase.id ? source : selectPhase(source, routePhase.id);
      });
    }
  }, [ready, projects, pathname, routeParams?.projectId, routeParams?.phaseId]);
  useEffect(() => {
    if (!ready || !projects.length) return;
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project");
    const phaseId = params.get("phase");
    const itemId = params.get("item");
    const kind = params.get("kind") || "Doors";
    if (!projectId || !phaseId || (!itemId && kind !== "Anchors")) return;
    const token = `${projectId}:${phaseId}:${itemId || kind}`;
    if (scanOpened.current === token) return;
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const normalized = normalizeProject(project);
    const resolvedPhaseId = kind === "Anchors"
      ? normalized.data.phases?.some((phase) => phase.id === phaseId) ? phaseId : null
      : resolvePhaseForOpening(normalized.data, phaseId, itemId || "");
    if (!resolvedPhaseId) return;
    scanOpened.current = token;
    setActive(selectPhase(normalized, resolvedPhaseId));
    setPhaseDetail(true);
    setDirty(false);
    setSection("Production");
    setScannedItem(kind === "Anchors" ? "" : itemId || "");
    setScannedKind(kind);
    setSelected([]);
    const resolvedName = normalized.data.phases?.find((phase) => phase.id === resolvedPhaseId)?.name;
    setNotice(kind === "Anchors"
      ? `Anchor package label opened${resolvedName ? ` for ${resolvedName}` : ""}. Review the phase anchor takeoff and stage this package with its frames.`
      : `${resolvedPhaseId === phaseId ? "QR label" : "Older QR label"} opened for ${itemId}${resolvedName ? ` in ${resolvedName}` : ""}. Choose the production or fulfillment action below.`);
    setError("");
  }, [ready, projects]);
  function switchPhase(id: string) {
    if (!active) return;
    if (id === active.data.activePhaseId && phaseDetail) return;
    setActive(selectPhase(active, id));
    setPhaseDetail(true);
    setDirty(true);
    setNotice("");
    setSection("Overview");
    setSelected([]);
    router.push(`/projects/${active.id}/phases/${id}`);
  }
  function createPhase() {
    if (!active) return;
    const name = window.prompt("Name this phase", `Phase ${(active.data.phases || []).length + 1}`)?.trim();
    if (!name) return;
    if ((active.data.phases || []).some((phase) => phase.name.toLowerCase() === name.toLowerCase())) {
      setError("Choose a phase name that is not already in use.");
      return;
    }
    const blank = newProject().data.phases![0].data;
    const phase: ProjectPhase = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), data: structuredClone(blank) };
    const next = { ...active, data: { ...active.data, phases: [...(active.data.phases || []), phase] } };
    setActive(next);
    setDirty(true);
    setNotice("Phase created. Save changes to keep it.");
    setError("");
  }
  function renamePhase(phase: ProjectPhase) {
    if (!active) return;
    const name = window.prompt("Rename phase", phase.name)?.trim();
    if (!name || name === phase.name) return;
    if ((active.data.phases || []).some((item) => item.id !== phase.id && item.name.toLowerCase() === name.toLowerCase())) {
      setError("Choose a phase name that is not already in use.");
      return;
    }
    setActive({ ...active, data: { ...active.data, phases: (active.data.phases || []).map((item) => item.id === phase.id ? { ...item, name } : item) } });
    setDirty(true);
    setNotice("Phase renamed. Save changes to keep it.");
    setError("");
  }
  function completeScannedStep() {
    if (!active || !scannedItem || !derived) return;
    const opening = derived.frames.find((row) => row.id === scannedItem);
    if (!opening) {
      setNotice("This QR code points to an item that is not in the selected phase. Check that you scanned the label for this phase.");
      return;
    }
    const kindStages =
      scannedKind === "Frames"
        ? stages.slice(0, 3)
        : scannedKind === "Doors"
          ? stages.slice(3, 6)
          : stages.slice(6);
    const next = kindStages.find(
      (stage) => !active.data.milestones[opening.id]?.[stage],
    );
    if (!next) {
      setNotice(`${opening.name} has all production and fulfillment milestones recorded.`);
      return;
    }
    updateData({
      ...active.data,
      milestones: {
        ...active.data.milestones,
        [opening.id]: {
          ...active.data.milestones[opening.id],
          [next]: new Date().toLocaleDateString("en-CA"),
        },
      },
    });
    setNotice(`${opening.name}: recorded “${next}” for ${email || "this team member"}. Save the project to sync the update.`);
  }
  function recordWorkMilestone(openingId: string, stage: string) {
    if (!active) return;
    updateData({
      ...active.data,
      milestones: {
        ...active.data.milestones,
        [openingId]: {
          ...active.data.milestones[openingId],
          [stage]: new Date().toLocaleDateString("en-CA"),
        },
      },
    });
  }
  function beginPhaseSplit() {
    if (!active) return;
    const current = activePhase(active.data);
    setSplitFirstName(current.name + " A");
    setSplitSecondName(current.name + " B");
    setSplitSecondIds([]);
    setSplitOpen(true);
    setError("");
  }
  async function confirmPhaseSplit() {
    if (!active) return;
    try {
      const next = makeSplit(
        active,
        splitFirstName,
        splitSecondName,
        splitSecondIds,
      );
      setActive(next);
      setPhaseDetail(true);
      setDirty(true);
      setSplitOpen(false);
      setSection("Overview");
      setSelected([]);
      setNotice("Saving phase split…");
      setError("");
      if (await saveProject(next)) setNotice("Phase split created and saved.");
      else setNotice("Phase split could not be saved. Fix the issue and save changes.");
    } catch (e) {
      setError(message(e));
    }
  }
  async function saveProject(projectToSave = active): Promise<boolean> {
    if (!projectToSave || operation.current) return false;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      const draft = {
        ...projectToSave,
        data: persistActivePhase(projectToSave.data),
      };
      let saved: Project;
      if (demo)
        saved = {
          ...draft,
          version: draft.version + 1,
          updated_at: new Date().toISOString(),
        };
      else {
        const { id, version } = draft;
        // `active` can come from a project-list summary, which adds a derived
        // `computed` field. Send only columns that exist on public.projects.
        const payload = {
          name: draft.name,
          building: draft.building,
          contractor_id: draft.contractor_id,
          start_date: draft.start_date,
          pm: draft.pm,
          jobsite: draft.jobsite,
          scope: draft.scope,
          cuts: draft.cuts,
          status: draft.status,
          source_id: draft.source_id,
          data: draft.data,
        };
        const r = await supabase
          .from("projects")
          .update(payload)
          .eq("id", id)
          .eq("version", version)
          .select()
          .maybeSingle();
        if (r.error) throw r.error;
        if (!r.data)
          throw new Error(
            "This project changed in another session. Your edits are still here. Export a JSON backup, then reload to reconcile the changes.",
          );
        saved = r.data;
      }
      setProjects((ps) => ps.map((p) => (p.id === saved.id ? saved : p)));
      setActive(saved);
      setDirty(false);
      setNotice("Project saved.");
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
      operation.current = false;
    }
  }
  const projectFields: Field[] = [
    { key: "name", label: "Project Name", required: true },
    { key: "building", label: "Building / master project" },
    {
      key: "contractor_id",
      label: "Contractor",
      options: contractors.map((c) => c.name),
    },
    { key: "start_date", label: "Start date", type: "date" },
    { key: "pm", label: "Project manager" },
    { key: "jobsite", label: "Jobsite" },
    { key: "status", label: "Status", options: statuses, required: true },
    { key: "scope", label: "Scope of work", type: "textarea" },
    { key: "cuts", label: "Cuts / notes", type: "textarea" },
  ];
  function projectEditor(p: Project, create = false) {
    setEdit({
      title: create ? "Create project" : "Project details",
      fields: create
        ? [
            ...projectFields,
            {
              key: "template",
              label: "Copy schedules from (optional)",
              options: projects.map((p) => p.name),
            },
          ]
        : projectFields,
      initial: {
        ...p,
        contractor_id:
          contractors.find((c) => c.id === p.contractor_id)?.name || "",
        id: p.id,
      } as unknown as Row,
      save: async (r) => {
        if (operation.current) return;
        const contractor = contractors.find((c) => c.name === r.contractor_id);
        if (r.contractor_id && !contractor) {
          setError("Add this contractor in Settings first.");
          return;
        }
        if (!statuses.includes(str(r.status))) {
          setError("Choose a listed project status.");
          return;
        }
        const { template, ...record } = r;
        const next = {
          ...p,
          ...record,
          contractor_id: contractor?.id || null,
          start_date: r.start_date || null,
        } as unknown as Project;
        if (create && template) {
          const source = projects.find((x) => x.name === template);
          if (!source) {
            setError("Choose an existing project template.");
            return;
          }
          const templateData = structuredClone(activePhase(source.data).data);
          const fresh = newProject().data;
          next.data = {
            ...templateData,
            openings: [],
            milestones: {},
            takeoffSelection: {},
            links: [],
            references: templateData.references.map((r) => ({
              ...r,
              page: "",
              selection: "",
            })),
            phases: fresh.phases,
            activePhaseId: fresh.activePhaseId,
            phaseHistory: [],
          };
          next.data = persistActivePhase(next.data);
        }
        if (!create) {
          update(next);
          setEdit(null);
          return;
        }
        operation.current = true;
        setBusy(true);
        try {
          if (!demo) {
            const result = await supabase
              .from("projects")
              .insert(next)
              .select()
              .single();
            if (result.error) throw result.error;
            Object.assign(next, result.data);
          }
          setProjects((ps) => [next, ...ps]);
          setEdit(null);
          open(next);
          setNotice("Project created.");
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
          operation.current = false;
        }
      },
    });
  }
  function rowEditor(kind: Kind, row?: Row) {
    if (!active) return;
    const defaultVendor = kind === "hardware" ? vendors.find((vendor) => vendor.name.toLowerCase() === "iml") : undefined;
    const initial = row || {
      id: crypto.randomUUID(),
      ...(kind === "hardware" ? { qty: 1, supplier: defaultVendor?.name || "" } : {}),
    };
    setEdit({
      title: row
        ? "Edit " + (str(row.name) || str(row.component))
        : "Add " +
          {
            walls: "wall type",
            doorTypes: "door type",
            hardware: "hardware item",
            openings: "opening",
          }[kind],
      fields: fields(kind, active.data, catalogs, vendors),
      initial,
      save: (r) => {
        if (!r.supplier && kind === "hardware") r.supplier = defaultVendor?.name || "";
        if (kind === "openings") {
          const frameVendor = supplierFor("openings", r, active.data, vendors);
          if (!r.frameSupplier) r.frameSupplier = frameVendor?.name || "";
          if (!r.brand) r.brand = frameVendor?.name || "";
        }
        const opts = fields(kind, active.data, catalogs, vendors);
        for (const f of opts) {
          if (
            f.options?.length &&
            r[f.key] &&
            !f.options.includes(str(r[f.key]))
          ) {
            setError(
              `Choose an existing ${f.label.toLowerCase()}, or add it in Settings first.`,
            );
            return;
          }
        }
        if (
          kind !== "hardware" &&
          active.data[kind].some(
            (x) =>
              x.id !== r.id &&
              str(x.name).toLowerCase() === str(r.name).toLowerCase(),
          )
        ) {
          setError("That name is already used in this project.");
          return;
        }
        let data = structuredClone(active.data);
        data[kind] = row
          ? data[kind].map((x) => (x.id === r.id ? r : x))
          : [...data[kind], r];
        if (
          row &&
          row.name !== r.name &&
          (kind === "walls" || kind === "doorTypes")
        ) {
          const key = kind === "walls" ? "wall" : "doorType";
          data.openings = data.openings.map((o) =>
            o[key] === row.name ? { ...o, [key]: r.name } : o,
          );
        }
        updateData(data);
        setError("");
        setEdit(null);
      },
    });
  }
  function removeRow(kind: Kind, row: Row) {
    if (!active) return;
    if (kind === "openings") {
      updateData({
        ...active.data,
        openings: active.data.openings.map((r) =>
          r.id === row.id ? { ...r, deleted: !r.deleted } : r,
        ),
      });
      return;
    }
    if (
      (kind === "walls" || kind === "doorTypes") &&
      active.data.openings.some(
        (o) => o[kind === "walls" ? "wall" : "doorType"] === row.name,
      )
    ) {
      setError(
        "This item is used by an opening. Reassign those openings before removing it.",
      );
      return;
    }
    if (!confirm("Remove this item from the project?")) return;
    updateData({
      ...active.data,
      [kind]: active.data[kind].filter((r) => r.id !== row.id),
    });
  }
  async function duplicate() {
    if (!active || operation.current) return;
    const source = structuredClone({
      ...active,
      data: persistActivePhase(active.data),
    });
    const { project: copy, phaseIds } = duplicateProject(source);
    const copiedPaths: string[] = [];
    let projectCreated = false;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("Duplicating project and files…");
    try {
      if (!demo) {
        const { data: inserted, error: projectError } = await supabase
          .from("projects")
          .insert({
            id: copy.id,
            name: copy.name,
            building: copy.building,
            contractor_id: copy.contractor_id,
            start_date: copy.start_date,
            pm: copy.pm,
            jobsite: copy.jobsite,
            scope: copy.scope,
            cuts: copy.cuts,
            status: copy.status,
            source_id: copy.source_id,
            data: copy.data,
            version: copy.version,
            updated_at: copy.updated_at,
          })
          .select()
          .single();
        if (projectError) throw projectError;
        projectCreated = true;
        Object.assign(copy, inserted);

        const { data: documents, error: documentError } = await supabase
          .from("project_documents")
          .select("*")
          .eq("project_id", source.id);
        if (documentError) throw documentError;

        for (const document of documents || []) {
          const id = crypto.randomUUID();
          const phaseId = document.phase_id
            ? phaseIds.get(document.phase_id)
            : null;
          if (document.phase_id && !phaseId) {
            throw new Error(`Could not match the phase for ${document.file_name}.`);
          }
          const safeName = document.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${copy.id}/${phaseId || "project"}/${id}/${safeName}`;
          const { data: file, error: downloadError } = await supabase.storage
            .from("project-documents")
            .download(document.storage_path);
          if (downloadError || !file) {
            throw new Error(downloadError?.message || `Could not read ${document.file_name}.`);
          }
          const { error: uploadError } = await supabase.storage
            .from("project-documents")
            .upload(path, file, {
              contentType: file.type || "application/pdf",
              upsert: false,
            });
          if (uploadError) throw uploadError;
          copiedPaths.push(path);

          const { error: copyError } = await supabase.from("project_documents").insert({
            id,
            project_id: copy.id,
            phase_id: phaseId,
            file_name: document.file_name,
            storage_path: path,
            document_type: document.document_type,
            revision_label: document.revision_label,
            page_count: document.page_count,
            status: document.status,
            analysis: document.analysis,
          });
          if (copyError) throw copyError;
        }
      }
      setProjects((current) => [copy, ...current]);
      open(copy);
      setNotice("Project duplicated with all phases and attached documents. Production milestones were reset.");
    } catch (e) {
      if (copiedPaths.length) {
        await supabase.storage.from("project-documents").remove(copiedPaths);
      }
      if (projectCreated) {
        await supabase.from("project_documents").delete().eq("project_id", copy.id);
        await supabase.from("projects").delete().eq("id", copy.id);
      }
      setNotice("");
      setError(`Could not duplicate project: ${message(e)}`);
    } finally {
      setBusy(false);
      operation.current = false;
    }
  }
  async function exportPDF(type: string, selectedTakeoffOnly = false) {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const { downloadDocument } = await import("@/lib/documents");
      await downloadDocument(active, type, {
        labelKind,
        selectedTakeoffOnly,
        selected: labelMode === "selected" ? selected : undefined,
        contractor: contractors.find((c) => c.id === active.contractor_id)
          ?.name,
      });
      setNotice(type + " PDF downloaded.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function backup() {
    if (!active) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(active, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = active.name.replace(/[^a-z0-9]/gi, "_") + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function settingsEditor(
    type: "contractors" | "catalogs",
    row?: Contractor | Catalog,
  ) {
    const fs: Field[] =
      type === "contractors"
        ? [
            { key: "name", label: "Contractor name", required: true },
            { key: "contact", label: "Contact name" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
          ]
        : [
            {
              key: "category",
              label: "Category",
              options: categories,
              required: true,
            },
            { key: "value", label: "Value", required: true },
            { key: "description", label: "Description", type: "textarea" },
          ];
    setEdit({
      title: row
        ? "Edit record"
        : type === "contractors"
          ? "Add contractor"
          : "Add setting",
      fields: fs,
      initial: (row || {
        id: crypto.randomUUID(),
        category: cat,
      }) as unknown as Row,
      save: async (r) => {
        if (operation.current) return;
        operation.current = true;
        setBusy(true);
        try {
          const payload = Object.fromEntries(
            ["id", ...fs.map((f) => f.key)].map((k) => [k, r[k] || ""]),
          );
          if (!demo) {
            const result = await supabase
              .from(type)
              .upsert(payload)
              .select()
              .single();
            if (result.error) throw result.error;
          }
          if (type === "contractors")
            setContractors((a) => [
              ...a.filter((x) => x.id !== r.id),
              payload as Contractor,
            ]);
          else
            setCatalogs((a) => [
              ...a.filter((x) => x.id !== r.id),
              payload as Catalog,
            ]);
          setEdit(null);
          setNotice("Setting saved.");
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
          operation.current = false;
        }
      },
    });
  }
  async function deleteSetting(
    type: "contractors" | "catalogs",
    row: Contractor | Catalog,
  ) {
    if (
      !confirm(
        "Delete this setting? Existing project values will remain unchanged.",
      )
    )
      return;
    try {
      if (
        type === "contractors" &&
        projects.some((p) => p.contractor_id === row.id)
      )
        throw new Error(
          "This contractor is used by a project. Reassign the projects first.",
        );
      if (!demo) {
        const r = await supabase.from(type).delete().eq("id", row.id);
        if (r.error) throw r.error;
      }
      if (type === "contractors")
        setContractors((x) => x.filter((v) => v.id !== row.id));
      else setCatalogs((x) => x.filter((v) => v.id !== row.id));
    } catch (e) {
      setError(message(e));
    }
  }
  function bulk(kind: Kind) {
    if (!active) return;
    const fs = fields(kind, active.data, catalogs, vendors);
    setError("");
    setEdit({
      title: "Paste " + kind + " rows",
      fields: [
        {
          key: "text",
          label:
            "Paste CSV or tab-separated rows. Header row: " +
            fs.map((f) => f.key).join(", "),
          type: "textarea",
          required: true,
        },
      ],
      initial: { id: "bulk" },
      save: (r) => {
        try {
          const parsed = parseTable(str(r.text));
          if (parsed.length < 2)
            throw new Error("Include a header row and at least one data row.");
          const heads = parsed[0].map((h) => {
            const f = fs.find(
              (f) =>
                f.key.toLowerCase() === h.trim().toLowerCase() ||
                f.label.toLowerCase() === h.trim().toLowerCase(),
            );
            if (!f) throw new Error("Unknown column: " + h);
            return f;
          });
          if (new Set(heads.map((f) => f.key)).size !== heads.length)
            throw new Error("Each column must appear only once.");
          const added = parsed.slice(1).map((values, i) => {
            if (values.length !== heads.length)
              throw new Error(
                `Row ${i + 2}: column count differs from headers.`,
              );
            const row: Row = { id: crypto.randomUUID() };
            heads.forEach((f, j) => {
              const value = values[j].trim();
              row[f.key] =
                f.type === "checkbox"
                  ? ["true", "yes", "1"].includes(value.toLowerCase())
                  : f.type === "number"
                    ? value === ""
                      ? ""
                      : Number(value)
                    : value;
              if (
                f.type === "number" &&
                value !== "" &&
                (!Number.isFinite(row[f.key]) || Number(row[f.key]) < 0)
              )
                throw new Error(
                  `Row ${i + 2}: ${f.label} must be a non-negative number.`,
                );
              if (f.options?.length && value && !f.options.includes(value))
                throw new Error(`Row ${i + 2}: unknown ${f.label}: ${value}`);
            });
            for (const f of fs)
              if (f.required && (row[f.key] === undefined || row[f.key] === ""))
                throw new Error(`Row ${i + 2}: ${f.label} is required.`);
            if (row.veSelected && (!row.veBrand || !row.veComponent))
              throw new Error(
                `Row ${i + 2}: alternate hardware needs both brand and component.`,
              );
            return row;
          });
          if (kind !== "hardware") {
            const names = new Set(
              active.data[kind].map((r) => str(r.name).toLowerCase()),
            );
            for (const row of added) {
              const name = str(row.name).toLowerCase();
              if (names.has(name))
                throw new Error("Duplicate name: " + row.name);
              names.add(name);
            }
          }
          updateData({
            ...active.data,
            [kind]: [...active.data[kind], ...added],
          });
          setEdit(null);
          setNotice(
            `${added.length} rows added. Save the project to keep them.`,
          );
        } catch (e) {
          setError(message(e));
        }
      },
    });
  }
  function exportRows(kind: Kind) {
    if (!active) return;
    const fs = fields(kind, active.data, catalogs, vendors);
    const content = [
      fs.map((f) => csvCell(f.key)).join(","),
      ...active.data[kind].map((r) =>
        fs.map((f) => csvCell(r[f.key])).join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = kind + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function table(
    rows: Row[],
    columns: { key: string; label: string }[],
    kind?: Kind,
  ) {
    const supplierKey = kind === "openings" ? "frameSupplier" : "supplier";
    const showLeadTime = !!kind && ["openings", "doorTypes", "hardware"].includes(kind);
    const filtered = rows.filter((r) =>
      Object.values(r)
        .join(" ")
        .toLowerCase()
        .includes(tableQuery.toLowerCase()),
    );
    const max = Math.max(0, Math.ceil(filtered.length / 30) - 1),
      current = Math.min(page, max);
    return (
      <>
        <div className="table-toolbar">
          <div className="search">
            <Search size={16} />
            <input
              aria-label="Search rows"
              placeholder="Find an opening, component, or detail…"
              value={tableQuery}
              onChange={(e) => setTableQuery(e.target.value)}
            />
          </div>
          <span className="muted">{filtered.length} records</span>
          {kind && (
            <>
              <button
                className="button secondary"
                onClick={() => exportRows(kind)}
              >
                CSV
              </button>
              <button className="button secondary" onClick={() => bulk(kind)}>
                Paste rows
              </button>
              <button className="button" onClick={() => rowEditor(kind)}>
                <Plus size={16} /> Add {kind === "openings" ? "opening" : "row"}
              </button>
            </>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                {showLeadTime && <th>Vendor lead time</th>}
                {kind && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(current * 30, current * 30 + 30).map((r) => (
                <tr key={r.id} className={r.deleted ? "excluded" : ""}>
                  {columns.map((c, i) => (
                    <td key={c.key} className={i === 0 ? "strong" : ""}>
                      {typeof r[c.key] === "boolean"
                        ? r[c.key]
                          ? "Yes"
                          : "No"
                        : (c.key === supplierKey && kind && active
                          ? supplierFor(kind as "openings" | "doorTypes" | "hardware", r, active.data, vendors)?.name
                          : str(r[c.key])) || <span className="faint">—</span>}
                    </td>
                  ))}
                  {showLeadTime && (
                    <td>
                      {kind && active && supplierFor(kind as "openings" | "doorTypes" | "hardware", r, active.data, vendors)?.lead_time_days !== undefined
                        ? `${supplierFor(kind as "openings" | "doorTypes" | "hardware", r, active.data, vendors)?.lead_time_days} days`
                        : <span className="faint">Supplier not selected</span>}
                    </td>
                  )}
                  {kind && (
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={
                            "Edit " + (r.name || r.component || "row")
                          }
                          onClick={() => rowEditor(kind, r)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={
                            kind === "openings"
                              ? r.deleted
                                ? "Restore opening"
                                : "Exclude opening"
                              : "Remove row"
                          }
                          onClick={() => removeRow(kind, r)}
                        >
                          {r.deleted ? (
                            <Plus size={15} />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="empty">
              <Layers />
              <h3>No matching records</h3>
              <p>
                {kind
                  ? "Add a record to start this part of the project."
                  : "Try a different search."}
              </p>
            </div>
          )}
        </div>
        <div className="pagination">
          <span>
            Page {current + 1} of {max + 1}
          </span>
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </button>
          <button
            disabled={current === max}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      </>
    );
  }
  if (loading)
    return null;
  if (!ready)
    return (
      <>
        <Login onReady={load} />
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
      </>
    );
  return (
    <div className="app">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <Brand />
        <div className="workspace-tag">
          <span className="avatar">FD</span>
          <div>
            Fortified Doorworks<small>Manufacturing workspace</small>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <button
          className={"nav " + (view === "Dashboard" ? "selected" : "")}
          onClick={() => navigate("Dashboard")}
        >
          <LayoutDashboard size={19} /> Dashboard
        </button>
        <button
          className={"nav " + (view === "Projects" ? "selected" : "")}
          onClick={() => navigate("Projects")}
        >
          <LayoutGrid size={19} /> Projects{" "}
          <span>{projects.filter((p) => p.status !== "Archived").length}</span>
        </button>
        <button
          className={"nav " + (view === "Contractors" ? "selected" : "")}
          onClick={() => navigate("Contractors")}
        >
          <Building2 size={19} /> Contractors
        </button>
        <button
          className={"nav " + (view === "Settings" ? "selected" : "")}
          onClick={() => navigate("Settings")}
        >
          <Settings size={19} /> Settings
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            aria-label="Open navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <button
              onClick={() =>
                view === "Profile" ? closeProfile() : navigate("Projects")
              }
            >
              {view}
            </button>
            {active && (
              <>
                <ChevronRight size={14} />
                <span>{active.name}</span>
              </>
            )}
          </div>
          <div className="topbar-user">
            <span className="top-location">Logan, Utah</span>
            <button
              type="button"
              className="profile-trigger"
              aria-label={`Open profile for ${accountName || email}`}
              onClick={openProfile}
            >
              <span className="profile-trigger-name">
                {accountName || getProfileDisplayName(null, null, email)}
              </span>
              <span className="avatar profile-trigger-avatar" aria-hidden="true">
                {profileAvatar ? (
                  <img src={profileAvatar} alt="" />
                ) : (
                  initials(accountName || email)
                )}
              </span>
            </button>
          </div>
        </header>
        <main className="content" inert={busy || profileSaving || avatarBusy}>
          {view === "Profile" ? (
            <section className="profile-page" aria-busy={profileSaving || avatarBusy}>
              <button type="button" className="back-link" onClick={closeProfile}>
                <ArrowLeft size={16} /> Back to workspace
              </button>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR ACCOUNT</span>
                  <h1>Profile</h1>
                  <p>Manage the name, photo, and email shown for your account.</p>
                </div>
              </div>
              <div className="profile-layout">
                <section className="panel profile-panel">
                  <div className="profile-photo-row">
                    <span className="avatar profile-photo" aria-hidden="true">
                      {profileAvatar ? (
                        <img src={profileAvatar} alt="" />
                      ) : (
                        initials(profileName || email)
                      )}
                    </span>
                    <div className="profile-photo-actions">
                      <strong>Profile picture</strong>
                      <small>JPEG, PNG, or WebP up to 2 MB.</small>
                      <div className="profile-photo-buttons">
                        <label
                          className={
                            "button secondary" +
                            (avatarBusy || demo ? " disabled" : "")
                          }
                          htmlFor="profile-avatar-upload"
                        >
                          <Camera size={16} />
                          {avatarBusy ? "Uploading…" : "Change picture"}
                        </label>
                        {profileAvatar && (
                          <button
                            type="button"
                            className="text-button"
                            disabled={avatarBusy || demo}
                            onClick={removeProfileAvatar}
                          >
                            Remove picture
                          </button>
                        )}
                      </div>
                      <input
                        id="profile-avatar-upload"
                        className="sr-only"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={avatarBusy || demo}
                        onChange={(event) => {
                          void uploadProfileAvatar(event.currentTarget.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </div>
                  </div>
                  <form className="profile-form" onSubmit={saveProfile}>
                    <label>
                      Name
                      <input
                        autoComplete="name"
                        maxLength={80}
                        required
                        value={profileName}
                        disabled={demo || profileSaving}
                        onChange={(event) => setProfileName(event.target.value)}
                      />
                    </label>
                    <label>
                      Email
                      <input
                        autoComplete="email"
                        type="email"
                        maxLength={254}
                        required
                        value={profileEmail}
                        disabled={demo || profileSaving}
                        onChange={(event) => setProfileEmail(event.target.value)}
                      />
                    </label>
                    <p className="profile-help">
                      We’ll send a confirmation link before an email change takes effect.
                    </p>
                    {profileError && (
                      <p className="error" role="alert">{profileError}</p>
                    )}
                    {profileMessage && (
                      <p className="success-note" role="status">{profileMessage}</p>
                    )}
                    {demo && (
                      <p className="profile-help">Profile editing is unavailable in local preview.</p>
                    )}
                    <button
                      className="button"
                      disabled={demo || profileSaving || avatarBusy}
                    >
                      {profileSaving ? "Saving…" : "Save profile"}
                    </button>
                  </form>
                </section>
                <section className="panel profile-signout">
                  <div>
                    <h2>Sign out</h2>
                    <p>Sign out of Fortified Doorworks on this device.</p>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={demo || profileSaving || avatarBusy}
                    onClick={() => void signOut()}
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </section>
              </div>
            </section>
          ) : (
          <div className="workspace-content">
          {demo && (
            <div className="notice">
              Local preview — edits stay in this browser session.
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              <AlertCircle size={18} />
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <Check size={16} />
              {notice}
            </div>
          )}
          {!active && view === "Dashboard" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">WORKSPACE AT A GLANCE</span>
                  <h1>Dashboard</h1>
                  <p>Key numbers from your project pipeline.</p>
                </div>
              </div>
              <div className="metrics">
                <Metric
                  label="Active projects"
                  value={
                    summaries.filter(
                      (p) => !["Complete", "Archived"].includes(p.status),
                    ).length
                  }
                  icon={<Layers />}
                />
                <Metric
                  label="Openings tracked"
                  value={summaries.reduce(
                    (n, p) => n + p.computed.frames.length,
                    0,
                  )}
                  icon={<DoorOpen />}
                />
                <Metric
                  label="In production"
                  value={
                    summaries.filter((p) => p.status === "In production").length
                  }
                  icon={<Package />}
                />
                <Metric
                  label="Completed projects"
                  value={
                    summaries.filter((p) => p.status === "Complete").length
                  }
                  icon={<Check />}
                />
              </div>
            </>
          )}
          {!active && view === "Projects" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>
                    Projects<span className="count">{projects.length}</span>
                  </h1>
                </div>
                <button
                  className="button"
                  onClick={() => projectEditor(newProject(), true)}
                >
                  <Plus size={18} /> New project
                </button>
              </div>
              <section className="panel">
                <div className="filters">
                  <div className="search">
                    <Search size={18} />
                    <input
                      aria-label="Search projects"
                      placeholder="Search projects, contractors, or jobsite…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Filter project status"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    {["All statuses", ...statuses].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter building"
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                  >
                    {[
                      "All buildings",
                      ...new Set(
                        projects.map((p) => p.building).filter(Boolean),
                      ),
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="project-table-head" aria-label="Project columns">
                  <span aria-hidden="true" />
                  {projectSortColumns.map(({ label, key }) => (
                    <span key={key}>{projectColumn(label, key)}</span>
                  ))}
                  <span aria-hidden="true" />
                </div>
                <div className="project-list">
                  {visible.map((p) => (
                    <button
                      className="project-row"
                      key={p.id}
                      onClick={() => open(p)}
                    >
                      <span className="project-icon">
                        <Building2 size={22} />
                      </span>
                      <div className="project-name">
                        <h3>{p.name}</h3>
                        <small>{p.start_date || "Start date not set"}</small>
                      </div>
                      <span className="project-meta-cell">{p.building || "Independent project"}</span>
                      <span className="project-meta-cell">{contractors.find((c) => c.id === p.contractor_id)?.name || "Not assigned"}</span>
                      <span className="project-meta-cell">{p.pm || "Not assigned"}</span>
                      <span
                        className={
                          "badge status-" +
                          p.status.toLowerCase().replaceAll(" ", "-")
                        }
                      >
                        {p.status}
                      </span>
                      <div className="opening-count">
                        <strong>{p.computed.frames.length}</strong>
                        <small>{p.computed.phaseCount} phase{p.computed.phaseCount === 1 ? "" : "s"}</small>
                      </div>
                      <div className="progress-cell">
                        <div>
                          <span>Production</span>
                          <b>{p.computed.progress}%</b>
                        </div>
                        <progress value={p.computed.progress} max="100" />
                      </div>
                      <ArrowUpRight className="row-arrow" size={18} />
                    </button>
                  ))}
                  {!visible.length && (
                    <div className="empty">
                      <Layers />
                      <h3>No projects found</h3>
                      <p>Create your first project or adjust the filters.</p>
                    </div>
                  )}
                </div>
              </section>
              <div className="workspace-footer">
                <span>
                  <span className="orange-square" /> FORTIFIED DOORWORKS
                </span>
                <span>Designed around the way you build.</span>
              </div>
            </>
          )}
          {!active && view === "Contractors" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">WORKSPACE DIRECTORY</span>
                  <h1>Contractors</h1>
                  <p>Maintain the companies linked to your projects.</p>
                </div>
                <button
                  className="button"
                  onClick={() => settingsEditor("contractors")}
                >
                  <Plus size={18} /> Add contractor
                </button>
              </div>
              <div className="panel table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Contact</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractors.map((c) => (
                      <tr key={c.id}>
                        <td className="strong">{c.name}</td>
                        <td>{c.contact || "—"}</td>
                        <td>{c.email || "—"}</td>
                        <td>{c.phone || "—"}</td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={"Edit " + c.name}
                            onClick={() => settingsEditor("contractors", c)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={"Delete " + c.name}
                            onClick={() => deleteSetting("contractors", c)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!active && view === "Settings" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">MANAGE THE DETAILS</span>
                  <h1>Settings</h1>
                  <p>
                    Shared options for door schedules, frames, and hardware.
                  </p>
                </div>
                <button
                  className="button"
                  onClick={() => settingsEditor("catalogs")}
                >
                  <Plus size={18} /> Add option
                </button>
              </div>
              <div className="settings-layout">
                <nav className="settings-nav">
                  {categories.map((c) => (
                    <button
                      key={c}
                      className={c === cat ? "active" : ""}
                      onClick={() => setCat(c)}
                    >
                      {c}
                      <span>
                        {catalogs.filter((x) => x.category === c).length}
                      </span>
                    </button>
                  ))}
                </nav>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>{cat}</h2>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Value</th>
                          <th>Description</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catalogs
                          .filter((c) => c.category === cat)
                          .map((c) => (
                            <tr key={c.id}>
                              <td className="strong">{c.value}</td>
                              <td>{c.description || "—"}</td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={"Edit " + c.value}
                                  onClick={() => settingsEditor("catalogs", c)}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={"Delete " + c.value}
                                  onClick={() => deleteSetting("catalogs", c)}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
              <VendorDirectory
                vendors={vendors}
                setVendors={setVendors}
                manager={role === "manager"}
                demo={demo}
              />
            </>
          )}
          {active && !phaseDetail && (
            <>
              <div className="page-heading detail-heading phase-list-heading">
                <div>
                  <div className="phase-title">
                    <h1>{active.name}</h1>
                    <span className="badge">{active.status}</span>
                  </div>
                </div>
                <div className="actions">
                  <button className="button secondary" disabled={busy} onClick={duplicate}>
                    <Copy size={16} /> Duplicate project
                  </button>
                  <button className="button" disabled={!dirty || busy} onClick={() => saveProject()}><Save size={16} />{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
                </div>
              </div>
              <div className="project-overview-grid">
                <section className="panel project-details-panel">
                  <div className="panel-heading">
                    <div><h2>Project details</h2><p>Key information for this job.</p></div>
                    <button className="button secondary" onClick={() => projectEditor(active)}><Pencil size={15} /> Edit details</button>
                  </div>
                  <div className="project-detail-grid">
                    <div><small>Building</small><strong>{active.building || "Not specified"}</strong></div>
                    <div><small>Contractor</small><strong>{contractors.find((item) => item.id === active.contractor_id)?.name || "Not assigned"}</strong></div>
                    <div><small>Project manager</small><strong>{active.pm || "Not assigned"}</strong></div>
                    <div><small>Start date</small><strong>{active.start_date || "Not scheduled"}</strong></div>
                    <div className="project-detail-wide"><small>Jobsite</small><strong>{active.jobsite || "No jobsite entered"}</strong></div>
                    {active.scope && <div className="project-detail-wide"><small>Scope of work</small><strong className="project-scope-text">{active.scope}</strong></div>}
                  </div>
                </section>
                <section className="panel phase-list-panel">
                  <div className="panel-heading">
                    <div><h2>Phases</h2><p>Choose a work package to view openings, takeoff, and production.</p></div>
                    <button className="button" onClick={createPhase}><Plus size={17} /> New phase</button>
                  </div>
                  <div className="phase-list">
                    {(active.data.phases || []).map((phase, index) => (
                      <div className="phase-list-row" key={phase.id}>
                        <button className="phase-list-open" onClick={() => switchPhase(phase.id)}>
                          <span className="phase-list-number">{String(index + 1).padStart(2, "0")}</span>
                          <span className="phase-list-copy"><strong>{phase.name}</strong><small>{phase.data.openings.length} openings</small></span>
                          <ArrowUpRight size={18} />
                        </button>
                        <button className="icon-button" aria-label={`Rename ${phase.name}`} title="Rename phase" onClick={() => renamePhase(phase)}><Pencil size={16} /></button>
                      </div>
                    ))}
                    {!(active.data.phases || []).length && <div className="empty"><Layers /><h3>No phases yet</h3><p>Create a phase to organize this project’s work.</p></div>}
                  </div>
                </section>
                <ProjectFiles key={active.id} projectId={active.id} demo={demo}
                  phases={active.data.phases || [activePhase(active.data)]}
                  activePhaseId={activePhase(active.data).id}
                  onApply={(phaseId, rows) => {
                    const data = persistActivePhase(active.data);
                    const phases = (data.phases || []).map((phase) => phase.id === phaseId ? {
                      ...phase, data: { ...phase.data, ...Object.fromEntries(Object.entries(rows).map(([kind, additions]) =>
                        [kind, [...(phase.data[kind as Kind] || []), ...(additions || [])]])) },
                    } : phase);
                    const current = phases.find((phase) => phase.id === data.activePhaseId);
                    update({ ...active, data: { ...data, ...(current?.data || {}), phases } });
                  }} />
              </div>
            </>
          )}
          {active && derived && phaseDetail && (
            <>
              <button
                className="back-link"
                onClick={() => { if (dirty && !confirm("Keep unsaved changes while returning to phases?")) return; setPhaseDetail(false); setNotice(""); setError(""); if (active) router.push(`/projects/${active.id}`); }}
              >
                <ArrowLeft size={16} /> All phases
              </button>
              <div className="page-heading detail-heading">
                <div>
                  <span className="eyebrow">
                    {active.building || "MANUFACTURING PROJECT"}
                  </span>
                  <h1>{active.name}</h1>
                  <p>
                    <span className="badge">{active.status}</span>{" "}
                    <span>{active.jobsite || "Jobsite not entered"}</span>
                  </p>
                </div>
                <div className="actions">
                  <button className="button secondary" onClick={beginPhaseSplit}>
                    <Layers size={16} /> Split phase
                  </button>
                  <button
                    className="button"
                    disabled={!dirty || busy}
                    onClick={() => saveProject()}
                  >
                    <Save size={16} />
                    {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
                  </button>
                </div>
              </div>
              <nav className="tabs">
                {sections.map((s) => (
                  <button
                    className={s === section ? "active" : ""}
                    key={s}
                    onClick={() => {
                      setSection(s);
                      setTableQuery("");
                    }}
                  >
                    {s}
                    {s === "Openings" && <span>{derived.frames.length}</span>}
                  </button>
                ))}
              </nav>
              {section === "Overview" && (
                <>
                  <div className="metrics">
                    <Metric
                      label="Active openings"
                      value={derived.frames.length}
                      icon={<DoorOpen />}
                    />
                    <Metric
                      label="Hardware pieces"
                      value={derived.hardwareTakeoff.reduce(
                        (n, h) => n + h.count,
                        0,
                      )}
                      icon={<Package />}
                    />
                    <Metric
                      label="Production progress"
                      value={derived.progress + "%"}
                      icon={<Check />}
                    />
                    <Metric
                      label="Needs review"
                      value={derived.warnings.length}
                      icon={<AlertCircle />}
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Job information</h2>
                        <button
                          className="text-button"
                          onClick={() => projectEditor(active)}
                        >
                          <Pencil size={15} /> Edit details
                        </button>
                      </div>
                      <dl className="details">
                        {[
                          [
                            "Contractor",
                            contractors.find(
                              (c) => c.id === active.contractor_id,
                            )?.name,
                          ],
                          ["Start date", active.start_date],
                          ["Project manager", active.pm],
                          ["Jobsite", active.jobsite],
                          ["Scope of work", active.scope],
                          ["Cuts / notes", active.cuts],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{v || "Not entered"}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Production snapshot</h2>
                      </div>
                      <div className="stage-summary">
                        {stages.map((s) => {
                          const count = derived.frames.filter(
                            (o) => active.data.milestones[o.id]?.[s],
                          ).length;
                          return (
                            <div key={s}>
                              <span>{s}</span>
                              <progress
                                max={derived.frames.length || 1}
                                value={count}
                              />
                              <strong>
                                {count}/{derived.frames.length}
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                  {derived.warnings.length > 0 && (
                    <section className="panel review-panel">
                      <div className="panel-heading">
                        <h2>
                          <AlertCircle size={18} /> Review before release
                        </h2>
                        <span className="label">
                          {derived.warnings.length} items
                        </span>
                      </div>
                      <ul>
                        {derived.warnings.slice(0, 12).map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                      {derived.warnings.length > 12 && (
                        <p className="muted">
                          And {derived.warnings.length - 12} more. Review
                          opening details before manufacturing.
                        </p>
                      )}
                    </section>
                  )}
                </>
              )}
              {kindNames[section] && (
                <section className="panel">
                  {table(
                    section === "Hardware"
                      ? (derived.hardware as Row[])
                      : active.data[kindNames[section]],
                    fields(kindNames[section], active.data, catalogs, vendors)
                      .filter(
                        (f) =>
                          ![
                            "notes",
                            "veBrand",
                            "veComponent",
                            "veSelected",
                            "deleted",
                            "pr",
                            "qty",
                          ].includes(f.key) ||
                          (section === "Hardware" &&
                            ["qty", "veSelected"].includes(f.key)),
                      )
                      .map((f) => ({ key: f.key, label: f.label }))
                      .concat(
                        section === "Hardware"
                          ? [
                              { key: "selectedBrand", label: "Selected brand" },
                              {
                                key: "selectedComponent",
                                label: "Selected component",
                              },
                              { key: "frameCount", label: "Openings" },
                              { key: "lineQty", label: "Total quantity" },
                            ]
                          : [],
                      ),
                    kindNames[section],
                  )}
                </section>
              )}
              {section === "Frames" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Frame schedule</h2>
                      <p>
                        Calculated depths, modifications and part names for
                        active openings.
                      </p>
                    </div>
                  </div>
                  {table(derived.frames, [
                    { key: "name", label: "Opening" },
                    { key: "brand", label: "Brand" },
                    { key: "width", label: "Width" },
                    { key: "height", label: "Height" },
                    { key: "depth", label: "Depth" },
                    { key: "handing", label: "Handing" },
                    { key: "frameType", label: "Frame type" },
                    { key: "accessories", label: "Modifications" },
                    { key: "partName", label: "Part name" },
                  ])}
                </section>
              )}
              {section === "Doors" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Door schedule</h2>
                      <p>
                        Calculated from openings, door types, and hardware
                        groups.
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => exportPDF("Opening schedule")}
                    >
                      <Download size={16} /> Export PDF
                    </button>
                  </div>
                  {table(derived.doors, [
                    { key: "name", label: "Opening" },
                    { key: "width", label: "Width" },
                    { key: "height", label: "Height" },
                    { key: "handing", label: "Handing" },
                    { key: "brand", label: "Brand" },
                    { key: "material", label: "Material" },
                    { key: "window", label: "Window" },
                    { key: "fire", label: "Fire rating" },
                    { key: "typ", label: "Modifications" },
                    { key: "prep", label: "Prep" },
                    { key: "partName", label: "Part name" },
                  ])}
                </section>
              )}
              {section === "Takeoff" && (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>Project takeoff</h2>
                      <p>
                        Live totals from all active openings. Excluded openings
                        are not counted.
                      </p>
                    </div>
                    <div className="actions">
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => exportPDF("Takeoff", true)}
                      >
                        Selected PDF
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => exportPDF("Takeoff")}
                      >
                        <Download size={16} /> Download all
                      </button>
                    </div>
                  </div>
                  {[
                    ["Frames", derived.frameTakeoff],
                    ["Doors", derived.doorTakeoff],
                    ["Hardware", derived.hardwareTakeoff],
                  ].map(([name, rs]) => (
                    <section className="panel takeoff-panel" key={str(name)}>
                      <div className="panel-heading">
                        <h2>{str(name)}</h2>
                        <span className="label">
                          {(rs as { count: number }[]).reduce(
                            (n, r) => n + r.count,
                            0,
                          )}{" "}
                          pieces
                        </span>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Selected</th>
                              <th>Part / component</th>
                              <th>Quantity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(
                              rs as {
                                name: string;
                                count: number;
                                brand?: string;
                              }[]
                            ).map((r, i) => (
                              <tr key={i}>
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={
                                      "Select " + str(name) + " " + r.name
                                    }
                                    checked={
                                      !!active.data.takeoffSelection?.[
                                        JSON.stringify([
                                          name,
                                          r.brand || "",
                                          r.name,
                                        ])
                                      ]
                                    }
                                    onChange={(e) =>
                                      updateData({
                                        ...active.data,
                                        takeoffSelection: {
                                          ...active.data.takeoffSelection,
                                          [JSON.stringify([
                                            name,
                                            r.brand || "",
                                            r.name,
                                          ])]: e.target.checked,
                                        },
                                      })
                                    }
                                  />
                                </td>
                                <td>
                                  {r.brand && (
                                    <small className="cell-brand">
                                      {r.brand}
                                    </small>
                                  )}
                                  {r.name}
                                </td>
                                <td className="quantity">{r.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </>
              )}
              {section === "Production" && (
                <>
                <ProductionTracker
                  key={`${active.id}:${activePhase(active.data).id}:${email}`}
                  projectId={active.id}
                  phaseId={activePhase(active.data).id}
                  openings={derived.frames}
                  email={email}
                  manager={role === "manager"}
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
                    <p className="printing-note">
                      Print at 100% / actual size. Frame and door labels use
                      the fixed 4 × 1 inch layout; hardware labels use the
                      fixed landscape layout.
                    </p>
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
    </div>
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
