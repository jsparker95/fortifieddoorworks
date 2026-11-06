import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, rgb } from 'pdf-lib';
import { inventoryOpeningRows, type PageIndex } from '../lib/drawing-takeoff/indexing';
import { readHardwareMatrix, matrixProfiles } from '../lib/drawing-takeoff/hardware-matrix';
import { mapAnalysisToPhaseRows } from '../lib/drawing-takeoff/phase-import';
import { productionLabels } from '../lib/labels';
import { submittalOpenings } from '../lib/submittal';
import { emptyData } from '../lib/types';

test('reads only filled source matrix cells, including offset CAD headings, without a model',async()=>{
 const b=(text:string,x:number,y:number,width=25,height=10)=>({text,x,y,width,height});
 const page:PageIndex={page:3,width:800,height:600,rotation:0,text:'DOOR SCHEDULE',lines:[],boxes:[b('DOOR SCHEDULE',30,10,150),b('MARK',30,50),b('WIDTH',110,50),b('HEIGHT',190,50),
 b('CLOSER(S)',300,100,10,90),b('BUTT HINGES',330,100,10,90),b('SILENCERS',360,100,10,90),b('SWEEPS',390,100,10,90),
 b('A1',30,200),b(`3'-0"`,110,200),b(`7'-0"`,190,200),b('A2',30,220),b(`3'-0"`,110,220),b(`7'-0"`,190,220)]};
 const pdf=await PDFDocument.create(),sheet=pdf.addPage([800,600]);
 for(const [x,y] of [[311,205],[341,205],[371,225]])sheet.drawCircle({x,y:600-y,size:5,color:rgb(0,0,0)});
 // A thin empty-cell rule is not a selection.
 sheet.drawLine({start:{x:405,y:350},end:{x:405,y:410},thickness:.4,color:rgb(0,0,0)});
 const result=await readHardwareMatrix(await pdf.save(),page,inventoryOpeningRows(page));
 assert.ok(result);assert.deepEqual(result.readings.map(r=>r.selected),[['CLOSER(S)','BUTT HINGES'],['SILENCERS']]);
 assert.ok(result.hardwareGroups.every(r=>r.quantityKnown===false&&r.brand===''));
});
test('matrix requirements share generated profiles, retain uncertainty, and save quantities as unknown',()=>{
 const result=matrixProfiles([{mark:'A1',sourcePage:3,selected:['HINGES','CLOSER'],uncertain:[]},{mark:'A2',sourcePage:3,selected:['CLOSER','HINGES'],uncertain:['SWEEP']}]);
 assert.equal(result.hardwareGroups.length,2);assert.equal(result.openingGroups[0].group,result.openingGroups[1].group);
 assert.match(result.uncertainties.join(' '),/A2.*SWEEP/);
 const saved=mapAnalysisToPhaseRows('doc',{hardwareGroups:result.hardwareGroups});
 assert.ok(saved.hardware!.every(r=>r.qty===''&&r.sourceRequirement===true));
});
test('labels and submittals show unknown quantities until someone supplies them',()=>{
 const data=emptyData();data.openings=[{id:'a',name:'A1',group:'P3-M1',doorType:'NA',wall:'NA'}];
 data.hardware=[{id:'h',group:'P3-M1',component:'BUTT HINGES',qty:'',quantityKnown:false,sourceRequirement:true}];
 assert.match(productionLabels(data,'Hardware')[0].lines[0].text,/Qty TBD.*BUTT HINGES/);
 assert.ok(submittalOpenings(data)[0].items.some(s=>/Qty TBD.*BUTT HINGES/.test(s)));
 data.hardware[0].qty=3;
 assert.match(productionLabels(data,'Hardware')[0].lines[0].text,/3ea\./);
 assert.ok(submittalOpenings(data)[0].items.some(s=>/3ea.*BUTT HINGES/.test(s)));
});
