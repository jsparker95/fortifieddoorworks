import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveHardwareIdentity} from '../lib/drawing-takeoff/hardware-evidence';
import {mapAnalysisToPhaseRows,mergePhaseCandidateRows} from '../lib/drawing-takeoff/phase-import';

const row={group:'2',component:'Panic',brand:'Example Brand',quantity:1,sourcePage:1,sourceHardwareLine:'0',evidence:'Exit door\n1 Each Panic Example Brand EX-98 EO US26D\n1 Sign Emergency exit',confidence:.9};
test('printed model, options and finish survive cached response publication into hardware',()=>{
 const recovered=preserveHardwareIdentity(row);
 assert.equal(recovered.component,'Panic Example Brand EX-98 EO US26D');
 const original=mapAnalysisToPhaseRows('doc',{hardwareGroups:[row]}).hardware!;
 const updated=mapAnalysisToPhaseRows('doc',{hardwareGroups:[recovered]}).hardware!;
 const merged=mergePhaseCandidateRows(original,updated);
 assert.equal(merged.length,1);assert.equal(merged[0].id,original[0].id);
 assert.equal(merged[0].component,recovered.component);
 assert.equal(merged[0].qty,1);
 original[0].reviewState='human-reviewed';original[0].component='Reviewed substitution';
 assert.equal(mergePhaseCandidateRows(original,updated)[0].component,'Reviewed substitution');
});
test('ambiguous or uncited identity never borrows another component or group note',()=>{
 assert.equal(preserveHardwareIdentity({...row,evidence:'1 Each Panic Example Brand EX-98\n1 Each Panic Example Brand EX-99'}).component,'Panic');
 assert.equal(preserveHardwareIdentity({...row,evidence:'1 Each Closer Example Brand CL-10\nPanic device available by others'}).component,'Panic');
 assert.equal(preserveHardwareIdentity({...row,evidence:'1 Each Panic Other Brand EX-98'}).component,'Panic');
 assert.equal(preserveHardwareIdentity({...row,evidence:'2 Each Panic Example Brand EX-98'}).component,'Panic');
});
test('printed pair unit is preserved without multiplying quantity',()=>{
 const recovered=preserveHardwareIdentity({...row,component:'[PR] Hinges',evidence:'1 PR Hinges Example Brand HX-4 US26D'});
 assert.equal(recovered.component,'[PR] Hinges Example Brand HX-4 US26D');
 assert.equal(recovered.quantity,1);
});
test('unquantified product identity is kept without inventing an inactive-leaf count',()=>{
 const recovered=preserveHardwareIdentity({...row,component:'Manual Flushbolt',evidence:'inactive leaf only Manual Flushbolt Example Brand FB10 US26D'});
 assert.equal(recovered.component,'Manual Flushbolt Example Brand FB10 US26D');
 assert.equal(recovered.quantity,0);
 const saved=mapAnalysisToPhaseRows('doc',{hardwareGroups:[recovered]}).hardware![0];
 assert.equal(saved.qty,'');assert.equal(saved.quantityKnown,false);
 const original=mapAnalysisToPhaseRows('doc',{hardwareGroups:[{...row,component:'Manual Flushbolt',evidence:'inactive leaf only Manual Flushbolt Example Brand FB10 US26D'}]}).hardware!;
 const merged=mergePhaseCandidateRows(original,[saved]);assert.equal(merged.length,1);assert.equal(merged[0].id,original[0].id);
 assert.equal(preserveHardwareIdentity({...row,component:'[PR] Hinges',evidence:'PR Hinges Example Brand HX10'}).component,'[PR] Hinges Example Brand HX10');
 const quantified=preserveHardwareIdentity({...row,component:'Weatherstrip',quantity:2,evidence:'2 Each Weatherstrip Example Brand WS10'});
 assert.equal(quantified.quantity,2);
 assert.equal(preserveHardwareIdentity({...row,component:'Manual Flushbolt',evidence:'Do not use Manual Flushbolt Example Brand FB10'}).component,'Manual Flushbolt');
});
