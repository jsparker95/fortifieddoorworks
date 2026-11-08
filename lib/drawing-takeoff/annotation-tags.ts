import type {TextBox} from './indexing';

type Annotation={subtype?:string;contentsObj?:{str?:string};rect?:number[];annotationFlags?:number};

/** Read visible labels only. Comments, links and annotation actions are never executed. */
export function visibleAnnotationTags(annotations:Annotation[],transform:number[],width:number,height:number):TextBox[] {
  const result:TextBox[]=[];
  for(const annotation of annotations){
    const text=annotation.contentsObj?.str?.trim()||'',rect=annotation.rect;
    if(annotation.subtype!=='FreeText'||((annotation.annotationFlags||0)&35)||text.length>60
      ||!/(?=.*\d)^[A-Z0-9]+(?:[.-][A-Z0-9]+)*$/i.test(text)||!rect||rect.length!==4||!rect.every(Number.isFinite))continue;
    const corners=[[rect[0],rect[1]],[rect[2],rect[1]],[rect[0],rect[3]],[rect[2],rect[3]]].map(([x,y])=>({x:transform[0]*x+transform[2]*y+transform[4],y:transform[1]*x+transform[3]*y+transform[5]}));
    const left=Math.max(0,Math.min(...corners.map(p=>p.x))),top=Math.max(0,Math.min(...corners.map(p=>p.y)));
    const right=Math.min(width,Math.max(...corners.map(p=>p.x))),bottom=Math.min(height,Math.max(...corners.map(p=>p.y)));
    if(![left,top,right,bottom].every(Number.isFinite)||right<=left||bottom<=top)continue;
    if(result.some(box=>box.text===text&&Math.abs(box.x-left)<.1&&Math.abs(box.y-top)<.1))continue;
    result.push({text,x:left,y:top,width:right-left,height:bottom-top});
  }
  return result;
}
