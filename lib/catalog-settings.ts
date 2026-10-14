import type { Catalog } from "./types";
import { catalogBrandCategory } from "./cutsheets";

export type CatalogField = "value" | "description";
export type CatalogSort = "value" | "newest" | "oldest";

function createdTime(row: Catalog): number | null {
  const time = row.created_at ? Date.parse(row.created_at) : NaN;
  return Number.isFinite(time) ? time : null;
}

export function sortCatalogs(rows: Catalog[], sort: CatalogSort): Catalog[] {
  return [...rows].sort((a, b) => {
    if (sort !== "value") {
      const first = createdTime(a), second = createdTime(b);
      // Unknown historical dates belong at the end in either direction.
      if (first === null && second !== null) return 1;
      if (first !== null && second === null) return -1;
      if (first !== null && second !== null && first !== second)
        return sort === "newest" ? second - first : first - second;
    }
    return a.value.localeCompare(b.value) || a.id.localeCompare(b.id);
  });
}

export function catalogCreatedDate(row: Catalog): string {
  const time = createdTime(row);
  return time === null ? "Unknown" : new Date(time).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  });
}

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
