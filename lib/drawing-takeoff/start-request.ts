/** Uploads and read-only previews must never implicitly start paid processing. */
export function hasExplicitExtractionRequest(value: unknown): boolean {
  return typeof value === "object" && value !== null
    && (value as Record<string, unknown>).startRequested === true;
}
