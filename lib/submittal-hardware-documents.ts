import { PDFDocument } from "pdf-lib";
import { derive, same, str } from "./production";
import type { Catalog, ProjectData, Row } from "./types";

const componentKey = (value: unknown) => str(value).trim().replace(/\s+/g, " ").toLowerCase();

/** Catalog values identify components; brands can still be unassigned on legacy records. */
export function submittalHardwareDocuments(data: ProjectData, catalogs: Catalog[]): Catalog[] {
  const components = new Map(catalogs
    .filter((catalog) => catalog.category === "Hardware components")
    .map((catalog) => [componentKey(catalog.value), catalog]));
  const paths = new Set<string>();
  const documents: Catalog[] = [];
  for (const part of derive(data).hardware) {
    if (part.deleted || !str(part.group).trim() || part.lineQty <= 0 || !Number.isFinite(part.lineQty)) continue;
    const component = components.get(componentKey(part.selectedComponent));
    if (!component?.document_path || !/\.pdf$/i.test(component.document_name || component.document_path)) continue;
    const key = component.document_sha256 || component.document_path;
    if (paths.has(key)) continue;
    paths.add(key);
    documents.push(component);
  }
  return documents;
}

export type HardwareDocumentLoader = (path: string) => Promise<Uint8Array>;

/** Door and frame products are brand-specific; ambiguous series need an explicit schedule choice. */
export function submittalDocuments(data: ProjectData, catalogs: Catalog[]): Catalog[] {
  const documents: Catalog[] = [];
  const brands = new Map(catalogs.map((catalog) => [catalog.id, catalog.value]));
  const isPdf = (catalog: Catalog) => Boolean(catalog.document_path && /\.pdf$/i.test(catalog.document_name || catalog.document_path));
  function product(category: string, brand: unknown, value: unknown, selected: unknown, context: string) {
    const candidates = catalogs.filter((catalog) => catalog.category === category && isPdf(catalog));
    if (str(selected)) {
      const chosen = candidates.find((catalog) => catalog.value === str(selected));
      if (!chosen) throw new Error(`The cutsheet selected for ${context} is unavailable. Choose it again in the schedule.`);
      if ((str(brand) && componentKey(brands.get(chosen.brand_id || "")) !== componentKey(brand)) ||
          (chosen.match_value && componentKey(chosen.match_value) !== componentKey(value))) {
        throw new Error(`The cutsheet selected for ${context} does not match its brand and material/type. Choose a matching cutsheet in the schedule.`);
      }
      documents.push(chosen); return;
    }
    if (!str(brand).trim() || !str(value).trim()) return;
    const matches = candidates.filter((catalog) => catalog.match_value && componentKey(catalog.match_value) === componentKey(value) &&
      componentKey(brands.get(catalog.brand_id || "")) === componentKey(brand));
    if (matches.length > 1) throw new Error(`Choose a cutsheet for ${context} in the schedule: ${matches.map((catalog) => catalog.value).join(", ")}.`);
    if (matches[0]) documents.push(matches[0]);
  }
  const { doors, frames } = derive(data);
  const types = new Map(data.doorTypes.map((type) => [componentKey(type.name), type]));
  const walls = new Map(data.walls.map((wall) => [componentKey(wall.name), wall]));
  const usedDoors = new Set<string>();
  for (const door of doors) {
    if (same(door.doorType, "NA")) continue;
    const type = types.get(componentKey(door.doorType));
    if (!type || usedDoors.has(type.id)) continue;
    usedDoors.add(type.id);
    product("Door cutsheets", type.brand, type.material, type.cutsheet, `door type ${str(type.name)}`);
    const window = catalogs.find((catalog) => catalog.category === "Windows" && componentKey(catalog.value) === componentKey(type.window) && isPdf(catalog));
    if (window) documents.push(window);
  }
  for (const frame of frames) {
    if (same(frame.wall, "NA")) continue;
    const wall: Row | undefined = walls.get(componentKey(frame.wall));
    product("Frame cutsheets", frame.brand || wall?.brand, frame.frameType, frame.frameCutsheet, `opening ${str(frame.name)}`);
  }
  documents.push(...submittalHardwareDocuments(data, catalogs));
  const paths = new Set<string>();
  return documents.filter((document) => {
    const key = document.document_sha256 || document.document_path!;
    if (paths.has(key)) return false;
    paths.add(key); return true;
  });
}

/** Copy every original page without altering its size, orientation, or printed content. */
export async function appendHardwareDocuments(pdf: PDFDocument, documents: Catalog[], load?: HardwareDocumentLoader) {
  const contentHashes = new Set<string>();
  for (const component of documents) {
    try {
      if (!load) throw new Error("Document storage is unavailable.");
      const bytes = await load(component.document_path!);
      const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (contentHashes.has(hash)) continue;
      const attachment = await PDFDocument.load(bytes);
      if (!attachment.getPageCount()) throw new Error("The PDF has no pages.");
      const pages = await pdf.copyPages(attachment, attachment.getPageIndices());
      for (const page of pages) pdf.addPage(page);
      contentHashes.add(hash);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The PDF could not be read.";
      const label = component.category === "Hardware components" ? "hardware PDF" : "cutsheet PDF";
      throw new Error(`Could not append the ${label} for ${component.value} (${component.document_name || "document"}). ${reason}`);
    }
  }
}
