"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Search,
  Plus,
  Settings,
  LayoutGrid,
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
} from "@/lib/types";
import { derive, str } from "@/lib/production";
import { Field, fields } from "@/lib/fields";
import { Editor } from "./editor";
import { parseTable, csvCell } from "@/lib/tabular";
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
    <div className="brand">
      <span className="brand-mark">
        <DoorOpen size={24} />
      </span>
      <div>
        FORTIFIED<span>DOORWORKS</span>
      </div>
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
                ? await supabase.auth.signUp({ email, password })
                : await supabase.auth.signInWithPassword({ email, password });
            if (r.error) throw r.error;
            if (r.data.session) onReady();
            else
              setMessage(
                "Check your email to confirm your account, then sign in here.",
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
  const [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [demo, setDemo] = useState(false),
    [email, setEmail] = useState("");
  const [projects, setProjects] = useState<Project[]>([]),
    [contractors, setContractors] = useState<Contractor[]>([]),
    [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [active, setActive] = useState<Project | null>(null),
    [view, setView] = useState("Projects"),
    [section, setSection] = useState("Overview"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All statuses"),
    [building, setBuilding] = useState("All buildings");
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
    [labelWidth, setLabelWidth] = useState(4),
    [labelHeight, setLabelHeight] = useState(2),
    [selected, setSelected] = useState<string[]>([]),
    [labelMode, setLabelMode] = useState("all");
  const operation = useRef(false);
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
        setDemo(true);
        setEmail("Local preview");
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
      const member = await supabase
        .from("workspace_members")
        .select("email")
        .maybeSingle();
      if (member.error) throw member.error;
      if (!member.data) {
        setReady(true);
        throw new Error(
          "Your account is signed in but has not been approved for this workspace. Ask the workspace owner to add your email.",
        );
      }
      const all = await Promise.all([
        readAll("projects", "id"),
        readAll("contractors", "id"),
        readAll("catalogs", "id"),
      ]);
      for (const r of all) if (r.error) throw r.error;
      setProjects(
        ((all[0].data as Project[]) || []).sort((a, b) =>
          b.updated_at.localeCompare(a.updated_at),
        ),
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
  const derived = useMemo(
    () => (active ? derive(active.data) : null),
    [active],
  );
  const summaries = useMemo(
    () => projects.map((p) => ({ ...p, computed: derive(p.data) })),
    [projects],
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
  );
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
    if (active) update({ ...active, data });
  }
  function navigate(v: string) {
    if (dirty && !confirm("Discard your unsaved project changes?")) return;
    setActive(null);
    setDirty(false);
    setView(v);
    setMobile(false);
    setError("");
  }
  function open(p: Project) {
    setActive(structuredClone(p));
    setDirty(false);
    setSection("Overview");
    setTableQuery("");
    setSelected([]);
    setNotice("");
    setError("");
    setMobile(false);
  }
  async function saveProject() {
    if (!active || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      let saved: Project;
      if (demo)
        saved = {
          ...active,
          version: active.version + 1,
          updated_at: new Date().toISOString(),
        };
      else {
        const { id, version, updated_at, ...payload } = active;
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
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      operation.current = false;
    }
  }
  const projectFields: Field[] = [
    { key: "name", label: "Job / PO name", required: true },
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
          next.data = {
            ...structuredClone(source.data),
            openings: [],
            milestones: {},
            takeoffSelection: {},
            links: [],
            references: source.data.references.map((r) => ({
              ...r,
              page: "",
              selection: "",
            })),
          };
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
    const initial = row || {
      id: crypto.randomUUID(),
      ...(kind === "hardware" ? { qty: 1 } : {}),
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
      fields: fields(kind, active.data, catalogs),
      initial,
      save: (r) => {
        const opts = fields(kind, active.data, catalogs);
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
    if (!active) return;
    const p = newProject();
    p.name = active.name + " — copy";
    p.building = active.building;
    p.contractor_id = active.contractor_id;
    p.data = structuredClone(active.data);
    p.data.milestones = {};
    p.data.takeoffSelection = {};
    p.data.openings = p.data.openings.map((o) => ({
      ...o,
      id: crypto.randomUUID(),
    }));
    projectEditor(p, true);
  }
  async function exportPDF(type: string, selectedTakeoffOnly = false) {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const { downloadDocument } = await import("@/lib/documents");
      await downloadDocument(active, type, {
        labelWidth,
        labelHeight,
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
    const fs = fields(kind, active.data, catalogs);
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
    const fs = fields(kind, active.data, catalogs);
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
                        : str(r[c.key]) || <span className="faint">—</span>}
                    </td>
                  ))}
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
    return (
      <main className="loading">
        <Brand />
        <p>Loading your workspace…</p>
      </main>
    );
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
        <div className="sidebar-bottom">
          <div className="shop-note">
            <Package size={22} />
            <strong>Built for the shop floor.</strong>
            <p>One source of truth, from takeoff through delivery.</p>
          </div>
          <button
            className="nav"
            onClick={async () => {
              if (dirty && !confirm("Discard unsaved changes and sign out?"))
                return;
              await supabase.auth.signOut();
              setReady(false);
              setActive(null);
              setProjects([]);
            }}
          >
            <LogOut size={17} /> Sign out
          </button>
          <small>{email}</small>
        </div>
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
            <button onClick={() => navigate("Projects")}>{view}</button>
            {active && (
              <>
                <ChevronRight size={14} />
                <span>{active.name}</span>
              </>
            )}
          </div>
          <span className="top-location">Logan, Utah</span>
          <span className="avatar">{initials(email)}</span>
        </header>
        <main className="content" inert={busy}>
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
          {!active && view === "Projects" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">FROM TAKEOFF TO DELIVERY</span>
                  <h1>
                    Projects<span className="count">{projects.length}</span>
                  </h1>
                  <p>Your jobs, their details, and what moves next.</p>
                </div>
                <button
                  className="button"
                  onClick={() => projectEditor(newProject(), true)}
                >
                  <Plus size={18} /> New project
                </button>
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
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Project pipeline</h2>
                    <p>
                      Grouped by building. Managed one manufacturing job at a
                      time.
                    </p>
                  </div>
                  <span className="label">{visible.length} projects</span>
                </div>
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
                        <small>{p.building || "Independent project"}</small>
                        <h3>{p.name}</h3>
                        <p>
                          {contractors.find((c) => c.id === p.contractor_id)
                            ?.name || "Contractor not assigned"}
                          <span>·</span>
                          {p.pm || "PM not assigned"}
                          <span>·</span>
                          {p.start_date || "Start date not set"}
                        </p>
                      </div>
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
                        <small>openings</small>
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
            </>
          )}
          {active && derived && (
            <>
              <button
                className="back-link"
                onClick={() => navigate("Projects")}
              >
                <ArrowLeft size={16} /> All projects
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
                  <button className="button secondary" onClick={duplicate}>
                    <Copy size={16} /> Duplicate
                  </button>
                  <button
                    className="button"
                    disabled={!dirty || busy}
                    onClick={saveProject}
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
                    fields(kindNames[section], active.data, catalogs)
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
              )}
              {section === "Documents" && (
                <>
                  <div className="document-grid">
                    {[
                      "Submittal",
                      "Takeoff",
                      "Opening schedule",
                      "Build sheet",
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
                        <p>Generate from current project details</p>
                        <span>
                          Download PDF <ArrowUpRight size={16} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Print labels</h2>
                        <p>
                          One label per opening. Long hardware lists continue
                          onto additional labels.
                        </p>
                      </div>
                      <button
                        className="button"
                        disabled={
                          busy ||
                          derived.frames.length === 0 ||
                          (labelMode === "selected" && !selected.length)
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
                          {["Doors", "Frames", "Hardware"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Width (inches)
                        <input
                          type="number"
                          min="2"
                          max="8.5"
                          step="0.25"
                          value={labelWidth}
                          onChange={(e) =>
                            setLabelWidth(
                              Math.max(
                                2,
                                Math.min(8.5, Number(e.target.value)),
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Height (inches)
                        <input
                          type="number"
                          min="1"
                          max="11"
                          step="0.25"
                          value={labelHeight}
                          onChange={(e) =>
                            setLabelHeight(
                              Math.max(1, Math.min(11, Number(e.target.value))),
                            )
                          }
                        />
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
                      Print at 100% / actual size. Label dimensions and the
                      original submittal layout still need comparison with your
                      existing printed samples.
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
            </>
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
    </div>
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
