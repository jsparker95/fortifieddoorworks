import test from 'node:test';import assert from 'node:assert/strict';
import {expandedPathPointCount,MAX_VECTOR_POINTS,MAX_VECTOR_PDF_BYTES,vectorResourceLimit} from '../lib/drawing-takeoff/vector-limits';
test('native budget counts emitted points rather than packed scalar coordinates',()=>{
 assert.equal(expandedPathPointCount(new Float32Array([0,10,10,1,20,20,4])),3);
 assert.equal(expandedPathPointCount([0,0,0,2,1,0,2,1,3,2,3,4,4,5,5]),21);
 const lines=new Float32Array(500_000*3);for(let i=0;i<lines.length;i+=3){lines[i]=1;lines[i+1]=i;lines[i+2]=i;}
 assert.equal(expandedPathPointCount(lines),500_000);assert.ok(expandedPathPointCount(lines)!<MAX_VECTOR_POINTS);assert.ok(lines.length*2>MAX_VECTOR_POINTS);
 assert.equal(vectorResourceLimit(MAX_VECTOR_PDF_BYTES),null);assert.ok(vectorResourceLimit(MAX_VECTOR_PDF_BYTES+1));
});
test('unknown, truncated and non-finite path data fails closed',()=>{
 assert.equal(expandedPathPointCount([9,1,2]),null);assert.equal(expandedPathPointCount([2,1,2]),null);assert.equal(expandedPathPointCount([0,NaN,1]),null);
});
