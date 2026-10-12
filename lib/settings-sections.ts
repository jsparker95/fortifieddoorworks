export const settingsCategories = [
  "Door brands",
  "Door materials",
  "Windows",
  "Handing",
  "Fire ratings",
  "Frame brands",
  "Frame types",
  "Anchors",
  "Hardware brands",
  "Hardware components",
  "Frame modifications",
  "Door modifications",
  "Material reference",
] as const;

export type SettingsCategory = (typeof settingsCategories)[number];

const categoryBySlug = new Map<string, SettingsCategory>(
  settingsCategories.map((category) => [
    category.toLowerCase().replaceAll(" ", "-"),
    category,
  ]),
);

export function settingsCategoryFromSearch(search: string): SettingsCategory {
  const section = new URLSearchParams(search).get("section")?.toLowerCase();
  return (section && categoryBySlug.get(section)) || settingsCategories[0];
}

export function settingsSectionUrl(search: string, category: SettingsCategory): string {
  const params = new URLSearchParams(search);
  params.set("section", category.toLowerCase().replaceAll(" ", "-"));
  return `/settings?${params.toString()}`;
}
