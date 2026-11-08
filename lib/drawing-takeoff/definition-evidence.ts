import type { Opening, PageIndex } from './indexing';

type ScheduleTask = {kind:string;status:string;input:{pages:number[];building?:string};result:Record<string,unknown>|null};

/** Image schedules have no literal TYPE column. Cross-check separate diagram
 * reads against the completed opening rows, never against a diagram's own claim. */
export function scheduleTypeReferences(tasks: ScheduleTask[], building = '') {
  return [...new Set(tasks.filter(task=>task.kind==='doors'&&task.status==='complete'&&(task.input.building||'')===building)
    .flatMap(task=>(Array.isArray(task.result?.openings)?task.result.openings:[])
      .filter((row):row is Record<string,unknown>=>!!row&&typeof row==='object')
      .filter(row=>typeof row.mark==='string'&&row.mark.trim()&&task.input.pages.includes(Number(row.sourcePage))))
    .map(row=>typeof row.doorType==='string'?row.doorType.trim().toUpperCase():'').filter(Boolean))];
}

/** A numbered head/jamb detail is not a door type. Prefer the actual TYPE-column codes. */
export function doorTypeDefinitionSupported(type: {code:string;description?:string;evidence?:string}, inventory: Opening[], imageReferences: string[] = []) {
  const known=new Set(inventory.filter(row=>row.doorTypeInventoried&&row.doorType).map(row=>row.doorType.trim().toUpperCase()));
  if(!known.size)for(const code of imageReferences)known.add(code.trim().toUpperCase());
  if(known.size)return known.has(type.code.trim().toUpperCase());
  return !/\b(?:DOOR\s+THRESHOLD\s+DETAIL|(?:DOOR|FRAME).*\b(?:HEAD|JAMB|HEADER)\b.*(?:DETAIL|FRAMED|STUD)|^(?:HOLLOW METAL\s+)?DOOR\s+(?:HEAD|JAMB|HEADER)(?:[ /]|$))/i.test(type.description||'');
}

/** Finish transitions and base details reference wall types; they do not define new assemblies. */
export function wallDefinitionSupported(page: PageIndex, row: {description?:string}) {
  if(/^(?:TYP\.?\s*)?(?:BASE\s*-?\s*TILE|TILE\s*-?\s*BASE|RUBBER BASE|TILE.*(?:TRANSITION|CORNER)|TILE TO GYPSUM)/i.test(row.description||''))return false;
  const heading=/^(?:(?:INTERIOR|EXTERIOR|CONCRETE|TYPICAL)\s+)?(?:WALL|PARTITION)\s+(?:TYPES?(?:\s+SCHEDULE)?|ASSEMBLIES|ASSEMBLY\s+SCHEDULE|SCHEDULE)\b/i;
  return page.boxes.some(box=>heading.test(box.text.trim()))||page.lines.some(line=>line.length<150&&heading.test(line.trim()));
}
