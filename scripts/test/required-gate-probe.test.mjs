// F02 hosted negative control. Remove after observing the required-check failure.
import test from 'node:test';
import assert from 'node:assert/strict';

test('F02 hosted required gate rejects a deliberately failed assertion', () => {
  assert.fail('Intentional F02 acceptance demonstration; this candidate must not merge.');
});
