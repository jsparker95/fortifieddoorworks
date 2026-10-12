export type IndexedDrawingPage = {
  page: number;
  text: string;
  score: number;
  labels: string[];
};

function spreadPages(pages: number[], limit: number) {
  if (limit <= 0 || pages.length === 0) return [];
  if (pages.length <= limit) return pages;
  if (limit <= 1) return [pages[0]];
  const selected = new Set<number>();
  for (let index = 0; index < limit; index++) {
    selected.add(pages[Math.round(index * (pages.length - 1) / (limit - 1))]);
  }
  return [...selected];
}

export function selectDrawingPages(
  allPages: IndexedDrawingPage[],
  scannedPageNumbers: number[],
  requestedPages: number[],
  totalPageCount: number,
  maxAutomaticPages = 10,
  maxScannedPages = 8,
) {
  const requested = new Set(requestedPages);
  const availableSlots = Math.max(0, Math.min(maxAutomaticPages, 36 - requested.size));
  const byNumber = new Map(allPages.map((page) => [page.page, page]));
  const manual = requestedPages.map((page) => ({
    ...(byNumber.get(page) || { page, text: "", score: 0, labels: [] }),
    score: Number.MAX_SAFE_INTEGER,
    labels: ["Manually selected page"],
  }));

  const selectedScannedPages = spreadPages(
    scannedPageNumbers.filter((page) => !requested.has(page)),
    Math.min(maxScannedPages, availableSlots),
  );
  const scanned = selectedScannedPages.map((page) => ({
    ...(byNumber.get(page) || { page, text: "", score: 0, labels: [] }),
    labels: ["Scanned page · visual review"],
  }));

  // Short PDFs are often just a few architectural sheets. Inspect all of them
  // visually, even when their title block text does not match a search term.
  const automaticPages = totalPageCount <= maxAutomaticPages
    ? allPages
    : allPages.filter((page) => page.score > 0);
  const automatic = automaticPages
    .filter((page) => !requested.has(page.page) && !selectedScannedPages.includes(page.page))
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .slice(0, Math.max(0, availableSlots - scanned.length));

  return {
    ranked: [...manual, ...scanned, ...automatic].sort((a, b) => a.page - b.page),
    visuallyReviewedScannedPages: new Set([
      ...selectedScannedPages,
      ...requestedPages.filter((page) => scannedPageNumbers.includes(page)),
    ]).size,
  };
}
