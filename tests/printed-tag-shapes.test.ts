import test from 'node:test';import assert from 'node:assert/strict';
import {printedCapsuleTags} from '../lib/drawing-takeoff/printed-tag-shapes';
import type {VectorPath} from '../lib/drawing-takeoff/vector-geometry';
const label={text:'15',x:10,y:5,width:10,height:10};
const arc=(cx:number,from:number)=>Array.from({length:9},(_,i)=>({x:cx+5*Math.cos(from+i*Math.PI/8),y:10+5*Math.sin(from+i*Math.PI/8)}));
const paths:VectorPath[]=[{points:[{x:5,y:5},{x:25,y:5}]},{points:[{x:5,y:15},{x:25,y:15}]},{points:arc(25,-Math.PI/2)},{points:arc(5,Math.PI/2)}];
const codes=new Set(['15']);
test('separately stroked CAD capsule produces a held printed label with source bounds',()=>{
 const result=printedCapsuleTags([label],paths,codes);assert.equal(result.length,1);assert.equal(result[0].autoImportEligible,false);assert.equal(result[0].kind,'printed-capsule');assert.equal(result[0].visibility,'requires-source-review');assert.equal(result[0].text,'15');assert.deepEqual(result[0].outline,{x:0,y:5,width:30,height:10});
 assert.deepEqual(printedCapsuleTags([label,label],paths,codes),result);
});
test('grid circles, rectangular note boxes, open capsules and wrong catalog codes are rejected',()=>{
 const circle:VectorPath={points:Array.from({length:33},(_,i)=>({x:15+10*Math.cos(i*Math.PI/16),y:10+10*Math.sin(i*Math.PI/16)}))};
 const rect:VectorPath={points:[{x:0,y:5},{x:30,y:5},{x:30,y:15},{x:0,y:15},{x:0,y:5}]};
 assert.equal(printedCapsuleTags([label],[circle],codes).length,0);assert.equal(printedCapsuleTags([label],[rect],codes).length,0);
 assert.equal(printedCapsuleTags([label],paths.slice(0,3),codes).length,0);
 assert.equal(printedCapsuleTags([{...label,text:'16'}],paths,codes).length,0);
 assert.equal(printedCapsuleTags([label,{text:'NOTE',x:17,y:5,width:5,height:10}],paths,codes).length,0);
});
test('a dense perimeter rectangle and ambiguous nested capsules cannot mimic a capsule',()=>{
 const rect:VectorPath={points:[]};for(const [a,b] of [[{x:0,y:5},{x:30,y:5}],[{x:30,y:5},{x:30,y:15}],[{x:30,y:15},{x:0,y:15}],[{x:0,y:15},{x:0,y:5}]])for(let i=0;i<8;i++)rect.points.push({x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8});rect.points.push(rect.points[0]);
 assert.equal(printedCapsuleTags([label],[rect],codes).length,0);
 const nested=paths.map(p=>({points:p.points.map(q=>({x:15+(q.x-15)*1.1,y:10+(q.y-10)*1.1}))}));
 assert.equal(printedCapsuleTags([label],[...paths,...nested],codes).length,0);
});
