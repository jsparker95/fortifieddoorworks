import {normalizeMark} from './geometry';
import {resolveOpeningHanding} from './schedule-evidence';

/** Geometry suggestions accompany the held label into explicit review. They
 * must not create an opening, adopt a nearby label's hand, or retain stale proof. */
export function reviewLabelHands(labels:Array<Record<string,unknown>>,observations:Array<Record<string,unknown>>,doorTypes:Array<{code:string;description:string}>=[]):Array<Record<string,unknown>>{
 return labels.map(label=>{
  if(label.sourceAnnotation!==true)return label;
  const cleared={...label,handing:'',handingEvidence:''};
  if(!['suggested','reviewer-selected'].includes(String(label.associationStatus)))return cleared;
  const matches=observations.filter(door=>normalizeMark(String(door.mark||''))===normalizeMark(String(label.mark||''))
   &&Number(door.sourcePage)===Number(label.sourcePage)&&String(door.sourceBuilding||'')===String(label.sourceBuilding||''));
  if(matches.length!==1||!matches[0].handing||!matches[0].handingEvidence)return cleared;
  const handing=resolveOpeningHanding({doorType:String(label.doorType||''),evidence:String(label.evidence||'')},String(matches[0].handing),doorTypes);
  return {...cleared,handing,handingEvidence:handing?String(matches[0].handingEvidence):''};
 });
}
