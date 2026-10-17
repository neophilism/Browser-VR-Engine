import type { DistanceCurve, Quaternion, Transform, Vec3 } from './schemas.js';

const finite = (values: readonly number[], count: number) => { if (values.length !== count || values.some(value => !Number.isFinite(value))) throw new TypeError(`Expected ${count} finite numbers`); };
export function normalizeQuaternion(value: Quaternion): Quaternion {
  finite(value, 4); const length = Math.hypot(...value);
  if (length === 0 || !Number.isFinite(length)) throw new RangeError('Quaternion has zero or unrepresentable length');
  return value.map(component => component / length) as Quaternion;
}
export function transformMatrix(transform: Transform): number[] {
  if (transform.kind === 'matrix') { finite(transform.elements, 16); return [...transform.elements]; }
  finite(transform.translation, 3); finite(transform.scale, 3);
  const [x, y, z, w] = normalizeQuaternion(transform.rotation), [sx, sy, sz] = transform.scale;
  const result = [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + w * z) * sx, 2 * (x * z - w * y) * sx, 0,
    2 * (x * y - w * z) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + w * x) * sy, 0,
    2 * (x * z + w * y) * sz, 2 * (y * z - w * x) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    ...transform.translation, 1
  ];
  finite(result, 16); return result;
}
export function multiplyMatrices(parent: readonly number[], local: readonly number[]): number[] {
  finite(parent, 16); finite(local, 16);
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) result[column * 4 + row]! += parent[k * 4 + row]! * local[column * 4 + k]!;
  finite(result, 16); return result;
}
export function transformPoint(matrix: readonly number[], point: Vec3): Vec3 {
  finite(matrix, 16); finite(point, 3);
  if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) throw new TypeError('Expected an affine matrix');
  const result = [0, 1, 2].map(row => matrix[row]! * point[0] + matrix[4 + row]! * point[1] + matrix[8 + row]! * point[2] + matrix[12 + row]!) as Vec3;
  finite(result, 3); return result;
}
export function listenerAxes(orientation: Quaternion): { forward: Vec3; up: Vec3 } {
  const matrix = transformMatrix({ kind: 'trs', translation: [0, 0, 0], scale: [1, 1, 1], rotation: orientation });
  return { forward: transformPoint(matrix, [0, 0, -1]), up: transformPoint(matrix, [0, 1, 0]) };
}
export const Z_UP_CENTIMETERS_TO_WORLD = Object.freeze([.01, 0, 0, 0, 0, 0, -.01, 0, 0, .01, 0, 0, 0, 0, 0, 1]);
export const LEFT_HANDED_Y_UP_TO_WORLD = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
/** Reference attenuation math for tests/adapters, without an AudioContext or browser graph. */
export function distanceGain(distance: number, curve: DistanceCurve): number {
  const { referenceDistance: reference, rolloff, fadeStart, cutoff } = curve;
  if (![distance, reference, rolloff, fadeStart, cutoff].every(Number.isFinite) || distance < 0 || reference <= 0 || rolloff < 0 || fadeStart < reference || cutoff <= fadeStart) throw new RangeError('Invalid distance curve');
  if (distance >= cutoff) return 0;
  const clamped = Math.max(reference, distance);
  let gain: number;
  if (curve.model === 'inverse') gain = reference / (reference + rolloff * (clamped - reference));
  else if (curve.model === 'exponential') gain = (clamped / reference) ** -rolloff;
  else if (curve.model === 'linear') gain = Math.max(0, 1 - rolloff * (clamped - reference) / (cutoff - reference));
  else throw new RangeError('Unsupported distance model');
  const t = Math.max(0, (distance - fadeStart) / (cutoff - fadeStart));
  return gain * (1 - t * t * (3 - 2 * t));
}
