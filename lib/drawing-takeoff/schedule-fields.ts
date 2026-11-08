const text=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value):'';
/** Keep literal schedule attributes across catalog suggestions and review.
 * Blanks deliberately clear attributes from a previously selected definition. */
export function scheduleFields(row:Record<string,unknown>|undefined){
 return {
  doorMaterial:text(row?.material!==undefined?row.material:row?.doorMaterial),doorFinish:text(row?.doorFinish),doorThickness:text(row?.doorThickness),
  frameMaterial:text(row?.frameMaterial),frameFinish:text(row?.frameFinish),scheduleNotes:text(row?.scheduleNotes),
  leafCount:text(row?.leafCount),leafWidth:text(row?.leafWidth),
  sourceScheduleDoorType:text(row?.sourceScheduleDoorType??(row?.mark?row.doorType:undefined)),
 };
}

/** A pair flag does not establish whether a bare size is per leaf or overall. */
export function pairSizeReviewNotes(rows:Array<Record<string,unknown>>){
 return [...new Set(rows.filter(row=>Number(row.leafCount)>1&&!text(row.leafWidth)).map(row=>
  `PDF page ${row.sourcePage}: schedule entry ${text(row.mark||row.code)} is a pair. Printed width ${text(row.width)} is retained; per-leaf width is not confirmed. Review the source before fabrication.`))];
}
