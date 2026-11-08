import test from 'node:test';import assert from 'node:assert/strict';import {printedCircleTags} from '../lib/drawing-takeoff/printed-tag-shapes';
const circle=(dx=0,r=10)=>({points:Array.from({length:33},(_,i)=>({x:50+dx+r*Math.cos(i*Math.PI/16),y:50+r*Math.sin(i*Math.PI/16)}))});
const label={text:'10',x:47,y:45,width:6,height:9},codes=new Set(['10']),door={hinge:{x:40,y:60},jamb:{x:70,y:60},radius:30};
test('circle style tag needs small centered catalog text and a nearby swing',()=>{
 const found=printedCircleTags([label],[circle()],codes,[door]);assert.equal(found.length,1);assert.equal(found[0].kind,'printed-circle');assert.equal(found[0].autoImportEligible,false);
 assert.equal(printedCircleTags([label],[circle()],codes,[]).length,0);
 assert.equal(printedCircleTags([{...label,text:'183'}],[circle()],codes,[door]).length,0);
 assert.equal(printedCircleTags([{...label,height:18,y:41}],[circle()],codes,[door]).length,0); // Large grid-number family.
});
test('subpixel CAD overdraw is one outline; distinct rings or competing text remain ambiguous',()=>{
 assert.equal(printedCircleTags([label],[circle(),circle(.12)],codes,[door]).length,1);
 assert.equal(printedCircleTags([label],[circle(),circle(0,12)],codes,[door]).length,0);
 assert.equal(printedCircleTags([label,{...label,text:'8',x:50}],[circle()],codes,[door]).length,0);
});

test('formal catalog circles without a swing remain unverified review evidence with blank attributes',async()=>{
 const {printedReviewCandidates}=await import('../lib/drawing-takeoff/printed-review-candidates');
 const held=printedCircleTags([label],[circle()],codes,[],true);assert.equal(held.length,1);assert.equal(held[0].autoImportEligible,false);
 const rows=printedReviewCandidates([{page:1,shape:held[0],visibility:'visible-outline',doorContext:'unverified'}],[{code:'10',sourcePage:104,sourceCatalogDefinition:true,width:'3/0',height:'6/8'}]);assert.equal(rows.length,1);assert.equal(rows[0].width,'');assert.equal(rows[0].doorType,'');assert.equal(rows[0].handing,'');
});
