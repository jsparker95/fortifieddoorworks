/** Preserve the printed identifier while removing the surrounding table heading. */
export function hardwareSetIdentifier(value: string) {
  const identifier = value.trim().replace(/^(?:HARDWARE\s+)?SET\s*(?:NO\.?\s*)?[:#]?\s*/i, '').replace(/^#\s*/, '').trim();
  return /^(?:N\s*\/\s*A|NONE|NOT APPLICABLE|[-—])$/i.test(identifier) ? '' : identifier;
}
export function hardwareSetKey(value: string) {
  const separator = value.lastIndexOf(' / ');
  const scope = separator < 0 ? '' : `${value.slice(0, separator).trim().toUpperCase()} / `;
  const identifier = hardwareSetIdentifier(separator < 0 ? value : value.slice(separator + 3));
  return identifier ? scope + identifier.toUpperCase().replace(/^0+(?=\d)/, '').replace(/\s+/g, '') : '';
}
