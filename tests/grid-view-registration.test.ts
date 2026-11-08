import test from 'node:test';import assert from 'node:assert/strict';
import {registerGridViews} from '../lib/drawing-takeoff/grid-view-registration';
import {repeatedTagLocations} from '../lib/drawing-takeoff/overlapping-views';
import type {PageIndex,TextBox} from '../lib/drawing-takeoff/indexing';
const box=(text:string,x:number,y:number):TextBox=>({text,x,y,width:10,height:20});
function page(number:number,columns:string[],shift:number):PageIndex{
 const boxes:TextBox[]=[];
 for(const code of columns)for(const y of [100,1400])boxes.push(box(code,200+Number(code)*200+shift,y));
 for(const [i,code] of ['A','B','C','D'].entries())for(const x of [100,1900])boxes.push(box(code,x,300+i*200));
 return {page:number,width:2000,height:1500,boxes,text:'',lines:[],rotation:0};
}
const a={page:page(1,['1','2','3'],0),scope:'floor2'},b={page:page(2,['3','4','5'],-500),scope:'floor2'};
test('paired grid endpoints register cropped same-floor views using independent axes',()=>{
 const r=registerGridViews(a,b)!;assert.ok(r);assert.equal(r.dx,-500);assert.equal(r.dy,0);assert.equal(r.method,'paired-grid-axes');assert.equal(r.axisAnchors!.length,5);
 const matches=repeatedTagLocations(r,[box('11',900,700)],[box('11',400,700)]);assert.equal(matches.length,1);assert.equal(matches[0].anchorCount,5);assert.equal(matches[0].autoImportEligible,false);
});
test('one-off notes, inconsistent endpoints, different floors and scales cannot register grids',()=>{
 assert.equal(registerGridViews(a,{...b,scope:'floor3'}),null);
 assert.equal(registerGridViews(a,{...b,page:{...b.page,boxes:b.page.boxes.filter((_,i)=>i%2===0)}}),null);
 assert.equal(registerGridViews(a,{...b,page:{...b.page,boxes:b.page.boxes.map(p=>({...p,height:30}))}}),null);
 assert.equal(registerGridViews(a,{...b,page:{...b.page,boxes:b.page.boxes.map((p,i)=>i===0?{...p,y:p.y+10}:p)}}),null);
 const shifted={...b,page:{...b.page,boxes:b.page.boxes.map(p=>p.text==='D'?{...p,y:p.y+10}:p)}};
 assert.equal(registerGridViews(a,shifted),null);
});
test('repeated type codes alone, a rotated view and extra lookalike labels supply no alignment',()=>{
 const bare={...b,page:{...b.page,boxes:[box('11',400,700)]}};assert.equal(registerGridViews(a,bare),null);
 assert.equal(registerGridViews(a,{...b,page:{...b.page,rotation:90}}),null);
 assert.equal(registerGridViews(a,{...b,page:{...b.page,boxes:[...b.page.boxes,box('3',900,700)]}}),null);
});
test('smaller door-style numbers and note letters cannot contaminate the grid-size family',()=>{
 const notes=['3','3','A','A','B','B'].map((text,i)=>({...box(text,500+i*20,700),height:9}));
 const r=registerGridViews({...a,page:{...a.page,boxes:[...a.page.boxes,...notes]}},{...b,page:{...b.page,boxes:[...b.page.boxes,...notes]}});
 assert.ok(r);assert.equal(r.dx,-500);assert.equal(r.axisAnchors!.length,5);
});
