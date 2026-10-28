import type { Opening, TextBox } from "./indexing";

const center = (box: TextBox) => box.x + box.width / 2;
const label = (text: string) => text.toUpperCase().replace(/[^A-Z]/g, "");
const compact = (text: string) => text.replace(/[’]/g, "'").replace(/[”]/g, '"').replace(/\s+/g, "");

/** A compound door/frame table must be read by column, including printed blanks. */
export function compoundScheduleColumns(boxes: TextBox[], inventory: Opening[]): Map<string, Partial<Opening>> {
  const result = new Map<string, Partial<Opening>>();
  const labels = new Set(["MARK", "WIDTH", "HEIGHT", "MATERIAL", "FINISH", "THICKNESS", "HARDWARESET", "FIRERATING", "DOORTYPE", "COMMENTS"]);
  for (const mark of boxes.filter(box => label(box.text) === "MARK")) {
    const bottom = mark.y + mark.height;
    const headers = boxes.filter(box => labels.has(label(box.text)) && Math.abs(box.y + box.height - bottom) < 12 && center(box) >= center(mark) - 1)
      .sort((a, b) => center(a) - center(b));
    const named = (name: string) => headers.filter(box => label(box.text) === name);
    if (named("WIDTH").length !== 1 || named("HEIGHT").length !== 1 || named("DOORTYPE").length !== 1 || named("MATERIAL").length !== 2 || named("FINISH").length !== 2) continue;
    const marks = new Set(inventory.map(row => row.mark.toUpperCase()));
    const markRight = (center(mark) + center(named("WIDTH")[0])) / 2;
    const anchors = boxes.filter(box => marks.has(box.text.toUpperCase()) && Math.abs(center(box) - center(mark)) < (markRight - center(mark)) && box.y > bottom)
      .sort((a, b) => a.y - b.y);
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i], row = inventory.find(row => row.mark.toUpperCase() === anchor.text.toUpperCase())!;
      if (result.has(row.mark)) continue;
      const rowBottom = anchors[i + 1]?.y ?? anchor.y + (anchor.y - (anchors[i - 1]?.y ?? anchor.y - anchor.height * 1.5));
      const read = (header: TextBox | undefined) => {
        if (!header) return "";
        const index = headers.indexOf(header), x = center(header);
        const left = index ? (x + center(headers[index - 1])) / 2 : x - (center(headers[1]) - x) / 2;
        const right = index < headers.length - 1 ? (x + center(headers[index + 1])) / 2 : x + 300;
        return boxes.filter(box => box.y >= anchor.y - 2 && box.y < rowBottom - 2 && center(box) >= left && center(box) < right)
          .sort((a, b) => a.y - b.y || a.x - b.x).map(box => box.text).join(" ").replace(/MANUFA\s+CTURER/gi, "MANUFACTURER").trim();
      };
      // Adjacent drawing labels and a second table must not contaminate rows.
      if (compact(read(named("WIDTH")[0])) !== compact(row.width) || compact(read(named("HEIGHT")[0])) !== compact(row.height)) continue;
      const values = { doorType: read(named("DOORTYPE")[0]), doorMaterial: read(named("MATERIAL")[0]), doorFinish: read(named("FINISH")[0]),
        frameMaterial: read(named("MATERIAL")[1]), frameFinish: read(named("FINISH")[1]), doorThickness: read(named("THICKNESS")[0]),
        hardwareGroup: read(named("HARDWARESET")[0]), fireRating: read(named("FIRERATING")[0]) };
      result.set(row.mark, { ...values, doorTypeInventoried: true, hardwareGroupInventoried: !!named("HARDWARESET").length,
        fireRatingInventoried: !!named("FIRERATING").length, evidence: `Printed table row ${row.mark}: ${Object.entries(values).map(([key, value]) => `${key}=${value || "[blank]"}`).join("; ")}` });
    }
  }
  return result;
}
