export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function getProfileDisplayName(
  metadataName: unknown,
  memberName: unknown,
  email: string,
) {
  const values = [metadataName, memberName, email.split("@")[0]];
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "User";
}

export function isValidAvatarFile(file: { type: string; size: number }) {
  return (
    AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number]) &&
    file.size > 0 &&
    file.size <= MAX_AVATAR_BYTES
  );
}
