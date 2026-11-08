import test from 'node:test';import assert from 'node:assert/strict';
import {reviewLabelHands} from '../lib/drawing-takeoff/review-label-hands';
import {reviewedCandidateRows} from '../lib/drawing-takeoff/reviewed-candidates';
const label={mark:'U101',sourceAnnotation:true,associationStatus:'suggested',sourcePage:2,sourceSchedulePage:9,sourceBuilding:'East',doorType:'A',width:'3/0',height:'6/8',room:'Guestroom entry',autoImportEligible:false,handing:''};
const observation={mark:'U101',sourcePage:2,sourceBuilding:'East',handing:'RH',handingEvidence:'Visible arc and leaf; exact source unit card; both boundary checks agree.'};
test('a grounded hand follows its held label through explicit review and retains the evidence',()=>{
 const [candidate]=reviewLabelHands([label],[observation]);assert.equal(candidate.handing,'RH');assert.equal(candidate.autoImportEligible,false);
 const saved=reviewedCandidateRows('doc',[{kind:'openings',row:candidate,index:0}]);
 assert.equal(saved.openings?.[0].handing,'RH');assert.equal(saved.openings?.[0].handingEvidence,observation.handingEvidence);
 assert.equal(saved.openings?.[0].reviewState,'human-reviewed');
 assert.equal(label.handing,'','source candidate is not mutated');
});
test('other pages, buildings, duplicate views, ambiguous labels and stale hands remain withheld',()=>{
 const stale={...label,handing:'LH',handingEvidence:'Old proof'};
 for(const observations of [[{...observation,sourcePage:3}],[{...observation,sourceBuilding:'West'}],[observation,observation],[{...observation,handingEvidence:''}],[]]){
  const [candidate]=reviewLabelHands([stale],observations);assert.equal(candidate.handing,'');assert.equal(candidate.handingEvidence,'');
 }
 assert.equal(reviewLabelHands([{...label,associationStatus:'ambiguous'}],[observation])[0].handing,'');
 assert.equal(reviewLabelHands([{...label,evidence:'Overhead coiling door'}],[observation])[0].handing,'');
});
