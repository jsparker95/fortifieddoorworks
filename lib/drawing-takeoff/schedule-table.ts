import type { Opening, PageIndex, TextBox } from "./indexing";

const cx = (b: TextBox) => b.x + b.width / 2;
const cy = (b: TextBox) => b.y + b.height / 2;
const label = (text: string) => text.toUpperCase().replace(/[^A-Z0-9#]/g, "");
const markPattern = /^(?=.*\d)[A-Z0-9]+(?:[-.][A-Z0-9]+)*$/i;
const sizePattern = /^(?:(?:\((\d+)\)|PAIR)\s*)?(\d+)\s*['’]\s*-?\s*(\d+(?:\s+\d+\/\d+)?|\d+\/\d+)\s*["”]$/i;

type Column = { key: string; box: TextBox };
export type ScheduleTable = { mark: TextBox; columns: Column[]; top: number; right: number; anchors: TextBox[];catalog?:boolean };

export function printedScheduleDimension(text: string, paired = false) {
  const m = text.trim().match(sizePattern);
  if (!m) return null;
  const inches = m[3].trim().split(/\s+/).reduce((sum, part) => sum + (part.includes("/") ? Number(part.split("/")[0]) / Number(part.split("/")[1]) : Number(part)), 0);
  if (inches >= 12) return null;
  const leaves = m[1] ? Number(m[1]) : /PAIR/i.test(text) || paired ? 2 : 1;
  if (leaves < 1 || leaves > 2) return null;
  const total = (Number(m[2]) * 12 + inches) * leaves;
  const leaf = `${Number(m[2])}'-${m[3].trim()}"`;
  return { value: leaves === 1 ? leaf : `${Math.floor(total / 12)}'-${Number((total % 12).toFixed(4))}"`, leaves, leaf };
}

/** Infer columns from their printed positions; PDF text drawing order is unrelated to table order. */
export function locateScheduleTables(page: Pick<PageIndex, "boxes" | "width" | "height">): ScheduleTable[] {
  const boxes = page.boxes;
  const titles = boxes.filter(b => /^(?:DOOR|OPENING|WINDOW)(?:\s|&|AND|FRAME|HARDWARE|WINDOW)*.*SCHEDUL/i.test(b.text.trim()) && !/SEE|REFER|AS SCHEDULED/i.test(b.text));
  const bareDoor=(b:TextBox)=>label(b.text)==='DOOR'&&boxes.some(w=>/^(WIDTH|W)$/.test(label(w.text))&&cx(w)>cx(b)+10&&cx(w)<cx(b)+250&&Math.abs(cy(w)-cy(b))<10)&&boxes.some(h=>/^(HEIGHT|H)$/.test(label(h.text))&&cx(h)>cx(b)+10&&cx(h)<cx(b)+300&&Math.abs(cy(h)-cy(b))<10);
  const headers = boxes.filter(b => /^(?:MARK|DOOR#|DOORNO|DOORNUMBER|DOORMARK|OPENING|OPENINGNO|OPENINGNUMBER|NUMBER|NO|#)$/.test(label(b.text))||bareDoor(b));
  const result: ScheduleTable[] = [];
  for (const mark of headers) {
    if (result.some(t => Math.abs(cx(t.mark) - cx(mark)) < 2 && Math.abs(cy(t.mark) - cy(mark)) < 20)) continue;
    const nearestTitle = titles.filter(t => t.y < mark.y && Math.abs(cx(t) - cx(mark)) < page.width * 0.5)
      .sort((a, b) => Math.abs(cy(a) - cy(mark)) + Math.abs(cx(a) - cx(mark)) * 0.15 - Math.abs(cy(b) - cy(mark)) - Math.abs(cx(b) - cx(mark)) * 0.15)[0];
    const explicitDoor = /DOOR|OPENING/.test(label(mark.text)) || boxes.some(b => label(b.text) === "DOOR" && Math.abs(cx(b) - cx(mark)) < mark.width && Math.abs(cy(b) - cy(mark)) < 35);
    if (!explicitDoor && (!nearestTitle || /^WINDOW/i.test(nearestTitle.text))) continue;
    const nextMark = headers.filter(b => cx(b) > cx(mark) + 80 && Math.abs(cy(b) - cy(mark)) < 35
      &&boxes.some(w=>/^(WIDTH|W)$/.test(label(w.text))&&cx(w)>cx(b)&&Math.abs(cy(w)-cy(b))<42)
      &&boxes.some(h=>/^(HEIGHT|H)$/.test(label(h.text))&&cx(h)>cx(b)&&Math.abs(cy(h)-cy(b))<42)).sort((a, b) => cx(a) - cx(b))[0];
    const limit = nextMark ? cx(nextMark) - 30 : page.width;
    const band = boxes.filter(b => cx(b) > cx(mark) + 5 && cx(b) < limit && Math.abs(cy(b) - cy(mark)) < 42 && b.height < 45);
    const width = band.filter(b => /^(WIDTH|W)$/.test(label(b.text))).sort((a, b) => cx(a) - cx(b))[0];
    const height = band.filter(b => /^(HEIGHT|H)$/.test(label(b.text)) && (!width || cx(b) > cx(width))).sort((a, b) => cx(a) - cx(b))[0];
    if (!width || !height) continue;
    const columns: Column[] = [{ key: "mark", box: mark }, { key: "width", box: width }, { key: "height", box: height }];
    const catalog=bareDoor(mark)&&band.some(b=>label(b.text)==='OPERATION')&&band.some(b=>label(b.text)==='DOORSTYLE');
    const direct: Record<string, string> = { HEAD: "_head", JAMB: "_jamb", THRES: "_threshold", THRESHOLD:'_threshold', OPERATION:'_operation',DOORSTYLE:'_doorStyle',PANIC:'_panic',FIREEXIT:'_fireExit',CONTROL:'_accessControl',T: "doorThickness", DOORTYPE: catalog?'doorMaterial':"doorType", FRAMETYPE: catalog?'frameMaterial':"frameType", HARDWARE:'hardwareGroup',HARDWARESET: "hardwareGroup", HARDWAREGROUP: "hardwareGroup", HDWR: "hardwareGroup", FIRERATING: "fireRating", LOCATION: "room", ROOMNAME: "room", COMMENTS: "scheduleNotes", REMARKS: "scheduleNotes", NOTES: "scheduleNotes", PAIR: "pair", DOORFINISH: "doorFinish", FRAMEFINISH: "frameFinish", FRAMEMAT: "frameMaterial", THICKNESS: "doorThickness" };
    for (const box of band) {
      let key = direct[label(box.text)];
      if(label(box.text)==='HARDWARE')for(const [parent,field] of [['PANIC','_panic'],['FIREEXIT','_fireExit']] as const)if(band.some(b=>label(b.text)===parent&&Math.abs(cx(b)-cx(box))<25&&b.y<box.y))key=field;
      if (label(box.text) === "TYPE") {
        const parent = boxes.filter(b => /^(DOOR|FRAME)$/.test(label(b.text)) && Math.abs(cx(b) - cx(box)) < Math.max(box.width, 20) && box.y >= b.y && box.y - b.y < 35).sort((a, b) => box.y - a.y - (box.y - b.y))[0];
        if (parent) key = label(parent.text) === "DOOR" ? "doorType" : "frameType";
        else if (!columns.some(c => c.key === "doorType")) key = "doorType";
      }
      if (label(box.text) === "MATERIAL") key = cx(box) < cx(width) ? "doorMaterial" : "frameMaterial";
      if (label(box.text) === "GROUP" && boxes.some(b => /^(HARDWARE|HDWR)$/.test(label(b.text)) && Math.abs(cx(b) - cx(box)) < 40 && Math.abs(cy(b) - cy(box)) < 30)) key = "hardwareGroup";
      if (label(box.text) === "RATING" && boxes.some(b => label(b.text) === "FIRE" && Math.abs(cx(b) - cx(box)) < 30 && Math.abs(cy(b) - cy(box)) < 30)) key = "fireRating";
      if (key && !columns.some(c => c.key === key)) columns.push({ key, box });
    }
    columns.sort((a, b) => cx(a.box) - cx(b.box));
    const markRight = Math.min(cx(width), ...columns.filter(c => c.key !== "mark" && cx(c.box) > cx(mark)).map(c => cx(c.box)));
    const markRadius = Math.max(10, (markRight - cx(mark)) * 0.42);
    const top = Math.max(mark.y + mark.height, width.y + width.height, height.y + height.height);
    const anchors = boxes.filter(b => b.y > top && Math.abs(cx(b) - cx(mark)) < markRadius && b.text.trim().length < 24 && markPattern.test(b.text.trim()))
      .sort((a, b) => a.y - b.y).filter((b, i, all) => !all.slice(0, i).some(a => a.text === b.text && Math.abs(a.y - b.y) < 2));
    const firstRowY = anchors[0]?.y;
    if (firstRowY !== undefined) for (const box of boxes) {
      const bottom = box.y + box.height;
      if (box.height > box.width * 1.8 && box.text.length < 120 && cx(box) > cx(mark) && cx(box) < limit
        && bottom <= firstRowY && bottom > firstRowY - Math.max(mark.height * 5, 45)
        && !columns.some(c => Math.abs(cx(c.box) - cx(box)) < 2)) columns.push({ key: `_matrix:${columns.length}`, box });
    }
    columns.sort((a, b) => cx(a.box) - cx(b.box));
    result.push({ mark, columns, top, right: limit, anchors,catalog });
  }
  return result;
}

export function inventoryGeometricSchedule(page: Pick<PageIndex, "page" | "boxes" | "width" | "height">): Opening[] {
  const rows: Opening[] = [];
  for (const table of locateScheduleTables(page)) {
    const candidates: Opening[] = [];
    for (let i = 0; i < table.anchors.length; i++) {
      const anchor = table.anchors[i], middle = cy(anchor);
      const before = table.anchors[i - 1], after = table.anchors[i + 1];
      const gap = Math.min(before ? middle - cy(before) : Infinity, after ? cy(after) - middle : Infinity, anchor.height * 2.2);
      if (gap < anchor.height * 0.6) continue;
      const read = (key: string) => {
        const column = table.columns.find(c => c.key === key);
        if (!column) return "";
        const index = table.columns.indexOf(column), x = cx(column.box);
        const left = index ? (x + cx(table.columns[index - 1].box)) / 2 : x - 20;
        const right = table.columns[index + 1] ? (x + cx(table.columns[index + 1].box)) / 2 : Math.min(table.right, x + Math.max(120, column.box.width * 2));
        return page.boxes.filter(b => cy(b) >= middle - gap * 0.49 && cy(b) <= middle + gap * 0.49 && cx(b) >= left && cx(b) < right)
          .sort((a, b) => a.y - b.y || a.x - b.x).map(b => b.text).join(" ").trim();
      };
      const width = printedScheduleDimension(read("width")), height = printedScheduleDimension(read("height"));
      if (!width || !height) continue;
      const doorType = read("doorType"), frameType = read("frameType"), hardwareGroup = read("hardwareGroup"), notes = read("scheduleNotes");
      // Long adjacent annotation prose is not a literal type/set identifier.
      if ([doorType, frameType, hardwareGroup].some(value => value.length > 40)) continue;
      const materials = Object.fromEntries(["doorMaterial", "doorFinish", "doorThickness", "frameMaterial", "frameFinish"].filter(key => table.columns.some(c => c.key === key)).map(key => [key, read(key)]));
      const values = { ...materials, width: width.value, height: height.value, doorType, frameType, hardwareGroup, fireRating: read("fireRating"), room: read("room") };
      candidates.push({ mark: anchor.text.trim(), ...values, handing: "", wallType: "", quantity: "1", sourcePage: page.page, confidence: 0.95,...(table.catalog?{scheduleRole:'catalog' as const,sourceCatalogFormat:'style-table' as const,autoImportEligible:false as const}:{}),
        doorTypeInventoried: table.columns.some(c => c.key === "doorType"), frameTypeInventoried: table.columns.some(c => c.key === "frameType"),
        hardwareGroupInventoried: table.columns.some(c => c.key === "hardwareGroup"), fireRatingInventoried: table.columns.some(c => c.key === "fireRating"),
        scheduleNotes: notes, leafCount: String(width.leaves), leafWidth: width.leaf,
        scheduleRowBox: { x: Math.max(0, table.mark.x - 10), y: middle - gap / 2, width: Math.min(page.width, table.right) - table.mark.x, height: gap },
        evidence: `Printed table row ${anchor.text.trim()}: ${Object.entries(values).map(([k, v]) => `${k}=${v || "[blank]"}`).join("; ")}${notes ? `; notes=${notes}` : ""}${width.leaves > 1 ? `; ${width.leaves} leaves of ${width.leaf}, assembly width ${width.value}` : ""}` });
    }
    if (candidates.length >= 2) rows.push(...candidates);
  }
  return rows.filter((row, i) => rows.findIndex(other => other.mark === row.mark) === i);
}
