export function normalizeDeleteConfirmation(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .trim()
    .replace(/\s+/g, " ");
}
