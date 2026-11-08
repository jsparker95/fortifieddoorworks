import test from 'node:test';
import assert from 'node:assert/strict';
import {doorTypeDefinitionSupported,scheduleTypeReferences,wallDefinitionSupported} from '../lib/drawing-takeoff/definition-evidence';
import type {Opening,PageIndex} from '../lib/drawing-takeoff/indexing';
test('type-column evidence excludes invented detail codes but retains actual type definitions',()=>{
 const inventory=[{doorType:'2',doorTypeInventoried:true}] as Opening[];
 assert.equal(doorTypeDefinitionSupported({code:'DT-07',description:'Door in aluminum frame (wood framed header)'},inventory),false);
 assert.equal(doorTypeDefinitionSupported({code:'2',description:'Solid core wood'},inventory),true);
 assert.equal(doorTypeDefinitionSupported({code:'A',description:'Door threshold detail'},[]),false);
 assert.equal(doorTypeDefinitionSupported({code:'A',description:'Flush wood leaf elevation'},[]),true);
});
test('outlined schedules cross-check diagram codes against separate completed opening reads',()=>{
 const tasks=[
  {kind:'doors',status:'complete',input:{pages:[9],building:'A'},result:{openings:[{mark:'101',doorType:'A',sourcePage:9},{mark:'102',doorType:'B',sourcePage:9},{mark:'103',doorType:'BAD-CITATION',sourcePage:10}]}},
  {kind:'types',status:'complete',input:{pages:[9],building:'A'},result:{openings:[{mark:'101',doorType:'DT-1',sourcePage:9}]}},
  {kind:'doors',status:'failed',input:{pages:[9],building:'A'},result:{openings:[{mark:'101',doorType:'FAILED',sourcePage:9}]}},
  {kind:'doors',status:'complete',input:{pages:[10],building:'B'},result:{openings:[{mark:'101',doorType:'OTHER-BUILDING',sourcePage:10}]}},
 ];
 const codes=scheduleTypeReferences(tasks,'A');assert.deepEqual(codes,['A','B']);
 assert.equal(doorTypeDefinitionSupported({code:'DT-1',evidence:'DOOR TYPES diagram DT-1'},[],codes),false);
 assert.equal(doorTypeDefinitionSupported({code:'A',description:'Flush wood leaf elevation'},[],codes),true);
 assert.equal(doorTypeDefinitionSupported({code:'B'},[],codes),true);
 assert.equal(doorTypeDefinitionSupported({code:'A'},[{doorType:'C',doorTypeInventoried:true}] as Opening[],codes),false,'literal TYPE column takes precedence');
 assert.deepEqual(scheduleTypeReferences(tasks,'B'),['OTHER-BUILDING']);
});
test('wall diagrams need an actual type heading; references and finish details are excluded',()=>{
 const page={page:1,width:800,height:600,rotation:0,text:'STUD WALL. SEE WALL TYPES',boxes:[],lines:['STUD WALL. SEE WALL TYPES']} as PageIndex;
 assert.equal(wallDefinitionSupported(page,{description:'Tile to gypsum transition'}),false);
 assert.equal(wallDefinitionSupported(page,{description:'Wall assembly'}),false);
 page.lines=['WALL TYPES'];assert.equal(wallDefinitionSupported(page,{description:'Wall A, metal studs and gypsum'}),true);
 page.lines=['CONCRETE WALL SCHEDULE'];assert.equal(wallDefinitionSupported(page,{description:'CW-8A concrete wall'}),true);
});
