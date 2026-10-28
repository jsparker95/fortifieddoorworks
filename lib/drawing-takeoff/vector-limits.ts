/** Native CAD expansion is optional. Keep a single dense sheet from killing the worker. */
export const MAX_VECTOR_PDF_BYTES = 8 * 1024 * 1024;
export const MAX_VECTOR_POINTS = 250_000;
export function vectorResourceLimit(byteLength: number) {
  return byteLength > MAX_VECTOR_PDF_BYTES
    ? "This dense drawing exceeds the native geometry memory budget. Door handing requires manual review; schedule extraction continues."
    : null;
}
