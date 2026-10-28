import { PDFDocument } from "pdf-lib";
import { subsetPdf } from "./pdf-server";

/** Original page numbers must be mapped into their saved, possibly non-contiguous segment. */
export async function pageFromSegment(bytes: Uint8Array, originalPages: number[], requestedPage: number) {
  const localPage = originalPages.indexOf(requestedPage) + 1;
  if (localPage < 1) throw new Error(`PDF page ${requestedPage} is missing from its saved segment.`);
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (source.getPageCount() !== originalPages.length) throw new Error("Saved PDF segment page mapping is inconsistent. Re-index this document.");
  return subsetPdf(source, [localPage]);
}
