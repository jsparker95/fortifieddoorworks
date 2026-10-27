import test from 'node:test';
import assert from 'node:assert/strict';
import {hardwareSetIdentifier,hardwareSetKey} from '../lib/drawing-takeoff/references';
test('hardware table headings and zero padding cannot break schedule-to-set links',()=>{
 assert.equal(hardwareSetIdentifier('SET #01'),'01');
 assert.equal(hardwareSetKey('SET #01'),hardwareSetKey('1'));
 assert.equal(hardwareSetIdentifier('Hardware Set No. 15-D'),'15-D');
 assert.notEqual(hardwareSetKey('15-D'),hardwareSetKey('15-F'));
});
