import test from 'node:test';
import assert from 'node:assert/strict';
import {entryRoomCards,roomCardVisible} from '../lib/drawing-takeoff/room-reference';
import type {TextBox} from '../lib/drawing-takeoff/indexing';
import {entryRoomHand} from '../lib/drawing-takeoff/room-reference';
import {planRegions,type RegionMap} from '../lib/drawing-takeoff/vector-regions';
import {entryContextsForPage} from '../lib/drawing-takeoff/room-reference';
const context={mark:'U101',description:'Guestroom entry - typical',profileCode:'A',sourceSchedulePage:9};
const fixture=(offset=0)=>({
 boxes:[{text:'STUDIO',x:70+offset,y:30,width:40,height:8},{text:'KING',x:80+offset,y:42,width:20,height:8},{text:'A101',x:80+offset,y:54,width:20,height:8},{text:'U101',x:80+offset,y:68,width:20,height:5}] as TextBox[],
 paths:[[[50,20],[130,20]],[[130,20],[130,80]],[[130,80],[50,80]],[[50,80],[50,20]],[[50,60],[130,60]]].map(points=>({points:points.map(([x,y])=>({x:x+offset,y}))})),
});
test('a source-described guestroom entry uses a fully framed card with the same explicit unit identifier',()=>{
 const {boxes,paths}=fixture(),cards=entryRoomCards(boxes,paths,[context]);
 assert.equal(cards.length,1);assert.deepEqual(cards[0].bounds,{x:50,y:20,width:80,height:60});
 assert.equal(cards[0].roomLabel,'STUDIO KING');assert.equal(cards[0].sourceSchedulePage,9);
 assert.equal(entryRoomCards(boxes,[...paths,...paths],[context]).length,1,'overprinted identical edges are one card');
});
test('a nearby room name, incomplete border, or conflicting unit cannot establish an entry reference',()=>{
 const {boxes,paths}=fixture();
 assert.deepEqual(entryRoomCards(boxes,paths.slice(0,3),[context]),[]);
 assert.deepEqual(entryRoomCards(boxes,[],[context]),[]);
 assert.deepEqual(entryRoomCards(boxes.map(b=>b.text==='U101'?{...b,text:'U102'}:b),paths,[context]),[]);
 assert.deepEqual(entryRoomCards(boxes,paths,[{...context,description:'Guestroom connecting door'}]),[]);
 assert.deepEqual(entryRoomCards(boxes,paths,[{...context,description:'Office entry'}]),[]);
});
test('two framed cards with the same identifier stay ambiguous',()=>{
 const a=fixture(),b=fixture(300);
 assert.deepEqual(entryRoomCards([...a.boxes,...b.boxes],[...a.paths,...b.paths],[context]),[]);
});
test('hidden, opaque and clipped room-card outlines cannot establish a reference',()=>{
 const card={...context,roomLabel:'STUDIO KING',bounds:{x:20,y:20,width:60,height:40}};
 const image={data:new Uint8ClampedArray(120*100*4).fill(255),width:120,height:100,scale:1,offsetX:0,offsetY:0};
 const dark=(x:number,y:number)=>{const i=(y*image.width+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=0;};
 assert.equal(roomCardVisible(card,image),false);
 for(let x=20;x<=80;x++){dark(x,20);dark(x,60);}for(let y=20;y<=60;y++){dark(20,y);dark(80,y);}
 assert.equal(roomCardVisible(card,image),true);
 assert.equal(roomCardVisible(card,{...image,offsetX:25}),false);
 for(let y=10;y<=70;y++)for(let x=10;x<=90;x++)dark(x,y);
 assert.equal(roomCardVisible(card,image),false);
});

const roomFixture=()=>{
 const map:RegionMap={ids:new Uint32Array(300*300),areas:[0,20000],border:[false,false],width:300,height:300,scale:1};
 for(let y=20;y<120;y++)for(let x=50;x<250;x++)map.ids[y*300+x]=1;
 const card={...context,roomLabel:'STUDIO KING',bounds:{x:100,y:40,width:60,height:40}};
 const door={hinge:{x:120,y:120},jamb:{x:160,y:120},leaf:{x:120,y:80},radius:40,paired:false};
 return {map,card,door};
};
test('an entry uses the outside of its own enclosed source unit, including a reverse swing',()=>{
 const {map,card,door}=roomFixture();
 assert.equal(entryRoomHand(map,card,door,[card])?.handing,'LH');
 assert.equal(entryRoomHand(map,card,{...door,leaf:{x:120,y:160}},[card])?.handing,'LHR');
 assert.equal(entryRoomHand(map,card,{...door,paired:true},[card]),null);
});
test('leaked, merged, clipped, or disconnected room regions cannot set a hand',()=>{
 const {map,card,door}=roomFixture();
 assert.equal(entryRoomHand({...map,border:[false,true]},card,door,[card]),null);
 const other={...card,mark:'U102',bounds:{...card.bounds,x:180}};
 assert.equal(entryRoomHand(map,card,door,[card,other]),null);
 const both={...map,ids:map.ids.slice()};for(let y=121;y<170;y++)for(let x=100;x<180;x++)both.ids[y*300+x]=1;
 assert.equal(entryRoomHand(both,card,door,[card]),null);
 assert.equal(entryRoomHand(map,{...card,bounds:{...card.bounds,x:260}},door,[card]),null);
});
test('focused region masks retain light gray walls and omit blue dimension lines only when requested',()=>{
 const width=200,height=200,pixels=new Uint8ClampedArray(width*height*4).fill(255);
 const pixel=(x:number,y:number,r:number,g=r,b=r)=>{const i=(y*width+x)*4;pixels[i]=r;pixels[i+1]=g;pixels[i+2]=b;};
 for(let x=20;x<=180;x++){pixel(x,20,200);pixel(x,180,200);pixel(x,100,0,0,160);}
 for(let y=20;y<=180;y++){pixel(20,y,200);pixel(180,y,200);}
 const ordinary=planRegions(pixels,width,height,1,[],true);
 assert.equal(ordinary.border[ordinary.ids[40*width+40]],true,'old mask remains unchanged');
 for(const dilationRadius of [1,2] as const){
  const map=planRegions(pixels,width,height,1,[],true,{inkThreshold:235,omitBlueDimensions:true,dilationRadius});
  const a=map.ids[40*width+40],b=map.ids[140*width+40];assert.ok(a);assert.equal(a,b);assert.equal(map.border[a],false);
 }
 const partitioned=planRegions(pixels,width,height,1,[],true,{inkThreshold:235});
 assert.notEqual(partitioned.ids[40*width+40],partitioned.ids[140*width+40]);
});
test('short glyph strokes cannot hide a complete frame when choosing border candidates',()=>{
 const {boxes,paths}=fixture();
 const clutter=Array.from({length:10},(_,i)=>({points:[{x:60+i*.5,y:35},{x:60+i*.5,y:39}]}));
 assert.equal(entryRoomCards(boxes,[...paths,...clutter],[context]).length,1);
});

test('entry contexts require schedule provenance and reject ambiguous labels and conflicting definitions',()=>{
 const row={mark:'U101',room:'Guestroom entry - typical',doorType:'A',sourceCatalogCode:'A',sourceSchedulePage:9,sourcePage:2,sourceLabelPages:'2, 3',sourceAnnotation:true,associationStatus:'suggested',autoImportEligible:false};
 assert.equal(entryContextsForPage({annotationOpeningCandidates:[row]},2).length,1);
 assert.equal(entryContextsForPage({annotationOpeningCandidates:[row]},3).length,1);
 assert.equal(entryContextsForPage({annotationOpeningCandidates:[row]},4).length,0);
 assert.equal(entryContextsForPage({annotationOpeningCandidates:[{...row,associationStatus:'ambiguous'}]},2).length,0);
 assert.equal(entryContextsForPage({annotationOpeningCandidates:[{...row,sourceSchedulePage:0,sourcePage:0}]},2).length,0);
 assert.equal(entryContextsForPage({openings:[{...row,sourceAnnotation:undefined}]},2).length,0,'catalog definition is not a physical opening');
 assert.equal(entryContextsForPage({annotationOpeningCandidates:[row,{...row,sourceCatalogCode:'B'}]},2).length,0);
 assert.equal(entryContextsForPage({annotationOpeningCandidates:[row,row]},2).length,1);
});
