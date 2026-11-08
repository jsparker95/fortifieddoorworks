import test from 'node:test';import assert from 'node:assert/strict';
import {registerOverlappingViews,repeatedTagLocations} from '../lib/drawing-takeoff/overlapping-views';
import type {PageIndex,TextBox} from '../lib/drawing-takeoff/indexing';
const box=(text:string,x:number,y:number):TextBox=>({text,x,y,width:20,height:10});
const page=(number:number,boxes:TextBox[]):PageIndex=>({page:number,boxes,width:2000,height:1500,rotation:0,text:'',lines:[]});
const source=[box('201',700,400),box('202',900,400),box('203',1100,650)],target=source.map(b=>({...b,x:b.x-400,y:b.y+100}));
const a={page:page(1,source),scope:'floor2'},b={page:page(2,target),scope:'floor2'};
test('three distinct room anchors register source views; matching tag is held as a duplicate proposal',()=>{
 const r=registerOverlappingViews(a,b)!;assert.equal(r.dx,-400);assert.equal(r.dy,100);assert.equal(r.anchors.length,3);
 const tag=box('11',1000,600),other=box('11',600,700),matches=repeatedTagLocations(r,[tag],[other]);
 assert.equal(matches.length,1);assert.equal(matches[0].autoImportEligible,false);assert.equal(matches[0].anchorCount,3);
 assert.equal(repeatedTagLocations(r,[tag],[{...other,text:'12'}]).length,0);
});
test('different floors, scales, sparse anchors and multiple translations are rejected',()=>{
 assert.equal(registerOverlappingViews(a,{...b,scope:'floor3'}),null);
 assert.equal(registerOverlappingViews({...a,scope:''},{...b,scope:''}),null);
 assert.equal(registerOverlappingViews(a,{...b,page:page(2,target.slice(0,2))}),null);
 assert.equal(registerOverlappingViews(a,{...b,page:page(2,target.map(p=>({...p,height:20})))}),null);
 const extra=[box('301',600,900),box('302',800,900),box('303',1000,1000)];
 assert.equal(registerOverlappingViews({...a,page:page(1,[...source,...extra])},{...b,page:page(2,[...target,...extra.map(p=>({...p,x:p.x+100}))])}),null);
});
test('repeated-room lookalikes and ambiguous tag matches cannot merge locations',()=>{
 assert.equal(registerOverlappingViews({...a,page:page(1,[...source,{...source[0],x:1300}])},b),null);
 const r=registerOverlappingViews(a,b)!,tag=box('11',1000,600),other=box('11',600,700);
 assert.equal(repeatedTagLocations(r,[tag],[other,{...other,x:601}]).length,0);
 assert.equal(repeatedTagLocations(r,[tag,{...tag,x:1001}],[other]).length,0);
 assert.equal(repeatedTagLocations(r,[tag],[{...other,x:650}]).length,0);
});
