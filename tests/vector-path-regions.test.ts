import test from 'node:test';import assert from 'node:assert/strict';import {vectorPathRegions} from '../lib/drawing-takeoff/vector-path-regions';import {MAX_VECTOR_REGION_POINTS} from '../lib/drawing-takeoff/vector-limits';
test('spatial regions retain whole paths across overlaps while limiting graph joins',()=>{
 const left=Array.from({length:40_000},()=>({points:[{x:100,y:100},{x:101,y:101}]})),right=Array.from({length:40_000},()=>({points:[{x:900,y:100},{x:901,y:101}]})),cross={points:[{x:500,y:300},{x:530,y:330}]};
 const result=vectorPathRegions([...left,...right,cross],1100,600);assert.equal(result.skipped,0);assert.ok(result.regions.length>1);assert.ok(result.regions.every(region=>region.reduce((sum,p)=>sum+p.points.length,0)<=MAX_VECTOR_REGION_POINTS));assert.ok(result.regions.filter(region=>region.includes(cross)).length>=2);
});
test('a single over-budget component stays explicitly unsupported rather than being clipped into invented arcs',()=>{
 const huge={points:Array.from({length:MAX_VECTOR_REGION_POINTS+1},(_,i)=>({x:i%2,y:10}))};const result=vectorPathRegions([huge],512,512);assert.ok(result.skipped>0);assert.ok(result.regions.every(r=>!r.includes(huge)));
});
