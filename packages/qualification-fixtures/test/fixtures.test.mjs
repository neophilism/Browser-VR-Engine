import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import validator from 'gltf-validator';
import { CONTRACT_VERSION, canonicalJson, digestJson, exportJsonSchemas, sha256, transformMatrix, transformPoint, validateDocument } from '@browser-vr-engine/contracts';
import { boxGeometry, courtyardParts, createFixtureAssetPort, createFixtureAuthorizer, generateFixtureSet, generateToneWav } from '../dist/index.js';

const video = new Uint8Array(await readFile(new URL('../sources/screen-marker.webm', import.meta.url)));
const fixture = await generateFixtureSet(video);
const parse = path => JSON.parse(new TextDecoder().decode(fixture.files.get(path)));
const component = (entity, type) => entity.components.find(value => value.type === type)?.data;
const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function accessor(gltf, index) {
  const descriptor = gltf.accessors[index], bufferView = gltf.bufferViews[descriptor.bufferView];
  const data = Buffer.from(gltf.buffers[bufferView.buffer].uri.split(',')[1], 'base64');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const components = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[descriptor.type];
  const size = descriptor.componentType === 5126 ? 4 : 2;
  return Array.from({ length: descriptor.count * components }, (_, i) => {
    const offset = (bufferView.byteOffset ?? 0) + (descriptor.byteOffset ?? 0) + i * size;
    return descriptor.componentType === 5126 ? view.getFloat32(offset, true) : view.getUint16(offset, true);
  });
}

test('every document validates and comparison hashes bind the entire fixture input set', async () => {
  for (const [kind, value] of [['world', fixture.world], ['scenario', fixture.scenario], ['catalog', fixture.catalog], ['thresholds', fixture.thresholds], ...fixture.workloads.map(value => ['workload', value]), ...fixture.devices.map(value => ['device', value])]) {
    const result = validateDocument(kind, value, { world: fixture.world });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  }
  const comparison = parse('comparison.json');
  for (const [key, value] of Object.entries({ worldDigest: fixture.world, scenarioDigest: fixture.scenario, thresholdDigest: fixture.thresholds, workloadDigest: fixture.workloads, deviceTargetDigest: fixture.devices, catalogDigest: fixture.catalog, schemaDigest: exportJsonSchemas() })) assert.equal(comparison[key], await digestJson(value));
  assert.deepEqual(parse('schema-set.json'), exportJsonSchemas());
  assert.ok(fixture.devices.every(device => device.status === 'target'));
});

test('regeneration is byte-identical and catalog integrity matches every original resource', async () => {
  const another = await generateFixtureSet(new Uint8Array(video));
  assert.deepEqual([...fixture.files.keys()], [...another.files.keys()]);
  for (const [path, bytes] of fixture.files) assert.deepEqual(bytes, another.files.get(path), path);
  for (const resource of fixture.catalog.resources) {
    const bytes = fixture.files.get(resource.path);
    assert.equal(bytes.length, resource.sizeBytes); assert.equal(await sha256(bytes), resource.sha256);
    assert.equal(fixture.world.assets.find(asset => asset.id === resource.id).revision, resource.sha256);
    assert.equal(resource.provenanceId, 'original-synthetic');
  }
});

test('all generated model files pass the official Khronos glTF validator without issues', async () => {
  for (const [path, bytes] of fixture.files) {
    if (!path.endsWith('.gltf')) continue;
    const report = await validator.validateString(new TextDecoder().decode(bytes), { uri: path, maxIssues: 100 });
    assert.deepEqual(report.issues.messages, [], `${path}: ${JSON.stringify(report.issues)}`);
  }
});

test('the bird contains actual skin weights, inverse binds, two animation clips and a morph', () => {
  const model = parse('models/creature.gltf'), primitive = model.meshes[0].primitives[0], skin = model.skins[0];
  assert.equal(skin.joints.length, 5);
  assert.deepEqual(model.animations.map(clip => clip.name), ['flap', 'glide']);
  assert.equal(primitive.targets.length, 1);
  const weights = accessor(model, primitive.attributes.WEIGHTS_0), joints = accessor(model, primitive.attributes.JOINTS_0);
  for (let i = 0; i < weights.length; i += 4) {
    close(weights.slice(i, i + 4).reduce((sum, weight) => sum + weight, 0), 1);
    assert.ok(joints.slice(i, i + 4).every(joint => joint < skin.joints.length));
  }
  const binds = accessor(model, skin.inverseBindMatrices);
  close(binds[2 * 16 + 12], -.15); close(binds[3 * 16 + 12], .15); close(binds[4 * 16 + 14], .35);
  for (const clip of model.animations) for (const sampler of clip.samplers) {
    assert.deepEqual(accessor(model, sampler.input), [0, .25, .5, .75, 1]);
    const rotations = accessor(model, sampler.output);
    assert.notEqual(rotations[6], 0);
    for (let i = 0; i < rotations.length; i += 4) close(Math.hypot(...rotations.slice(i, i + 4)), 1);
  }
});

test('architecture and invisible box colliders have identical transforms and open passage geometry', () => {
  const model = parse('models/courtyard.gltf'), parts = courtyardParts();
  assert.equal(model.nodes.length, parts.length);
  for (const part of parts) {
    const node = model.nodes.find(value => value.name === part.id);
    const entity = fixture.world.entities.find(value => value.id === `collision-${part.id}`);
    assert.deepEqual(node.translation, entity.transform.translation);
    assert.deepEqual(node.rotation ?? [0, 0, 0, 1], entity.transform.rotation);
    assert.deepEqual(node.scale.map(value => value / 2), component(entity, 'bve:collider').halfExtents);
    assert.equal(component(entity, 'bve:mesh'), undefined);
  }
  const left = parts.find(part => part.id === 'door-left'), right = parts.find(part => part.id === 'door-right'), lintel = parts.find(part => part.id === 'door-lintel');
  close((right.center[0] - right.size[0] / 2) - (left.center[0] + left.size[0] / 2), 1.2);
  close(lintel.center[1] - lintel.size[1] / 2, 2.2);
  close(parts.find(part => part.id === 'thin-barrier').size[2], .05);
  const stairs = parts.filter(part => part.id.startsWith('step-'));
  stairs.forEach((part, i) => close(part.center[1] + part.size[1] / 2, .18 * (i + 1)));
  assert.ok(parts.filter(part => part.id.startsWith('arch-')).every(part => Math.abs(part.center[0]) > 1 || part.center[1] > 3));
});

test('the coordinate model has meter axes and triangle winding agrees with surface normals', () => {
  const model = parse('models/coordinates.gltf');
  model.nodes.forEach((node, axis) => {
    close(node.scale[axis], 1); close(node.translation[axis], .5);
    const endpoint = [0, 0, 0]; endpoint[axis] = .5;
    close(transformPoint(transformMatrix({ kind: 'trs', translation: node.translation, rotation: [0, 0, 0, 1], scale: node.scale }), endpoint)[axis], 1);
  });
  const geometry = boxGeometry();
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const [a, b, c] = geometry.indices.slice(i, i + 3).map(index => geometry.positions.slice(index * 3, index * 3 + 3));
    const u = b.map((v, axis) => v - a[axis]), v = c.map((n, axis) => n - a[axis]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const normal = geometry.normals.slice(geometry.indices[i] * 3, geometry.indices[i] * 3 + 3);
    assert.ok(cross.reduce((sum, value, axis) => sum + value * normal[axis], 0) > 0);
  }
});

test('four music corners, creature audio and wall audio are independently bound', () => {
  const emitters = fixture.world.entities.filter(entity => component(entity, 'bve:audio-emitter'));
  assert.equal(emitters.length, 6);
  const music = emitters.filter(entity => component(entity, 'bve:audio-emitter').bus === 'music');
  assert.equal(music.length, 4);
  music.forEach(entity => close(Math.hypot(entity.transform.translation[0], entity.transform.translation[2]), Math.sqrt(72)));
  assert.equal(new Set(emitters.map(entity => component(entity, 'bve:audio-emitter').playbackId)).size, 6);
  const wall = emitters.find(entity => entity.id === 'wall-screen'), surface = component(wall, 'bve:media-surface'), audio = component(wall, 'bve:audio-emitter');
  assert.equal(surface.playbackId, audio.playbackId); assert.equal(surface.sourceAsset, audio.sourceAsset);
  close(wall.transform.scale[0] / wall.transform.scale[1], surface.aspectRatio);
});

test('calibrated PCM loops have their declared format, RMS and integer-cycle frequency', () => {
  for (const frequency of [220, 330, 440, 550, 1000]) {
    const wav = generateToneWav(frequency), view = new DataView(wav.buffer);
    assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
    assert.equal(view.getUint16(22, true), 1); assert.equal(view.getUint32(24, true), 48000); assert.equal(view.getUint16(34, true), 16);
    assert.equal(view.getUint32(40, true), 96000);
    let squares = 0, positiveCrossings = 0, previous = view.getInt16(44, true);
    for (let i = 0; i < 48000; i++) {
      const sample = view.getInt16(44 + i * 2, true);
      squares += (sample / 32767) ** 2;
      if (previous <= 0 && sample > 0) positiveCrossings++;
      previous = sample;
    }
    close(20 * Math.log10(Math.sqrt(squares / 48000)), -24, .002);
    assert.equal(positiveCrossings, frequency);
    assert.equal(view.getInt16(44, true), 0);
  }
  assert.throws(() => generateToneWav(.5)); assert.throws(() => generateToneWav(440, 44100));
});

test('local asset port verifies hashes, denies undeclared revisions and copies bytes at boundaries', async () => {
  const files = new Map([...fixture.files].map(([path, bytes]) => [path, new Uint8Array(bytes)]));
  const port = createFixtureAssetPort(fixture.catalog, files), ref = fixture.world.assets[0];
  files.get(fixture.catalog.resources[0].path)[0] ^= 255;
  const first = await port.resolve(ref); first.bytes[0] ^= 255;
  assert.equal(await sha256((await port.resolve(ref)).bytes), ref.revision);
  await assert.rejects(port.resolve({ ...ref, revision: 'f'.repeat(64) }), /not authorized/);
  await assert.rejects(port.resolve({ ...ref, id: 'private-source' }), /not authorized/);
  const corrupt = createFixtureAssetPort(fixture.catalog, files);
  await assert.rejects(corrupt.resolve(ref), /integrity/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(port.resolve(ref, controller.signal), { name: 'AbortError' });
});

test('fixture grants are explicit and scoped, with denied grants as the default', async () => {
  const grant = { scope: { principalId: 'actor', tenantId: 'tenant', projectId: 'project', worldId: 'courtyard-v1' }, operation: 'bve:edit', targetId: 'prop-0' };
  const authorizer = createFixtureAuthorizer([grant]);
  assert.equal((await authorizer.authorize(structuredClone(grant))).allowed, true);
  for (const key of ['principalId', 'tenantId', 'projectId', 'worldId']) assert.equal((await authorizer.authorize({ ...grant, scope: { ...grant.scope, [key]: 'another' } })).allowed, false);
  assert.equal((await authorizer.authorize({ ...grant, targetId: 'prop-1' })).allowed, false);
  assert.equal((await createFixtureAuthorizer([]).authorize(grant)).allowed, false);
});

test('catalog traversal, unsupported versions and mislabeled workload clients fail validation', () => {
  const catalog = structuredClone(fixture.catalog);
  catalog.resources[0].path = 'models/../outside.gltf';
  assert.ok(validateDocument('catalog', catalog).diagnostics.some(value => value.code === 'RESOURCE_PATH'));
  catalog.resources[0].path = fixture.catalog.resources[0].path; catalog.schemaVersion = 'next';
  assert.equal(validateDocument('catalog', catalog).ok, false);
  const workload = { ...fixture.workloads[2], protocolClients: 0 };
  assert.ok(validateDocument('workload', workload).diagnostics.some(value => value.code === 'PARTICIPANT_COUNT'));
  assert.ok(fixture.workloads.filter(value => value.participants > 2).every(value => value.realBrowserClients === 2 && value.protocolClients === value.participants - 2));
  assert.equal(fixture.catalog.schemaVersion, CONTRACT_VERSION);
  assert.equal(canonicalJson(fixture.catalog), canonicalJson(parse('catalog.json')));
});
