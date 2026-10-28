import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chunkRows, inventoryOpeningRows, reconcileInventoriedRows, findPageContent } from '../lib/drawing-takeoff/indexing';

// Public plan fixtures: Hillsborough County RFP 2024-014 attachment (p90),
// Rockingham County DocumentCenter/View/19097 (p13 and p27).
for (const [file, count] of [['hcso-90',43],['rockingham-13',54],['rockingham-27',54]] as const) {
  test(`inventory preserves every printed opening in ${file}`, () => {
    const page = JSON.parse(fs.readFileSync(`tests/fixtures/schedules/${file}.json`, 'utf8'));
    const rows = inventoryOpeningRows(page);
    assert.equal(rows.length, count);
    assert.deepEqual(chunkRows(rows).flat(), rows);
    assert.ok(chunkRows(rows).every(chunk => chunk.length <= 20));
    const enriched = reconcileInventoriedRows(rows, [{ ...rows[0], width:'WRONG', room:'Office' }]);
    assert.equal(enriched.length, count);
    assert.equal(enriched[0].width, rows[0].width);
    assert.equal(enriched[0].room, 'Office');
    assert.deepEqual(enriched.map(r=>r.mark), rows.map(r=>r.mark));
    assert.ok(!rows.some(r=>r.mark === 'F1'), 'adjacent window schedule excluded');
    if(file === 'hcso-90') for(const mark of ['208A','208B','210','210A','210B','113A','113B','114A','114B']) assert.ok(rows.some(r=>r.mark===mark), mark);
  });
}
test('index references are not actual schedule or plan pages', () => {
 const result = findPageContent({page:1,text:'SHEET INDEX A101 FLOOR PLAN A601 DOOR SCHEDULE HARDWARE SET 1 HINGE SET 2 CLOSER',lines:['A101 FLOOR PLAN'],boxes:[],width:100,height:100,rotation:0});
 assert.deepEqual(result.kinds, []);
});

test('known door tags get bounded focused crops without treating nearby room labels as known marks', async () => {
 const { openingTagCrops } = await import('../lib/drawing-takeoff/indexing');
 const crops = openingTagCrops({page:3,text:'',lines:[],width:1000,height:800,rotation:0,boxes:[
  {text:'208A',x:1,y:1,width:22,height:10}, {text:'208',x:500,y:500,width:20,height:10},
  {text:'210B',x:980,y:790,width:20,height:10},
 ]},['208A','210B']);
 assert.deepEqual(crops.map(c=>c.mark),['208A','210B']);
 assert.equal(crops[0].x,0); assert.equal(crops[0].y,0);
 assert.ok(crops.every(c=>c.x+c.width<=2000 && c.y+c.height<=1600));
});

test('building aliases match schedule names and service plans stay excluded after visual screening', async () => {
 const {canonicalBuilding,confirmedPageKinds}=await import('../lib/drawing-takeoff/indexing');
 assert.equal(canonicalBuilding('DAYTON STATION RCFR',['DAYTON','FULKS RUN']),'DAYTON');
 assert.equal(canonicalBuilding('RCFR FULKS RUN STATION',['DAYTON','FULKS RUN']),'FULKS RUN');
 assert.equal(canonicalBuilding('Unknown',['DAYTON','FULKS RUN']),'Unknown');
 assert.deepEqual(confirmedPageKinds(['plan'],'MAIN FLOOR SANITARY/STORM/AIR PLAN'),[]);
 assert.deepEqual(confirmedPageKinds(['plan'],'MAIN FLOOR WATER/GAS PLAN'),[]);
 assert.deepEqual(confirmedPageKinds(['plan','walls'],'Architectural overall floor plan and wall types'),['plan','walls']);
});

test('enrichment cannot invent a hand absent from the printed schedule', () => {
 const page=JSON.parse(fs.readFileSync('tests/fixtures/schedules/hcso-90.json','utf8'));
 const [row]=inventoryOpeningRows(page);
 assert.equal(reconcileInventoriedRows([row],[{...row,handing:'RH'}])[0].handing,'');
 const printed={...row,evidence:row.evidence+' RH'};
 assert.equal(reconcileInventoriedRows([printed],[{...row,handing:'RH'}])[0].handing,'RH');
});

test('type codes are literal column values, never an AI-expanded material description', () => {
 const hcso=inventoryOpeningRows(JSON.parse(fs.readFileSync('tests/fixtures/schedules/hcso-90.json','utf8')));
 assert.equal(hcso.find(row=>row.mark==='100A')?.doorType,'HL');
 const rock=inventoryOpeningRows(JSON.parse(fs.readFileSync('tests/fixtures/schedules/rockingham-13.json','utf8')));
 const row=rock.find(row=>row.mark==='102')!;
 assert.equal(row.doorType,'F');
 assert.equal(reconcileInventoriedRows([row],[{...row,doorType:'F INSULATED HOLLOW METAL'}])[0].doorType,'F');
});

test('printed frame, fire-rating and hardware set columns take precedence over enrichment',()=>{
 const hcso=inventoryOpeningRows(JSON.parse(fs.readFileSync('tests/fixtures/schedules/hcso-90.json','utf8')));
 assert.equal(hcso.find(row=>row.mark==='100A')?.frameType,'F2');
 assert.equal(hcso.find(row=>row.mark==='100B')?.fireRating,'90 Min');
 const rock=inventoryOpeningRows(JSON.parse(fs.readFileSync('tests/fixtures/schedules/rockingham-13.json','utf8')));
 const row=rock.find(row=>row.mark==='102')!;
 assert.equal(row.hardwareGroup,'02');
 assert.equal(reconcileInventoriedRows([row],[{...row,hardwareGroup:'PANIC SET'}])[0].hardwareGroup,'02');
 const fulks=inventoryOpeningRows(JSON.parse(fs.readFileSync('tests/fixtures/schedules/rockingham-27.json','utf8')));
 assert.equal(fulks.find(row=>row.mark==='121')?.hardwareGroup,'14', 'BIFOLD spelling retains its printed set');
});
