import test from 'node:test';
import assert from 'node:assert/strict';
import {doorTypeDefinitionSupported,wallDefinitionSupported} from '../lib/drawing-takeoff/definition-evidence';
import type {Opening,PageIndex} from '../lib/drawing-takeoff/indexing';
test('type-column evidence excludes invented detail codes but retains actual type definitions',()=>{
 const inventory=[{doorType:'2',doorTypeInventoried:true}] as Opening[];
 assert.equal(doorTypeDefinitionSupported({code:'DT-07',description:'Door in aluminum frame (wood framed header)'},inventory),false);
 assert.equal(doorTypeDefinitionSupported({code:'2',description:'Solid core wood'},inventory),true);
 assert.equal(doorTypeDefinitionSupported({code:'A',description:'Door threshold detail'},[]),false);
 assert.equal(doorTypeDefinitionSupported({code:'A',description:'Flush wood leaf elevation'},[]),true);
});
test('wall diagrams need an actual type heading; references and finish details are excluded',()=>{
 const page={page:1,width:800,height:600,rotation:0,text:'STUD WALL. SEE WALL TYPES',boxes:[],lines:['STUD WALL. SEE WALL TYPES']} as PageIndex;
 assert.equal(wallDefinitionSupported(page,{description:'Tile to gypsum transition'}),false);
 assert.equal(wallDefinitionSupported(page,{description:'Wall assembly'}),false);
 page.lines=['WALL TYPES'];assert.equal(wallDefinitionSupported(page,{description:'Wall A, metal studs and gypsum'}),true);
 page.lines=['CONCRETE WALL SCHEDULE'];assert.equal(wallDefinitionSupported(page,{description:'CW-8A concrete wall'}),true);
});
