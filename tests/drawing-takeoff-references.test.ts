import test from 'node:test';
import assert from 'node:assert/strict';
import {hardwareSetIdentifier,hardwareSetKey} from '../lib/drawing-takeoff/references';
import {mapPhaseCandidate,mergePhaseCandidateRows} from '../lib/drawing-takeoff/phase-import';
test('hardware table headings and zero padding cannot break schedule-to-set links',()=>{
 assert.equal(hardwareSetIdentifier('SET #01'),'01');
 assert.equal(hardwareSetKey('SET #01'),hardwareSetKey('1'));
 assert.equal(hardwareSetIdentifier('Hardware Set No. 15-D'),'15-D');
 assert.notEqual(hardwareSetKey('15-D'),hardwareSetKey('15-F'));
 assert.equal(hardwareSetIdentifier('#03'),'03');
 assert.equal(hardwareSetKey('#03'),hardwareSetKey('03'));
 assert.equal(hardwareSetKey('DAYTON / #03'),hardwareSetKey('DAYTON / 3'));
 assert.notEqual(hardwareSetKey('DAYTON / 03'),hardwareSetKey('FULKS RUN / 03'));
 for(const value of ['N/A','N / A','None','Not applicable','—']) assert.equal(hardwareSetIdentifier(value),'');
});
test('corrected set punctuation updates a draft without duplicating or overwriting reviewed hardware',()=>{
 const source={group:'DAYTON / #03',component:'Closer',sourcePage:14,sourceBuilding:'DAYTON',quantity:1};
 const prior=mapPhaseCandidate('doc','hardware',source,0);
 const corrected=mapPhaseCandidate('doc','hardware',{...source,group:'DAYTON / 03'},0);
 const merged=mergePhaseCandidateRows([prior],[corrected]);
 assert.equal(merged.length,1);
 assert.equal(merged[0].id,prior.id);
 assert.equal(merged[0].group,'DAYTON / 03');
 const reviewed={...prior,reviewState:'human-reviewed',qty:7};
 assert.deepEqual(mergePhaseCandidateRows([reviewed],[corrected]),[reviewed]);
 const elsewhere=mapPhaseCandidate('doc','hardware',{...source,group:'FULKS RUN / 03',sourceBuilding:'FULKS RUN'},0);
 assert.equal(mergePhaseCandidateRows([prior],[elsewhere]).length,2);
});
