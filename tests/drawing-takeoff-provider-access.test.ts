import assert from 'node:assert/strict';
import test from 'node:test';
import { providerAccessProblem } from '../lib/drawing-takeoff/provider-access';

test('account restrictions pause requests with a useful resumable explanation', () => {
  for (const error of [
    {statusCode:403,message:'Free tier users do not have access to this model'},
    {cause:{statusCode:402,message:'Payment required'}},
    new Error('Insufficient credits'),
  ]) assert.match(providerAccessProblem(error) || '', /paid credits.*Saved results are retained/);
  assert.match(providerAccessProblem({statusCode:401}) || '', /credentials/);
});
test('transient errors and schema errors remain eligible for section retries', () => {
  for (const error of [{statusCode:429}, {statusCode:503}, {statusCode:400,message:'Schema too complex'}, new Error('Timeout')]) {
    assert.equal(providerAccessProblem(error),null);
  }
  const cyclic:{cause?:unknown}={}; cyclic.cause=cyclic;
  assert.equal(providerAccessProblem(cyclic),null);
});
