import type { Catalog } from "./types";
import { catalogBrandCategory } from "./cutsheets";

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

export function filterCatalogs(rows: Catalog[], category: string, query: string): Catalog[] {
  const term = query.trim().toLocaleLowerCase();
  return rows.filter((row) => row.category === category &&
    (!term || row.value.toLocaleLowerCase().includes(term) || (row.description || "").toLocaleLowerCase().includes(term)));
}

export function hardwareBrandId(rows: Catalog[], value: string): string {
  return catalogBrandId(rows, "Hardware components", value);
}

export function catalogBrandId(rows: Catalog[], category: string, value: string): string {
  const brands = catalogBrandCategory(category);
  const brand = rows.find((row) => row.category === brands && row.value === value.trim());
  if (!brand) throw new Error(`Choose a brand from ${brands} in Settings.`);
  return brand.id;
}
