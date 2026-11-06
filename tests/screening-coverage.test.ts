import test from 'node:test';
import assert from 'node:assert/strict';
import {screeningCoverage,needsScreening} from '../lib/drawing-takeoff/screening-coverage';
test('regrouped successful batches supersede failed page coverage without repurchasing it',()=>{
 const failed={status:'failed',input:{pages:[62,63,64,65,66,67]}};
 const first={status:'complete',input:{pages:[58,62,63,64,65,66]},result:{pages:[1,2,3,4,5,6].map(page=>({page}))}};
 const last={status:'complete',input:{pages:[67,74]},result:{pages:[{page:1},{page:2}]}};
 const coverage=screeningCoverage([failed,first,last]);
 assert.deepEqual(coverage.unchecked,[]);assert.equal(needsScreening(failed,coverage.completed),false);
 const missing=screeningCoverage([failed,first]);
 assert.deepEqual(missing.unchecked,[67]);assert.equal(needsScreening(failed,missing.completed),true);
});
test('completed status alone cannot claim pages omitted from the returned classifications',()=>{
 const coverage=screeningCoverage([{status:'complete',input:{pages:[1,2,3]},result:{pages:[{page:1},{page:99}]}}]);
 assert.deepEqual(coverage.unchecked,[2,3]);
});
