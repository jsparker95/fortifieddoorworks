import { ProjectData, Row, stages } from "./types";
export const str = (v: unknown) =>
  v === undefined || v === null ? "" : String(v);
export const same = (a: unknown, b: unknown) =>
  str(a).toLowerCase() === str(b).toLowerCase();
export const eligible = (r: Row) => !r.deleted && !!str(r.name).trim();
export function derive(data: ProjectData) {
  const openings = data.openings.filter(eligible);
  const key = (v: unknown) => str(v).toLowerCase();
  const walls = new Map(data.walls.map((w) => [key(w.name), w]));
  const types = new Map(data.doorTypes.map((t) => [key(t.name), t]));
  const groupCounts = new Map<string, number>(),
    nameCounts = new Map<string, number>(),
    groups = new Map<string, Row[]>();
  for (const o of openings) {
    groupCounts.set(key(o.group), (groupCounts.get(key(o.group)) || 0) + 1);
    nameCounts.set(key(o.name), (nameCounts.get(key(o.name)) || 0) + 1);
  }
  for (const h of data.hardware) {
    const g = key(h.group);
    groups.set(g, [...(groups.get(g) || []), h]);
  }
  const hardware = data.hardware.map(
    (
      h,
    ): Row & {
      frameCount: number;
      lineQty: number;
      selectedBrand: unknown;
      selectedComponent: unknown;
    } => {
      const count = groupCounts.get(key(h.group)) || 0;
      return {
        ...h,
        selectedBrand: h.veSelected ? h.veBrand : h.brand,
        selectedComponent: h.veSelected ? h.veComponent : h.component,
        frameCount: count,
        lineQty: count * Number(h.qty || 0),
      };
    },
  );
  const frames: Row[] = openings.map((o) => {
    const wall = walls.get(key(o.wall));
    const mods = (groups.get(key(o.group)) || [])
      .filter((h) => h.frameMod)
      .map((h) => str(h.frameMod))
      .join(", ");
    const depth = str(wall?.size);
    const dims =
      str(o.width).replaceAll("/", "") + str(o.height).replaceAll("/", "");
    const partName = `${dims} ${depth} ${str(o.handing)} ${mods ? mods.replaceAll(",", "") + " " : ""}${str(o.frameType)}`;
    return { ...o, depth, accessories: mods, partName };
  });
  const doors: Row[] = frames.map((o) => {
    const t = types.get(key(o.doorType));
    const h = groups.get(key(o.group)) || [];
    const typ = h
      .filter((h) => h.doorMod)
      .map((h) => str(h.doorMod))
      .join(", ");
    const prep = h
      .filter((h) => h.doorPrep)
      .map((h) => str(h.doorPrep))
      .join(", ");
    const fire = str(t?.fire || o.fire);
    const material = str(t?.material);
    const window = str(t?.window);
    const partName = [
      material,
      str(o.width).replaceAll("/", "") + str(o.height).replaceAll("/", ""),
      str(o.handing),
      typ,
      window,
      fire,
      prep,
    ].join(" ");
    return {
      ...o,
      brand: str(t?.brand),
      material,
      window,
      fire,
      pr: str(t?.pr),
      typ,
      prep,
      partName,
    };
  });
  function group(items: Row[]) {
    const grouped = new Map<
      string,
      { name: string; count: number; openings: string[] }
    >();
    items.forEach((o) => {
      const name = str(o.partName);
      const v = grouped.get(name) || { name, count: 0, openings: [] };
      v.count++;
      v.openings.push(str(o.name));
      grouped.set(name, v);
    });
    return [...grouped.values()];
  }
  const hardwareTakeoff = new Map<
    string,
    { brand: string; name: string; count: number }
  >();
  hardware
    .filter((h) => h.frameCount > 0)
    .forEach((h) => {
      const brand = str(h.selectedBrand),
        name = str(h.selectedComponent),
        key = JSON.stringify([brand, name]);
      const v = hardwareTakeoff.get(key) || { brand, name, count: 0 };
      v.count += h.lineQty;
      hardwareTakeoff.set(key, v);
    });
  const frameTakeoff = group(frames.filter((o) => !same(o.wall, "NA")));
  const doorTakeoff = group(doors.filter((o) => !same(o.doorType, "NA")));
  const done = openings.reduce(
    (n, o) => n + stages.filter((s) => data.milestones[o.id]?.[s]).length,
    0,
  );
  const progress = openings.length
    ? Math.round((done / (openings.length * stages.length)) * 100)
    : 0;
  const warnings = openings.flatMap(
    (o) =>
      [
        !walls.has(key(o.wall)) && !same(o.wall, "NA")
          ? `${o.name}: wall type is missing`
          : null,
        !types.has(key(o.doorType)) && !same(o.doorType, "NA")
          ? `${o.name}: door type is missing`
          : null,
        !groups.has(key(o.group))
          ? `${o.name}: hardware group is missing`
          : null,
        (nameCounts.get(key(o.name)) || 0) > 1
          ? `${o.name}: duplicate opening mark`
          : null,
        /TBD/i.test(str(walls.get(key(o.wall))?.size))
          ? `${o.name}: wall size needs confirmation`
          : null,
      ].filter(Boolean) as string[],
  );
  return {
    frames,
    doors,
    hardware,
    frameTakeoff,
    doorTakeoff,
    hardwareTakeoff: [...hardwareTakeoff.values()],
    progress,
    warnings,
  };
}
