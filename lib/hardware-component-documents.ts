export const HARDWARE_DOCUMENT_BUCKET = "hardware-component-documents";
export const MAX_HARDWARE_DOCUMENT_SIZE = 20 * 1024 * 1024;
const types: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", txt: "text/plain",
};
export const HARDWARE_DOCUMENT_ACCEPT = Object.keys(types).map((extension) => `.${extension}`).join(",");
export function hardwareDocumentType(file: { name: string; size: number }): string {
  if (!file.size) throw new Error("Choose a document that is not empty.");
  if (file.size > MAX_HARDWARE_DOCUMENT_SIZE) throw new Error("Choose a document no larger than 20 MB.");
  const type = types[file.name.split(".").pop()?.toLowerCase() || ""];
  if (!type) throw new Error("Choose a PDF, Word or Excel document, JPG/PNG image, or text file.");
  return type;
}
export function hardwareDocumentPath(componentId: string, uploadId: string, name: string) {
  return `${componentId}/${uploadId}/${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}
