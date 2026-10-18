import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { childEnvironment } from '../ci/environment.mjs';

test('manual F04 failed-artifact verifier and watchdog contracts reject contradictory synthetic evidence', () => {
  const result = spawnSync('python3', ['-B', '-O', 'scripts/test/f04-runtime-evidence-checks.py'], {
    cwd: new URL('../../', import.meta.url), env: childEnvironment(), encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 14 tests/);
});
