import { PDFDocument } from "pdf-lib";
import { derive, str } from "./production";
import type { Catalog, ProjectData } from "./types";

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
    if (!component?.document_path || !/\.pdf$/i.test(component.document_name || component.document_path) || paths.has(component.document_path)) continue;
    paths.add(component.document_path);
    documents.push(component);
  }
  return documents;
}

export type HardwareDocumentLoader = (path: string) => Promise<Uint8Array>;

/** Copy every original page without altering its size, orientation, or printed content. */
export async function appendHardwareDocuments(pdf: PDFDocument, documents: Catalog[], load?: HardwareDocumentLoader) {
  for (const component of documents) {
    try {
      if (!load) throw new Error("Document storage is unavailable.");
      const attachment = await PDFDocument.load(await load(component.document_path!));
      if (!attachment.getPageCount()) throw new Error("The PDF has no pages.");
      const pages = await pdf.copyPages(attachment, attachment.getPageIndices());
      for (const page of pages) pdf.addPage(page);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The PDF could not be read.";
      throw new Error(`Could not append the hardware PDF for ${component.value} (${component.document_name || "document"}). ${reason}`);
    }
  }
}
