/** Keep the fields needed to review a plan together; retain all other editors. */
export function openingReviewColumns<T extends { key: string }>(columns: readonly T[]): T[] {
  const priority = ["name", "width", "height", "handing", "doorType", "group", "fire"];
  const rank = (key: string) => {
    const index = priority.indexOf(key);
    return index < 0 ? priority.length : index;
  };
  return [...columns].sort((a, b) => rank(a.key) - rank(b.key));
}
