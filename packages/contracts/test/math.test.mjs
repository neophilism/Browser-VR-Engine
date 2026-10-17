import test from 'node:test';
import assert from 'node:assert/strict';
import { LEFT_HANDED_Y_UP_TO_WORLD, Z_UP_CENTIMETERS_TO_WORLD, distanceGain, listenerAxes, multiplyMatrices, normalizeQuaternion, transformMatrix, transformPoint } from '../dist/index.js';
import { trs } from './helpers.mjs';

function close(actual, expected, tolerance = 1e-12) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) <= tolerance, `${value} != ${expected[i]}`));
}

test('source units and handedness conversion use independently specified points', () => {
  close(transformPoint(Z_UP_CENTIMETERS_TO_WORLD, [100, 200, 300]), [1, 3, -2]);
  close(transformPoint(LEFT_HANDED_Y_UP_TO_WORLD, [2, 3, 4]), [2, 3, -4]);
});

test('parent-first column-major composition preserves hierarchy and signed scale', () => {
  const parent = transformMatrix(trs([10, 0, 0], [1, 1, 1], [0, Math.SQRT1_2, 0, Math.SQRT1_2]));
  const child = transformMatrix(trs([0, 0, -2], [-2, 3, 1]));
  close(transformPoint(multiplyMatrices(parent, child), [1, 1, 0]), [8, 3, 2]);
  const shear = [1, 0, 0, 0, .5, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  close(transformPoint(transformMatrix({ kind: 'matrix', elements: shear }), [2, 4, 1]), [4, 4, 1]);
});

test('listener forward is minus Z and yaw rotates head/listener together', () => {
  close(listenerAxes([0, 0, 0, 1]).forward, [0, 0, -1]);
  const positive = listenerAxes([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  close(positive.forward, [-1, 0, 0]); close(positive.up, [0, 1, 0]);
  const negative = listenerAxes([0, -Math.SQRT1_2, 0, -Math.SQRT1_2]);
  close(negative.forward, positive.forward);
  close(normalizeQuaternion([0, 0, 0, 2]), [0, 0, 0, 1]);
  assert.throws(() => normalizeQuaternion([0, 0, 0, 0]));
  assert.throws(() => normalizeQuaternion([1e308, 1e308, 1e308, 1e308]));
});

test('reference attenuation has equal calibrated corner gains and smooth finite cutoff', () => {
  const curve = { model: 'inverse', referenceDistance: 1, rolloff: 1, fadeStart: 10, cutoff: 14 };
  assert.equal(distanceGain(0, curve), 1);
  assert.ok(Math.abs(distanceGain(Math.sqrt(72), curve) - 1 / Math.sqrt(72)) < 1e-14);
  assert.ok(Math.abs(distanceGain(12, curve) - 1 / 24) < 1e-14);
  assert.equal(distanceGain(14, curve), 0); assert.equal(distanceGain(100, curve), 0);
  for (const model of ['inverse', 'linear', 'exponential']) {
    const values = Array.from({ length: 1401 }, (_, i) => distanceGain(i / 100, { ...curve, model }));
    assert.ok(values.every((gain, i) => gain >= 0 && gain <= 1 && (!i || gain <= values[i - 1] + 1e-12)));
    assert.ok(Math.max(...values.map((gain, i) => i ? Math.abs(gain - values[i - 1]) : 0)) < .011);
  }
  for (const change of [{ fadeStart: 14 }, { rolloff: -1 }, { model: 'unknown' }, { referenceDistance: 0 }]) assert.throws(() => distanceGain(5, { ...curve, ...change }));
});

test('nonfinite math inputs and overflowing output cannot silently enter runtime state', () => {
  assert.throws(() => transformPoint(new Array(16).fill(Infinity), [0, 0, 0]));
  const huge = transformMatrix(trs([1e308, 0, 0], [1e308, 1, 1]));
  assert.throws(() => transformPoint(huge, [2, 0, 0]));
  assert.throws(() => multiplyMatrices(huge, huge));
});
