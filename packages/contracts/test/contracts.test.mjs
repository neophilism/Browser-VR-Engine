import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT_VERSION, SCHEMAS, VALIDATION_LIMITS, canonicalJson, digestJson, exportJsonSchemas, parseDocument, requireDocument, validateDocument } from '../dist/index.js';
import { digest, entity, operation, scenario, world } from './helpers.mjs';

function rejects(kind, input, code, options) {
  const result = validateDocument(kind, input, options);
  assert.equal(result.ok, false, `Expected ${code}`);
  assert.ok(result.diagnostics.some(value => value.code === code), JSON.stringify(result.diagnostics));
  assert.ok(result.diagnostics.length <= VALIDATION_LIMITS.maxErrors);
}

test('canonical schema version, coordinate convention and unknown fields are enforced', () => {
  assert.equal(requireDocument('world', world()).schemaVersion, CONTRACT_VERSION);
  for (const change of [{ schemaVersion: '1.0.0' }, { extra: true }, { coordinates: { ...world().coordinates, units: 'feet' } }]) rejects('world', { ...world(), ...change }, 'SCHEMA');
  assert.equal(validateDocument('toString', {}).ok, false);
  assert.equal(parseDocument('world', '{').diagnostics[0].code, 'JSON_SYNTAX');
});

test('optional extensions round trip unchanged while required unsupported components fail', () => {
  const input = world();
  input.entities[0].components.push({ type: 'studio:appearance', version: '2.1.0', required: false, data: { color: 'blue', nested: [1, false, null] } });
  assert.deepEqual(parseDocument('world', canonicalJson(input)), { ok: true, value: input, diagnostics: [] });
  input.entities[0].components[0].required = true;
  rejects('world', input, 'UNSUPPORTED_REQUIRED');
  assert.equal(validateDocument('world', input, { knownComponents: ['studio:appearance'] }).ok, true);
  input.requiredFeatures.push('studio:missing');
  rejects('world', input, 'UNSUPPORTED_REQUIRED', { knownComponents: ['studio:appearance'] });
  input.requiredFeatures = [];
  input.entities[0].components = [{ type: 'bve:mesh', version: '2.0.0', required: false, data: { future: true } }];
  assert.equal(validateDocument('world', input).ok, true);
  input.entities[0].components[0].required = true;
  rejects('world', input, 'UNSUPPORTED_COMPONENT_VERSION');
});

test('hierarchy references, cycles, duplicate identifiers and depth limits fail before loading', () => {
  const input = world();
  input.entities[0].parentId = 'missing'; rejects('world', input, 'MISSING_PARENT');
  input.entities[0].parentId = 'object'; rejects('world', input, 'PARENT_CYCLE');
  input.entities = [entity(), entity()]; rejects('world', input, 'DUPLICATE_ID');
  input.entities = Array.from({ length: 50 }, (_, i) => ({ ...entity(`entity-${i}`), ...(i ? { parentId: `entity-${i - 1}` } : {}) }));
  rejects('world', input, 'LIMIT_DEPTH');
});

test('finite normalized transforms and affine invertibility are required', () => {
  for (const [transform, code] of [
    [{ kind: 'trs', translation: [0, NaN, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, 'NONFINITE'],
    [{ kind: 'trs', translation: [0, 0, 0], rotation: [0, 0, 0, 0], scale: [1, 1, 1] }, 'QUATERNION'],
    [{ kind: 'trs', translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 0, 1] }, 'SINGULAR_TRANSFORM'],
    [{ kind: 'matrix', elements: [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, 'AFFINE_TRANSFORM'],
    [{ kind: 'matrix', elements: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, 'SINGULAR_TRANSFORM'],
    [{ kind: 'matrix', elements: [1e308, 0, 0, 0, 0, 1e308, 0, 0, 0, 0, 1e308, 0, 0, 0, 0, 1] }, 'SINGULAR_TRANSFORM']
  ]) {
    const input = world(); input.entities[0].transform = transform; rejects('world', input, code);
  }
  const signedShear = world();
  signedShear.entities[0].transform = { kind: 'matrix', elements: [-1, 0, 0, 0, .25, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1] };
  assert.equal(validateDocument('world', signedShear).ok, true);
});

test('prototype-sensitive data, cycles, sparse arrays and executable accessors are rejected', () => {
  rejects('operation', JSON.parse(canonicalJson(operation(null)).replace('"payload":null', '"payload":{"__proto__":{"polluted":true}}')), 'UNSAFE_KEY');
  assert.equal({}.polluted, undefined);
  const cyclic = {}; cyclic.self = cyclic;
  rejects('operation', operation(cyclic), 'JSON_CYCLE');
  rejects('operation', operation(new Date()), 'NOT_PLAIN_JSON');
  rejects('operation', operation(new Array(3)), 'NOT_JSON');
  const extended = [1]; extended.extra = true; rejects('operation', operation(extended), 'NOT_JSON');
  delete extended[0]; rejects('operation', operation(extended), 'NOT_JSON');
  for (const enumerable of [false, true]) {
    let executed = false;
    const value = {}; Object.defineProperty(value, 'secret', { enumerable, get() { executed = true; throw new Error('getter executed'); } });
    rejects('operation', operation(value), 'NOT_JSON');
    assert.throws(() => canonicalJson(value), /JSON data/);
    assert.equal(executed, false);
  }
});

test('plain data validation enforces depth, string, value, byte and error budgets', () => {
  let deep = null; for (let i = 0; i < 50; i++) deep = { child: deep };
  rejects('operation', operation(deep), 'LIMIT_DEPTH');
  rejects('operation', operation('x'.repeat(VALIDATION_LIMITS.maxStringLength + 1)), 'LIMIT_STRING');
  rejects('operation', operation(new Array(VALIDATION_LIMITS.maxValues + 1).fill(null)), 'LIMIT_VALUES');
  assert.equal(parseDocument('operation', ' '.repeat(VALIDATION_LIMITS.maxJsonBytes + 1)).diagnostics[0].code, 'LIMIT_BYTES');
  const errors = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`bad-${i}`, undefined]));
  rejects('operation', operation(errors), 'NOT_JSON');
});

test('resource bindings and collider constraints produce actionable diagnostics', () => {
  const input = world();
  input.entities[0].components = [{ type: 'bve:mesh', version: CONTRACT_VERSION, required: true, data: { asset: 'model' } }];
  rejects('world', input, 'MISSING_ASSET');
  input.assets.push({ id: 'model', revision: digest, kind: 'audio' }); rejects('world', input, 'ASSET_KIND');
  input.entities[0].components = [{ type: 'bve:collider', version: CONTRACT_VERSION, required: true, data: { shape: 'box', body: 'dynamic', halfExtents: [1, 0, 1], massKg: 0 } }];
  rejects('world', input, 'COLLIDER_EXTENTS'); rejects('world', input, 'COLLIDER_MASS');
});

test('one media playback identity cannot refer to different source assets', () => {
  const input = world();
  input.assets = [{ id: 'one', revision: digest, kind: 'video' }, { id: 'two', revision: digest, kind: 'audio' }];
  input.entities[0].components = [
    { type: 'bve:media-surface', version: CONTRACT_VERSION, required: true, data: { sourceAsset: 'one', playbackId: 'wall', aspectRatio: 16 / 9 } },
    { type: 'bve:audio-emitter', version: CONTRACT_VERSION, required: true, data: { sourceAsset: 'two', playbackId: 'wall', bus: 'video', spatial: true, localOffset: [0, 0, 0], gain: 1, curve: { model: 'inverse', referenceDistance: 1, rolloff: 1, fadeStart: 10, cutoff: 14 }, channels: 'mono', loop: true } }
  ];
  rejects('world', input, 'PLAYBACK_SOURCE');
  input.entities[0].components[1].data.sourceAsset = 'one';
  assert.equal(validateDocument('world', input).ok, true);
  const separate = { ...entity('second'), components: [structuredClone(input.entities[0].components[1])] };
  separate.components[0].data.sourceAsset = 'two'; input.entities.push(separate);
  rejects('world', input, 'PLAYBACK_SOURCE'); input.entities.pop();
  input.entities[0].components[0].data.sourceAsset = 'two'; rejects('world', input, 'ASSET_KIND');
  input.entities[0].components[0].data.sourceAsset = 'one';
  input.entities[0].components[1].data.curve.fadeStart = 14; rejects('world', input, 'AUDIO_CURVE');
});

test('scenario order, targets and unique assertion checkpoints are validated', () => {
  const input = scenario();
  input.steps[0].targetId = 'missing'; rejects('scenario', input, 'MISSING_ENTITY', { world: world() });
  input.steps[0].targetId = 'object'; input.worldId = 'other'; rejects('scenario', input, 'WORLD_ID', { world: world() });
  input.worldId = 'test-world'; input.steps.push({ ...input.steps[0], id: 'second', tick: 0 });
  rejects('scenario', input, 'TICK_ORDER'); rejects('scenario', input, 'REPEATED_ASSERTION');
  input.steps = []; rejects('scenario', input, 'SCHEMA');
});

test('canonical JSON is stable, hashes content, and rejects hidden or non-JSON state', async () => {
  assert.equal(canonicalJson({ z: [1, null], a: true }), '{"a":true,"z":[1,null]}');
  assert.equal(await digestJson({ b: 2, a: 1 }), await digestJson({ a: 1, b: 2 }));
  assert.notEqual(await digestJson({ a: 1 }), await digestJson({ a: 2 }));
  const symbol = { value: 1, [Symbol('hidden')]: 2 };
  const extended = [1]; extended.extra = true;
  for (const input of [symbol, extended, undefined, Infinity, new Date(), new Array(1)]) assert.throws(() => canonicalJson(input));
});

test('JSON Schema export has stable IDs and comes from the same authored schemas', () => {
  const exported = exportJsonSchemas();
  assert.deepEqual(exported, JSON.parse(JSON.stringify(SCHEMAS)));
  for (const schema of Object.values(exported)) assert.match(schema.$id, /:0\.1\.0$/);
  exported.world.properties.schemaVersion.const = 'tampered';
  assert.equal(exportJsonSchemas().world.properties.schemaVersion.const, CONTRACT_VERSION);
});
