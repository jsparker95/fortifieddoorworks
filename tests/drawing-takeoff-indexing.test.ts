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
