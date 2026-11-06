import test from 'node:test';
import assert from 'node:assert/strict';
import { providerRateLimitDelay } from '../lib/drawing-takeoff/rate-limit';

test('honors gateway retry-after windows instead of retrying immediately',()=>{
 assert.equal(providerRateLimitDelay({name:'GatewayRateLimitError',statusCode:429,message:'Rate limit exceeded. Retry after 33s.'}),34500);
 assert.equal(providerRateLimitDelay({statusCode:429,responseHeaders:{'retry-after':'45'}}),46500);
 assert.equal(providerRateLimitDelay({cause:{statusCode:429,message:'Retry after 2 minutes'}}),121500);
 assert.equal(providerRateLimitDelay({statusCode:429}),61500);
});
test('parses dates, caps unreasonably long delays and excludes permanent access errors',()=>{
 const now=Date.parse('2026-01-01T00:00:00Z');
 assert.equal(providerRateLimitDelay({statusCode:429,responseHeaders:{'retry-after':'Thu, 01 Jan 2026 00:00:30 GMT'}},now),31500);
 assert.equal(providerRateLimitDelay({statusCode:429,message:'Retry after 100000s'}),600000);
 assert.equal(providerRateLimitDelay({statusCode:402,message:'Insufficient credits'}),null);
 assert.equal(providerRateLimitDelay({statusCode:403,cause:{statusCode:429}}),null);
 assert.equal(providerRateLimitDelay({message:'Malformed PDF'}),null);
});
