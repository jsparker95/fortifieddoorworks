import test from 'node:test';import assert from 'node:assert/strict';import {createCanvas} from '@napi-rs/canvas';
import {capsuleVisibility} from '../lib/drawing-takeoff/tag-visibility';
import type {PrintedTagShape} from '../lib/drawing-takeoff/printed-tag-shapes';
const tag:PrintedTagShape={kind:'printed-capsule',text:'15',label:{text:'15',x:20,y:20,width:10,height:10},outline:{x:10,y:20,width:40,height:10},autoImportEligible:false,visibility:'requires-source-review'};
const render=(mode:'visible'|'covered'|'one-side'|'highlight'|'highlight-only'|'blank',scale=2)=>{
 const c=createCanvas(140,120),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,140,120);ctx.scale(scale,scale);
 if(mode==='highlight'||mode==='highlight-only'){ctx.fillStyle='yellow';ctx.fillRect(8,18,45,14);}
 if(mode!=='blank'&&mode!=='highlight-only'){ctx.strokeStyle='black';ctx.lineWidth=.6;ctx.beginPath();ctx.roundRect(10,20,40,10,5);ctx.stroke();}
 if(mode==='covered'){ctx.fillStyle='white';ctx.fillRect(8,18,45,14);}
 if(mode==='one-side'){ctx.fillStyle='white';ctx.fillRect(8,18,45,3);}
 return {data:ctx.getImageData(0,0,140,120).data,width:140,height:120,scale,offsetX:0,offsetY:0};
};
test('focused rendered outline confirms ink while keeping import disabled',()=>{
 for(const mode of ['visible','highlight'] as const){const r=capsuleVisibility(tag,render(mode));assert.equal(r.visibility,'visible-outline',JSON.stringify({mode,...r}));assert.equal(r.autoImportEligible,false);assert.ok(r.sectors.every(v=>v>=.75));}
});
test('hidden, covered and incomplete borders are not confirmed',()=>{
 for(const mode of ['blank','covered','one-side','highlight-only'] as const)assert.equal(capsuleVisibility(tag,render(mode)).visibility,'not-confirmed');
});
test('opaque dark overpainting cannot be mistaken for a visible outline',()=>{
 const image=render('visible');image.data.fill(0);for(let i=3;i<image.data.length;i+=4)image.data[i]=255;
 assert.equal(capsuleVisibility(tag,image).visibility,'not-confirmed');
});
test('low resolution, clipped crops and invalid transforms remain unsupported',()=>{
 assert.match(capsuleVisibility(tag,render('visible',.5)).reason,/higher-resolution/);
 assert.match(capsuleVisibility(tag,{...render('visible'),offsetX:30}).reason,/cuts off/);
 assert.match(capsuleVisibility(tag,{...render('visible'),scale:NaN}).reason,/Invalid/);
});
