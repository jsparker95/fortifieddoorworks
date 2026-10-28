/** Supabase caps each response; never silently omit later type/wall task rows. */
export async function readInPages<T>(read: (from: number, to: number) => Promise<T[]>, size = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += size) {
    const page = await read(offset, offset + size - 1);
    rows.push(...page);
    if (page.length < size) return rows;
  }
}
