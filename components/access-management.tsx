"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  accountStatus,
  roleDescriptions,
  roleLabels,
  workspaceRoles,
  type AccessEvent,
  type WorkspaceMember,
  type WorkspaceRole,
} from "@/lib/access";

function errorMessage(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String(error.message)
    : "Unable to update access. Try again.";
}
type AccessData = { members: WorkspaceMember[]; events: AccessEvent[] };

export function AccessManagement({
  email,
  role,
  demo,
}: {
  email: string;
  role: WorkspaceRole;
  demo: boolean;
}) {
  const [data, setData] = useState<AccessData>({ members: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<WorkspaceMember | "new" | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [nextRole, setNextRole] = useState<WorkspaceRole>("operator");
  const [confirm, setConfirm] = useState<WorkspaceMember | null>(null);
  const allowed = role === "global_admin" && !demo;
  const refresh = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await supabase.rpc("list_workspace_access");
      if (result.error) throw result.error;
      setData(result.data as AccessData);
    } catch (e) {
      setData({ members: [], events: [] });
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [allowed]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save(
    member: WorkspaceMember | null,
    active: boolean,
    details?: { email: string; name: string; role: WorkspaceRole },
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await supabase.rpc("save_workspace_access", {
        p_email: details?.email ?? member?.email,
        p_display_name: details?.name ?? member?.display_name,
        p_role: details?.role ?? member?.role,
        p_active: active,
        p_expected_version: member?.access_version ?? null,
      });
      if (result.error) throw result.error;
      setEditing(null);
      setConfirm(null);
      setNotice(
        !member
          ? "Access added. If they do not have an account yet, share the app link and ask them to choose Create your account using this email. No email has been sent."
          : !active
            ? "Workspace access revoked. Production history is preserved."
            : "Access saved. The new permissions apply to subsequent requests.",
      );
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function edit(member: WorkspaceMember | null) {
    setEditing(member || "new");
    setConfirm(null);
    setError("");
    setNotice("");
    setName(member?.display_name || "");
    setAddress(member?.email || "");
    setNextRole(member?.role || "operator");
  }

  return (
    <section className="access-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE SECURITY</span>
          <h1>Users &amp; access</h1>
          <p>Manage who can use Fortified Doorworks and what they can do.</p>
        </div>
        {allowed && (
          <button
            className="button"
            disabled={busy || loading}
            onClick={() => edit(null)}
          >
            Add member
          </button>
        )}
      </div>
      <div className="access-roles">
        {workspaceRoles.map((item) => (
          <article className="panel" key={item}>
            <h2>{roleLabels[item]}</h2>
            <p>{roleDescriptions[item]}</p>
          </article>
        ))}
      </div>
      <p className="access-help">
        Roles apply across the company workspace. Operators can edit shared
        business data; they are not read-only users. Global Admin is an app role
        and does not grant access to hosting, source code or the database
        dashboard.
      </p>
      {!allowed ? (
        <div className="panel access-message">
          <h2>Global Admin access required</h2>
          <p>
            Your current role: {roleLabels[role]}. Ask a Global Admin to manage
            workspace membership.
          </p>
          {demo && <p>Access management is unavailable in local demo mode.</p>}
        </div>
      ) : (
        <>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {editing && (
            <form
              className="panel access-form"
              onSubmit={(event) => {
                event.preventDefault();
                void save(
                  editing === "new" ? null : editing,
                  editing === "new" ? true : editing.active,
                  {
                    email: address.trim().toLowerCase(),
                    name: name.trim(),
                    role: nextRole,
                  },
                );
              }}
            >
              <h2>
                {editing === "new"
                  ? "Add workspace member"
                  : `Edit ${editing.email}`}
              </h2>
              <div className="access-fields">
                <label>
                  Name
                  <input
                    required
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={busy}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    required
                    maxLength={254}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    disabled={busy || editing !== "new"}
                  />
                </label>
                <label>
                  Role
                  <select
                    value={nextRole}
                    onChange={(event) =>
                      setNextRole(event.target.value as WorkspaceRole)
                    }
                    disabled={busy || address === email}
                  >
                    {workspaceRoles.map((item) => (
                      <option key={item} value={item}>
                        {roleLabels[item]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p>{roleDescriptions[nextRole]}</p>
              {editing === "new" && (
                <p className="access-help">
                  This approves an email address for access. It does not create
                  a password or send an invitation. New members use “Create your
                  account” on the app’s sign-in page.
                </p>
              )}
              {nextRole === "global_admin" && address !== email && (
                <p className="notice">
                  This member will be able to grant and revoke access for other
                  people, including other administrators.
                </p>
              )}
              <div className="access-actions">
                <button className="button" disabled={busy}>
                  {busy ? "Saving…" : "Save access"}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {confirm && (
            <section
              className="panel access-form"
              aria-labelledby="access-confirm-title"
            >
              <h2 id="access-confirm-title">
                {confirm.active ? "Revoke" : "Restore"} access for{" "}
                {confirm.display_name}?
              </h2>
              <p>
                {confirm.email} —{" "}
                {confirm.active
                  ? "Future workspace requests will be blocked. Their account and production history will be retained. Previously downloaded files and unexpired signed file links cannot be recalled."
                  : `They will regain ${roleLabels[confirm.role]} permissions.`}
              </p>
              <div className="access-actions">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void save(confirm, !confirm.active)}
                >
                  {busy
                    ? "Saving…"
                    : confirm.active
                      ? "Revoke access"
                      : "Restore access"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Workspace members</h2>
                <p>
                  {data.members.filter((member) => member.active).length} active
                  · {data.members.filter((member) => !member.active).length}{" "}
                  revoked
                </p>
              </div>
              <button
                className="button secondary"
                disabled={loading || busy}
                onClick={() => void refresh()}
              >
                Refresh
              </button>
            </div>
            <label className="access-search">
              Find a member
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or email"
              />
            </label>
            {loading ? (
              <p className="access-help" role="status">
                Loading members…
              </p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Role</th>
                      <th>Account status</th>
                      <th>Last sign-in</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.members
                      .filter((member) =>
                        `${member.email} ${member.display_name}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((member) => (
                        <tr key={member.email}>
                          <td>
                            <strong>
                              {member.display_name}
                              {member.email === email ? " (you)" : ""}
                            </strong>
                            <small className="access-email">
                              {member.email}
                            </small>
                          </td>
                          <td>{roleLabels[member.role]}</td>
                          <td>{accountStatus(member)}</td>
                          <td>
                            {member.last_sign_in_at
                              ? new Date(
                                  member.last_sign_in_at,
                                ).toLocaleString()
                              : "Never"}
                          </td>
                          <td>
                            <div className="access-actions">
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => edit(member)}
                                aria-label={`Edit access for ${member.email}`}
                              >
                                Edit
                              </button>
                              <button
                                className="button secondary"
                                disabled={busy || member.email === email}
                                onClick={() => {
                                  setConfirm(member);
                                  setEditing(null);
                                  setError("");
                                  setNotice("");
                                }}
                                aria-label={`${member.active ? "Revoke" : "Restore"} access for ${member.email}`}
                              >
                                {member.active ? "Revoke" : "Restore"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!data.members.length && (
                  <p className="access-help">No members to display.</p>
                )}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Access history</h2>
                <p>
                  Most recent 100 changes made through access management, plus
                  initial administrator setup.
                </p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Changed by</th>
                    <th>Member</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.created_at).toLocaleString()}</td>
                      <td>{event.actor_email}</td>
                      <td>{event.member_email}</td>
                      <td>
                        {event.action} · {roleLabels[event.after_state.role]} ·{" "}
                        {event.after_state.active ? "Active" : "Revoked"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.events.length && (
                <p className="access-help">No access changes yet.</p>
              )}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
