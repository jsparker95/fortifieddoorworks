/** Shared printed identifiers: numeric sets and alphanumeric Hardware Group No. tables. */
export function hardwareHeadings(text: string) {
  return [...text.matchAll(/\b(?:(?:HARDWARE\s+)?SET|HARDWARE\s+GROUP)\s*(?:NO\.?\s*)?[:#]?\s*([A-Z]{0,4}-?\d+(?:\.\d+)?[A-Z-]*)(?=\s|\()/gi)]
    .map(match=>({index:match.index,identifier:match[1],heading:match[0]}));
}
