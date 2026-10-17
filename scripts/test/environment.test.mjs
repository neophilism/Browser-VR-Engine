import test from 'node:test';
import assert from 'node:assert/strict';
import { childEnvironment } from '../ci/environment.mjs';
import { runCommand } from '../ci/run.mjs';

test('child environments allow tool settings and exclude arbitrary credentials and code injection', () => {
  const synthetic = {
    PATH: '/example/bin', HOME: '/example/home', CI: 'true', HTTPS_PROXY: 'http://proxy.invalid',
    MESHY_API_KEY: 'synthetic-meshy-value', ANOTHER_PROVIDER_API_KEY: 'synthetic-other-value',
    GITHUB_TOKEN: 'synthetic-github-value', NPM_TOKEN: 'synthetic-npm-value', NODE_AUTH_TOKEN: 'synthetic-auth-value',
    NODE_OPTIONS: '--require=/untrusted.js', NODE_PATH: '/untrusted',
    npm_config_registry: 'https://untrusted.invalid', npm_config__authToken: 'synthetic-registry-value',
    ACTIONS_RUNTIME_TOKEN: 'synthetic-runtime-value', CUSTOM_UNKNOWN: 'excluded'
  };
  assert.deepEqual(childEnvironment(synthetic), { PATH: '/example/bin', HOME: '/example/home', CI: 'true', HTTPS_PROXY: 'http://proxy.invalid' });
  assert.deepEqual(childEnvironment({}, { npm_config_cache: '/isolated/cache' }), { npm_config_cache: '/isolated/cache' });
  assert.throws(() => childEnvironment({}, { MESHY_API_KEY: 'synthetic-override' }), /Unsupported/);
  assert.throws(() => childEnvironment({}, { PATH: 1 }), /Unsupported/);
});

test('allowlisting never reads unrelated parent keys', () => {
  const synthetic = { PATH: '/example/bin' };
  Object.defineProperty(synthetic, 'MESHY_API_KEY', { get() { throw new Error('A provider key must not be read'); } });
  Object.defineProperty(synthetic, 'UNKNOWN_API_KEY', { get() { throw new Error('An unknown key must not be read'); } });
  assert.deepEqual(childEnvironment(synthetic), { PATH: '/example/bin' });
});

test('actual child commands cannot observe synthetic provider, publishing or runtime credentials', () => {
  const excluded = ['MESHY_API_KEY', 'UNKNOWN_API_KEY', 'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'GITHUB_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'NODE_OPTIONS', 'NODE_PATH'];
  const synthetic = { PATH: process.env.PATH, ...Object.fromEntries(excluded.map(key => [key, 'synthetic-excluded-value'])) };
  const source = `import assert from 'node:assert/strict'; for (const key of ${JSON.stringify(excluded)}) assert.equal(process.env[key], undefined); console.log('Child environment isolation passed');`;
  const result = runCommand([process.execPath, '--input-type=module', '-e', source], { environment: synthetic });
  assert.equal(result.outcome, 'passed', result.log);
  assert.match(result.log, /Child environment isolation passed/);
  assert.ok(!result.log.includes('synthetic-excluded-value'));
});
