import {scheduleFields} from './schedule-fields';
import type {Kind,Row} from '../types';
import {mapPhaseCandidate,phaseCandidateKey} from './phase-import';

type Candidate={kind:Kind;row:Record<string,unknown>;index:number};
const scoped=(building:unknown,value:unknown)=>{const scope=String(building||''),text=String(value||'');return scope&&text&&!text.startsWith(`${scope} / `)?`${scope} / ${text}`:text;};
export const isDrawingReviewLabel=(row:Record<string,unknown>)=>row.sourceAnnotation===true||row.sourcePrintedTag===true;
const reviewSource=(kind:Kind,row:Record<string,unknown>)=>isDrawingReviewLabel(row)?{...row,doorType:scoped(row.sourceBuilding,row.doorType),hardwareGroup:scoped(row.sourceBuilding,row.hardwareGroup)}
  :kind==='doorTypes'&&row.sourceCatalogCode?{...row,code:scoped(row.sourceBuilding,row.code)}:row;
export const reviewCandidateKey=(documentId:string,kind:Kind,row:Record<string,unknown>,index:number)=>phaseCandidateKey(documentId,kind,reviewSource(kind,row),index);
export const catalogChoiceKey=(row:Record<string,unknown>)=>JSON.stringify([row.sourcePage,String(row.sourceBuilding||''),String(row.code||'')]);
export const validCatalogChoice=(row:Record<string,unknown>)=>row.sourceCatalogDefinition===true&&typeof row.code==='string'&&!!row.code.trim()&&Number.isInteger(row.sourcePage)&&Number(row.sourcePage)>0;

/** A reviewer can choose a source entry; choosing it still does not save a row. */
export function chooseAnnotationCatalog(row:Record<string,unknown>,definition:Record<string,unknown>):Record<string,unknown>{
  if(!isDrawingReviewLabel(row)||!validCatalogChoice(definition))throw new Error('Choose a printed schedule entry for this drawing label.');
  const evidence=`Reviewer selected printed schedule entry ${definition.code} on PDF page ${definition.sourcePage}.`;
  const sameSource=String(row.sourceCatalogCode||'')===String(definition.code)&&Number(row.sourceSchedulePage)===Number(definition.sourcePage)
    &&String(row.sourceBuilding||'')===String(definition.sourceBuilding||'')&&String(row.room||'')===String(definition.description||'');
  return {...row,...scheduleFields(definition),...(!sameSource||Number(definition.leafCount)>1?{handing:'',handingEvidence:''}:{}),room:String(definition.description||''),width:String(definition.width||''),height:String(definition.height||''),doorType:String(definition.code),frameType:String(definition.frameType||''),hardwareGroup:String(definition.hardwareGroup||''),fireRating:String(definition.fireRating||''),
    sourceCatalogCode:String(definition.code),sourceSchedulePage:Number(definition.sourcePage),sourceBuilding:String(definition.sourceBuilding||''),associationStatus:'reviewer-selected',associationEvidence:evidence,
    evidence:`${row.evidence||''}\n${evidence} ${definition.evidence||''}`,autoImportEligible:false};
}
/** Only an explicit review action saves held annotation suggestions. */
export function reviewedCandidateRows(documentId:string,selected:Candidate[],definitions:Array<Record<string,unknown>>=[],existingOpenings:Row[]=[]){
  const result:Partial<Record<Kind,Row[]>>={};
  const relatedKeys=(row:Record<string,unknown>):string[]=>{
    try{return (JSON.parse(String(row.sourcePossibleDuplicates||'[]')) as Array<Record<string,unknown>>).flatMap(other=>other.annotationMark?[phaseCandidateKey(documentId,'openings',{mark:other.annotationMark,sourcePage:other.page},0)]:typeof other.locationKey==='string'?[`${documentId}:openings:${other.locationKey}`]:[]);}catch{return [];}
  };
  const selectedKeys=new Set(selected.filter(c=>c.kind==='openings').map(c=>reviewCandidateKey(documentId,c.kind,c.row,c.index)));
  const existing=existingOpenings.filter(row=>row.sourceDocumentId===documentId&&row.reviewState==='human-reviewed');
  const append=(kind:Kind,row:Row)=>{const rows=result[kind]||=[];const index=rows.findIndex(existing=>existing.sourceCandidateKey===row.sourceCandidateKey);if(index<0)rows.push(row);else if(rows[index].reviewState==='ai-draft'&&row.reviewState==='human-reviewed')rows[index]={...row,id:rows[index].id};};
  for(const candidate of selected){
    if(candidate.row.sourcePrintedTag===true&&(!String(candidate.row.mark||'').trim()||String(candidate.row.mark).startsWith('Unnumbered p')))throw new Error('Enter an opening name or number after reviewing the printed source location.');
    if(candidate.row.sourcePrintedTag===true&&(candidate.row.sourceOverlapReviewRequired===true||candidate.row.sourcePossibleDuplicates&&candidate.row.sourcePossibleDuplicates!=='[]')&&!['primary-view','confirmed-separate-opening'].includes(String(candidate.row.sourceDuplicateDecision)))throw new Error('Review the possible repeated view before adding this location as a separate opening.');
    if(candidate.kind==='openings'){
      const ownKey=reviewCandidateKey(documentId,candidate.kind,candidate.row,candidate.index);
      if(candidate.row.sourceDuplicateDecision!=='confirmed-separate-opening'&&(
        candidate.row.sourceDuplicateDecision==='primary-view'&&relatedKeys(candidate.row).some(key=>selectedKeys.has(key)||existing.some(row=>row.sourceCandidateKey===key))
        ||existing.some(row=>row.sourceDuplicateDecision==='primary-view'&&relatedKeys(row).includes(ownKey))
      ))throw new Error('Another selected or reviewed source view already represents this opening. Choose one view, or explicitly confirm a separate physical opening.');
    }
    const source=reviewSource(candidate.kind,candidate.row);
    append(candidate.kind,mapPhaseCandidate(documentId,candidate.kind,source,candidate.index,'human-reviewed'));
    if(candidate.kind!=='openings'||!isDrawingReviewLabel(candidate.row)||!['suggested','reviewer-selected'].includes(String(candidate.row.associationStatus)))continue;
    const matches=definitions.filter(row=>row.code===candidate.row.sourceCatalogCode&&row.sourcePage===candidate.row.sourceSchedulePage&&String(row.sourceBuilding||'')===String(candidate.row.sourceBuilding||''));
    if(matches.length!==1)continue;
    const definition=mapPhaseCandidate(documentId,'doorTypes',{...matches[0],code:scoped(matches[0].sourceBuilding,matches[0].code)},0);
    append('doorTypes',definition);
  }
  return result;
}
