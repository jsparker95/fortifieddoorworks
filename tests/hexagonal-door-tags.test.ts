import test from 'node:test';import assert from 'node:assert/strict';import {createCanvas} from '@napi-rs/canvas';
import {hexagonalDoorTags,hexagonalTagNearDoor,visibleHexagonalDoorTag,type HexagonalDoorTag} from '../lib/drawing-takeoff/hexagonal-door-tags';
const points=[{x:50,y:70},{x:60,y:50},{x:80,y:50},{x:90,y:70},{x:80,y:90},{x:60,y:90},{x:50,y:70}],label={text:'D12',x:51,y:62,width:38,height:15},known=new Set(['D12']);
const paths=points.slice(1).map((p,i)=>({points:[points[i],p]}));
const shape:HexagonalDoorTag={label,points,outline:{x:50,y:50,width:40,height:40}};
const image=(mode:'visible'|'blank'|'covered'|'dark'|'partial'|'highlight',scale=2)=>{const canvas=createCanvas(240,240),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,240,240);ctx.scale(scale,scale);
 if(mode!=='blank'){ctx.strokeStyle=mode==='highlight'?'yellow':'black';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();}
 ctx.fillStyle='white';ctx.fillRect(label.x,label.y,label.width,label.height);
 if(mode==='covered'||mode==='dark'){ctx.fillStyle=mode==='dark'?'black':'white';ctx.fillRect(45,45,50,50);}
 if(mode==='partial'){ctx.fillStyle='white';ctx.fillRect(45,45,50,12);}
 return {data:ctx.getImageData(0,0,240,240).data,width:240,height:240,scale,offsetX:0,offsetY:0};};
test('six-sided door marks need closed regular geometry, exact known identity and no competing content',()=>{
 assert.equal(hexagonalDoorTags([label],paths,known).length,1);
 assert.equal(hexagonalDoorTags([label],paths,new Set(['D13'])).length,0);
 assert.equal(hexagonalDoorTags([label],paths.slice(1),known).length,0);
 assert.equal(hexagonalDoorTags([label,{text:'NOTE',x:65,y:65,width:5,height:5}],paths,known).length,0);
 const distorted=paths.map(p=>({points:p.points.map(q=>q.x===80?{...q,x:65}:q)}));assert.equal(hexagonalDoorTags([label],distorted,known).length,0);
 const inner=paths.map(p=>({points:p.points.map(q=>({x:70+(q.x-70)*.9,y:70+(q.y-70)*.9}))}));assert.equal(hexagonalDoorTags([label],[...paths,...inner],known).length,0);
});
test('visible exposed edges can support a tag with its tips masked by CAD text',()=>{
 assert.equal(visibleHexagonalDoorTag(shape,image('visible')),true);
 for(const mode of ['blank','covered','dark','partial','highlight'] as const)assert.equal(visibleHexagonalDoorTag(shape,image(mode)),false,mode);
 assert.equal(visibleHexagonalDoorTag(shape,image('visible',.2)),false);
 assert.equal(visibleHexagonalDoorTag(shape,{...image('visible'),offsetX:100}),false);
});
test('displaced text requires a nearby actual outline and never supports a paired swing',()=>{
 const door={hinge:{x:40,y:40},jamb:{x:60,y:40},leaf:{x:40,y:20},radius:20,paired:false};
 assert.equal(hexagonalTagNearDoor(shape,door),true);
 assert.equal(hexagonalTagNearDoor(shape,{...door,paired:true}),false);
 assert.equal(hexagonalTagNearDoor(shape,{...door,hinge:{x:0,y:0},jamb:{x:20,y:0}}),false);
});
