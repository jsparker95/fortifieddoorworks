import type { z } from "zod";
import type { extractionSchema } from "./extraction-schema";
import { hardwareSections } from "./indexing";
import { hardwareSetKey } from "./references";

type Hardware = z.infer<typeof extractionSchema>["hardwareGroups"][number];

/** Recover product identity from one cited component line, never adjacent set notes. */
export function preserveHardwareIdentity<T extends {component:string;brand:string;quantity:number;evidence:string}>(row:T):T {
  const normalized=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,"");
  const component=row.component.replace(/^\[[^\]]+\]\s*/,"").trim();
  const tokens=component.match(/[A-Za-z0-9]+/g)||[];
  if(!tokens.length)return row;
  const candidates=row.evidence.split(/\r?\n/).flatMap(line=>{
    const match=line.trim().match(/^(\d+)\s+(EA|EACH|PR|PAIR|SETS?|PCS?|PIECES?)\b\s*(.+)$/i);
    if(!match||Number(match[1])!==row.quantity)return [];
    const body=match[3].trim(),key=normalized(body);
    if(row.brand.trim()&&!key.includes(normalized(row.brand)))return [];
    if(!tokens.every(token=>key.includes(normalized(token))))return [];
    return [{body,unit:match[2].toUpperCase()}];
  });
  const distinct=[...new Map(candidates.map(candidate=>[normalized(candidate.body),candidate])).values()];
  if(distinct.length!==1){
    if(distinct.length||!row.brand.trim())return row;
    // An inactive-leaf qualifier can identify a product without specifying a
    // numeric quantity. Preserve its identity, while withholding guessed counts.
    const unquantified=row.evidence.split(/\r?\n/).map(line=>line.trim().replace(/^(?:(?:INACTIVE|ACTIVE)\s+LEAF\s+ONLY\s+|(?:EA|EACH|PR|PAIR|SETS?|PCS?|PIECES?)\s+)/i,''))
      .filter(line=>normalized(line).startsWith(normalized(component))&&normalized(line).includes(normalized(row.brand)));
    const unique=[...new Set(unquantified)];
    const unit=row.component.match(/^\[[^\]]+\]\s*/)?.[0]||'';
    return unique.length===1?{...row,component:unit+unique[0],quantity:0,quantityKnown:false,sourceRequirement:true}:row;
  }
  const {body,unit}=distinct[0];
  const prefix=/^(?:EA|EACH|PCS?|PIECES?)$/.test(unit)?"":`[${unit}] `;
  return {...row,component:prefix+body};
}

/** Quantified printed rows are authoritative for part numbers and quantities. */
export function inventoryHardwareRows(text: string, sourcePage: number): Hardware[] {
  return hardwareSections(text).flatMap(section => {
    const heading = section.match(/^SET\s*(?:NO\.?\s*)?[:#]?\s*(\d+(?:\.\d+)?[A-Z-]*)(?=\s|\()/i);
    if (!heading) return [];
    const items = [...section.matchAll(/\b(\d+)\s+(EA|EACH|PR|PAIR|SETS?)\b/gi)];
    const title = section.slice(0, items[0]?.index ?? section.length).trim();
    return items.flatMap((item, index) => {
      const raw = section.slice(item.index! + item[0].length, items[index + 1]?.index ?? section.length).trim();
      if (!raw) return [];
      const noteIndex = raw.search(/\*?\s*BALANCE\s+OF\s+HARDWARE\s+BY\s+OTHERS/i);
      const body = (noteIndex < 0 ? raw : raw.slice(0, noteIndex)).trim();
      const note = noteIndex < 0 ? "" : raw.slice(noteIndex).replace(/^\s*\*/, "").trim();
      // These tables print a reference such as (HI-1) immediately before the
      // manufacturer column. Preserve its literal spelling, including typos.
      const manufacturer = body.match(/\([A-Z][A-Z0-9]*[-.]\d+[A-Z]?\)\s+([^()]+)$/i);
      const brand = manufacturer?.[1].trim() || "";
      const part = brand ? body.slice(0, body.length - brand.length).trim() : body;
      const unit = item[2].toUpperCase();
      return [{ group: heading[1], name: title, brand,
        component: `${unit === "EA" || unit === "EACH" ? "" : `[${unit}] `}${part}${note ? `; ${note}` : ""}`,
        quantity: Number(item[1]), frameModification: "", doorModification: "", doorPrep: "",
        sourcePage, evidence: `${title}\n${item[1]} ${unit} ${raw}`, confidence: 0.95 }];
    });
  });
}

/** Retain model output only for sets without a readable quantified inventory. */
export function reconcileHardwareRows(text: string, sourcePage: number, generated: Hardware[]) {
  const printed = inventoryHardwareRows(text, sourcePage);
  if (!printed.length) return generated;
  const groups = new Set(printed.map(row => hardwareSetKey(row.group)));
  return [...printed, ...generated.filter(row => !groups.has(hardwareSetKey(row.group)))];
}

/** Stable evidence allows a corrected part label to keep the same draft ID. */
export function sameHardwareSourceLine(left: unknown, right: unknown) {
  const key = (value: unknown) => {
    const line = String(value || "").match(/\b\d+\s+(?:EA|EACH|PR|PAIR|SETS?)\b[\s\S]*/i)?.[0]
      ||String(value||'').split(/\r?\n/).find(line=>/^(?:(?:INACTIVE|ACTIVE)\s+LEAF\s+ONLY|EA|EACH|PR|PAIR|SETS?|PCS?|PIECES?)\s+/i.test(line.trim()));
    return line?.replace(/\*?\s*BALANCE\s+OF\s+HARDWARE\s+BY\s+OTHERS[\s\S]*/i, "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "";
  };
  const a = key(left), b = key(right);
  return a.length >= 12 && a === b;
}

/** Searchable headings alone are not a readable component inventory. */
export function canUseHardwareText(text:string,sourcePage:number){
  if(!text.trim()||text.length>=10000)return false;
  const sections=hardwareSections(text);
  return sections.length>0&&sections.every(section=>inventoryHardwareRows(section,sourcePage).length>0);
}
