/** Native CAD expansion is optional. Keep a single dense sheet from killing the worker. */
export const MAX_VECTOR_PDF_BYTES = 8 * 1024 * 1024;
export const MAX_VECTOR_SOURCE_BYTES = 32 * 1024 * 1024;
export const MAX_VECTOR_POINTS = 1_000_000;
export const MAX_VECTOR_REGION_POINTS = 150_000;
export function vectorResourceLimit(byteLength: number) {
  return byteLength > MAX_VECTOR_PDF_BYTES
    ? "This dense drawing exceeds the native geometry memory budget. Door handing requires manual review; schedule extraction continues."
    : null;
}

/** Count the points actually emitted by the bounded path sampler. Packed
 * operator numbers and coordinate scalars are not separate geometry points. */
export function expandedPathPointCount(data:ArrayLike<number>):number|null {
  let points=0;
  for(let i=0;i<data.length;){
    const operation=data[i++];
    const coordinates=operation===0||operation===1?2:operation===2?6:operation===3?4:operation===4?0:null;
    if(coordinates===null||i+coordinates>data.length)return null;
    for(let end=i+coordinates;i<end;i++)if(!Number.isFinite(data[i]))return null;
    points+=operation===2||operation===3?10:1;
  }
  return points;
}
