import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedRequest, checkIds, finalStatus } from '../browser-policy.mjs';

test('only the declared loopback-resolved HTTP and native WebSocket origins are allowed', () => {
  assert.equal(allowedRequest('https://hubs.local:4000/api/v1/hubs'), true);
  assert.equal(allowedRequest('https://hubs.local:8080/evaluation/f04-a/courtyard.glb'), true);
  assert.equal(allowedRequest('wss://hubs.local:4443/?roomId=synthetic',true), true);
  for (const url of ['https://external.invalid/a','http://hubs.local:4000/a','https://user:pass@hubs.local:4000/a',
    'https://hubs.local.evil.invalid:4000/a','https://127.0.0.1:4000/a','https://hubs.local:4443/a',
    'file:///private/key.pem','malformed']) assert.equal(allowedRequest(url),false,url);
  assert.equal(allowedRequest('wss://external.invalid/socket',true),false);
});

test('final status is decided after all cleanup and fails on any late contradiction', () => {
  const baseline = { fatal:null, cleanupSettled:true, errors:[], failedRequests:[], blockedRequests:[], cleanupErrors:[],
    checks:checkIds.map(id=>({id,status:'passed'})) };
  assert.equal(finalStatus(baseline),'passed');
  for (const mutate of [
    value=>value.errors.push('late console error'), value=>value.failedRequests.push('late failed request'),
    value=>value.blockedRequests.push('blocked external URL'), value=>value.cleanupErrors.push('browser close failed'),
    value=>value.cleanupSettled=false, value=>value.fatal='', value=>value.fatal=false,
    value=>value.checks.pop(), value=>value.checks.reverse(), value=>value.checks[0].status='failed',
  ]) { const value=structuredClone(baseline); mutate(value); assert.equal(finalStatus(value),'failed'); }
});
