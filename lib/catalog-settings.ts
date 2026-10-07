import type { Catalog } from "./types";

export type CatalogField = "value" | "description";

export function catalogFieldValue(field: CatalogField, value: string) {
  if (field === "value") {
    const trimmed = value.trim();
    if (!trimmed) throw new Error("Value cannot be empty.");
    return trimmed;
  }
  return value;
}

export function applyCatalogField(rows: Catalog[], id: string, field: CatalogField, value: string): Catalog[] {
  return rows.map((row) => row.id === id ? { ...row, [field]: value } : row);
}
