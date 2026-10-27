/** Preserve the printed identifier while removing the surrounding table heading. */
export function hardwareSetIdentifier(value: string) {
  return value.trim().replace(/^(?:HARDWARE\s+)?SET\s*(?:NO\.?\s*)?[:#]?\s*/i, '').trim();
}
export function hardwareSetKey(value: string) {
  return hardwareSetIdentifier(value).toUpperCase().replace(/^0+(?=\d)/, '').replace(/\s+/g, '');
}
