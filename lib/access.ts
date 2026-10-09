export const workspaceRoles = ["operator", "manager", "global_admin"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];
export const roleLabels: Record<WorkspaceRole, string> = {
  operator: "Operator",
  manager: "Manager",
  global_admin: "Global Admin",
};
export const roleDescriptions: Record<WorkspaceRole, string> = {
  operator:
    "Edit shared projects, documents, contractors and catalog settings. Track your own production time. Read vendors.",
  manager:
    "All Operator permissions, plus maintain vendors, review team production time and delete phases with their work history.",
  global_admin:
    "All Manager permissions, plus view members, add access, change roles, revoke or restore access, and review the access log.",
};
export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return workspaceRoles.some((role) => role === value);
}
export function canManageProduction(role: WorkspaceRole) {
  return role === "manager" || role === "global_admin";
}
export type WorkspaceMember = {
  email: string;
  display_name: string;
  role: WorkspaceRole;
  active: boolean;
  access_version: number;
  user_id: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
};
export type AccessEvent = {
  id: number;
  actor_email: string;
  member_email: string;
  action: string;
  before_state: { role: WorkspaceRole; active: boolean } | null;
  after_state: { role: WorkspaceRole; active: boolean };
  created_at: string;
};
export function accountStatus(member: WorkspaceMember) {
  if (!member.active) return "Access revoked";
  if (!member.user_id) return "Needs account";
  if (!member.confirmed_at) return "Email confirmation pending";
  return "Ready to sign in";
}
