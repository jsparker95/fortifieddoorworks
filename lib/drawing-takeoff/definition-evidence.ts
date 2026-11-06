import type { Opening, PageIndex } from './indexing';

/** A numbered head/jamb detail is not a door type. Prefer the actual TYPE-column codes. */
export function doorTypeDefinitionSupported(type: {code:string;description?:string;evidence?:string}, inventory: Opening[]) {
  const known=new Set(inventory.filter(row=>row.doorTypeInventoried&&row.doorType).map(row=>row.doorType.trim().toUpperCase()));
  if(known.size)return known.has(type.code.trim().toUpperCase());
  return !/\b(?:DOOR\s+THRESHOLD\s+DETAIL|(?:DOOR|FRAME).*\b(?:HEAD|JAMB|HEADER)\b.*(?:DETAIL|FRAMED|STUD)|^(?:HOLLOW METAL\s+)?DOOR\s+(?:HEAD|JAMB|HEADER)(?:[ /]|$))/i.test(type.description||'');
}

/** Finish transitions and base details reference wall types; they do not define new assemblies. */
export function wallDefinitionSupported(page: PageIndex, row: {description?:string}) {
  if(/^(?:TYP\.?\s*)?(?:BASE\s*-?\s*TILE|TILE\s*-?\s*BASE|RUBBER BASE|TILE.*(?:TRANSITION|CORNER)|TILE TO GYPSUM)/i.test(row.description||''))return false;
  const heading=/^(?:(?:INTERIOR|EXTERIOR|CONCRETE|TYPICAL)\s+)?(?:WALL|PARTITION)\s+(?:TYPES?(?:\s+SCHEDULE)?|ASSEMBLIES|ASSEMBLY\s+SCHEDULE|SCHEDULE)\b/i;
  return page.boxes.some(box=>heading.test(box.text.trim()))||page.lines.some(line=>line.length<150&&heading.test(line.trim()));
}
