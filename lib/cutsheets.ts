export const documentCategories = ["Hardware components", "Door cutsheets", "Frame cutsheets", "Windows"];
export const hasCatalogDocuments = (category: string) => documentCategories.includes(category);
export function catalogBrandCategory(category: string): string | null {
  if (category === "Hardware components") return "Hardware brands";
  if (category === "Door cutsheets") return "Door brands";
  if (category === "Frame cutsheets") return "Frame brands";
  return null;
}
export function cutsheetMatchCategory(category: string): string | null {
  if (category === "Door cutsheets") return "Door materials";
  if (category === "Frame cutsheets") return "Frame types";
  return null;
}
