import test from 'node:test';import assert from 'node:assert/strict';import {createCanvas} from '@napi-rs/canvas';
import {corridorCards,corridorVisibilityReference} from '../lib/drawing-takeoff/corridor-visibility';
const door={hinge:{x:150,y:100},jamb:{x:190,y:100},leaf:{x:150,y:140},radius:40,paired:false};
const card=(shift=0,id='103')=>{const boxes=[{text:'CORRIDOR',x:100,y:260+shift,width:100,height:14},{text:id,x:140,y:277+shift,width:20,height:14},{text:'560 SF',x:130,y:300+shift,width:40,height:12}],points=[{x:138,y:275+shift},{x:162,y:275+shift},{x:162,y:294+shift},{x:138,y:294+shift},{x:138,y:275+shift}];return {boxes,paths:[{points}]};};
const source=(mode='clear')=>{
 const c=createCanvas(400,400),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,400,400);const input=card(),other=card(-250,'104'),all=mode==='both-sides'?[input,other]:[input];
 for(const item of all){ctx.fillStyle='black';ctx.font='12px sans-serif';for(const b of item.boxes)ctx.fillText(b.text,b.x,b.y+b.height*.85);ctx.strokeStyle='black';ctx.lineWidth=1;ctx.strokeRect(138,item.boxes[0].y+15,24,19);}
 if(mode==='hidden-name'){ctx.fillStyle='white';ctx.fillRect(98,258,104,18);}
 if(mode==='hidden-frame'){ctx.fillStyle='white';ctx.fillRect(136,273,28,24);ctx.fillStyle='black';ctx.fillText('103',140,289);}
 if(mode==='gray-wall'||mode==='unsealed-neighbor'||mode==='split-card'){ctx.strokeStyle='rgb(180,180,180)';ctx.lineWidth=2;const y=mode==='split-card'?275:200;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(400,y);ctx.stroke();if(mode==='unsealed-neighbor'){ctx.fillStyle='white';ctx.fillRect(149,197,42,6);}}
 if(mode==='blocked-ray-enclosed'||mode==='blocked-ray-open'){
  ctx.strokeStyle='rgb(180,180,180)';ctx.lineWidth=2;ctx.strokeRect(80,150,160,190);
  ctx.beginPath();ctx.moveTo(80,200);ctx.lineTo(150,200);ctx.moveTo(190,200);ctx.lineTo(240,200);ctx.stroke();
  ctx.fillStyle='black';ctx.fillRect(120,249,100,3);
  if(mode==='blocked-ray-open'){ctx.fillStyle='white';ctx.fillRect(77,205,7,100);}
 }
 return {image:{data:ctx.getImageData(0,0,400,400).data,width:400,height:400,scale:1,offsetX:0,offsetY:0},cards:corridorCards(all.flatMap(c=>c.boxes),all.flatMap(c=>c.paths))};
};
test('corridor fallback needs an exact framed room number, area and aligned name',()=>{
 const c=card();assert.equal(corridorCards(c.boxes,c.paths).length,1);
 assert.equal(corridorCards(c.boxes.slice(0,1),c.paths).length,0);
 assert.equal(corridorCards(c.boxes.slice(0,2),c.paths).length,0);
 assert.equal(corridorCards(c.boxes,[]).length,0);
 assert.equal(corridorCards([...c.boxes,{...c.boxes[1],text:'104'}],c.paths).length,0);
 assert.equal(corridorCards(c.boxes.map(b=>b.text==='560 SF'?{...b,x:250}:b),c.paths).length,0);
});
test('visible corridor card and diverse clear rays establish one reference side',()=>{
 const {image,cards}=source(),reader=corridorVisibilityReference(image,cards,[door]);assert.ok(reader);
 assert.equal(reader.hand(door)?.handing,'LHR');assert.match(reader.hand(door)!.reference,/CORRIDOR room 103/);assert.match(reader.hand(door)!.proof,/to/);
 assert.equal(reader.hand({...door,paired:true}),null);assert.equal(reader.hand({...door,radius:NaN}),null);
});
test('hidden evidence, gray walls, card crossing a wall and competing sides withhold hands',()=>{
 for(const mode of ['hidden-name','hidden-frame','gray-wall','split-card','both-sides']){const {image,cards}=source(mode);assert.equal(corridorVisibilityReference(image,cards,[door])?.hand(door)||null,null,mode);}
});
test('a sight line cannot use another known doorway as an opening into a different room',()=>{
 const {image,cards}=source('unsealed-neighbor'),neighbor={...door,hinge:{x:150,y:200},jamb:{x:190,y:200},leaf:{x:150,y:240}};
 assert.equal(corridorVisibilityReference(image,cards,[door,neighbor])?.hand(door)||null,null);
});
test('off-page, invalid and oversized raster evidence is withheld',()=>{
 const {image,cards}=source();assert.equal(corridorVisibilityReference({...image,scale:NaN},cards,[door]),null);
 assert.equal(corridorVisibilityReference({...image,width:5000,height:5000},cards,[door]),null);
 assert.equal(corridorVisibilityReference({...image,offsetX:300},cards,[door]),null);
});

test('an enclosed gray corridor can prove a side around an obstructed straight ray',()=>{
 const target={...door,hinge:{x:150,y:200},jamb:{x:190,y:200},leaf:{x:150,y:240}};
 const {image,cards}=source('blocked-ray-enclosed'),hand=corridorVisibilityReference(image,cards,[target])?.hand(target);
 assert.equal(hand?.handing,'LHR');assert.equal(hand?.method,'enclosed-region');assert.match(hand.proof,/no exterior reference used/);
 const open=source('blocked-ray-open');assert.equal(corridorVisibilityReference(open.image,open.cards,[target])?.hand(target)||null,null,'an open gray boundary cannot justify the region fallback');
});
