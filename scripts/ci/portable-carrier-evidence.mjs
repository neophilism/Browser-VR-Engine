// Independent, dependency-free inspection of downloaded data. Never import or
// execute the submitted browser bundle to decide whether its carrier is valid.
import { createHash } from 'node:crypto';

export const PORTABLE_EVIDENCE_LIMITS = Object.freeze({ bytes: 4 * 1024 * 1024, manifestBytes: 2 * 1024 * 1024,
  depth: 48, values: 100000, string: 65536, assets: 128, entities: 512 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(`Portable carrier evidence: ${message}`); };
const require = (condition, message) => { if (!condition) fail(message); };
const exact = (value, keys, optional = []) => object(value) && keys.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => keys.includes(key) || optional.includes(key));
const id = value => typeof value === 'string' && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
const feature = value => typeof value === 'string' && value.length <= 128 && /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_.-]*$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const known = ['bve:mesh', 'bve:collider', 'bve:audio-emitter', 'bve:media-surface', 'bve:animation'];
const coordinates = { units: 'meters', handedness: 'right', up: '+Y', cameraForward: '-Z', quaternionOrder: 'xyzw', matrixOrder: 'column-major' };

// Bound depth before JSON.parse; reject non-finite numbers, reserved keys and
// excessive value/string counts before recursive canonical encoding.
function inspectJSON(value) {
  const pending = [[value, 0]]; let values = 0;
  while (pending.length) {
    const [item, depth] = pending.pop();
    require(++values <= PORTABLE_EVIDENCE_LIMITS.values && depth <= PORTABLE_EVIDENCE_LIMITS.depth + 2, 'JSON value/depth budget exceeded');
    if (typeof item === 'string') require(item.length <= PORTABLE_EVIDENCE_LIMITS.string, 'JSON string budget exceeded');
    else if (typeof item === 'number') require(Number.isFinite(item), 'Non-finite JSON number');
    else if (item !== null && typeof item === 'object') {
      if (Array.isArray(item)) require(item.length + pending.length + values <= PORTABLE_EVIDENCE_LIMITS.values, 'JSON value budget exceeded');
      const keys = Object.keys(item);
      require(keys.length + pending.length + values <= PORTABLE_EVIDENCE_LIMITS.values, 'JSON value budget exceeded');
      for (const key of keys) {
        require(key.length <= PORTABLE_EVIDENCE_LIMITS.string && !['__proto__', 'prototype', 'constructor'].includes(key), 'Reserved or excessive JSON key');
        pending.push([item[key], depth + 1]);
      }
    }
  }
}
export function canonicalCarrierJSON(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalCarrierJSON).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalCarrierJSON(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const same = (left, right) => canonicalCarrierJSON(left) === canonicalCarrierJSON(right);
function parseManifest(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail('Manifest is not valid UTF-8'); }
  let depth = 0, quoted = false, escaped = false;
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') require(++depth <= PORTABLE_EVIDENCE_LIMITS.depth + 3, 'Manifest nesting exceeds its bound');
    else if (char === '}' || char === ']') require(--depth >= 0, 'Malformed manifest delimiters');
  }
  require(depth === 0 && !quoted, 'Truncated manifest');
  let manifest;
  try { manifest = JSON.parse(text); } catch { fail('Manifest is not valid JSON'); }
  inspectJSON(manifest);
  require(canonicalCarrierJSON(manifest) === text, 'Manifest has duplicate keys or is not exact canonical JSON');
  return manifest;
}

function validateTransform(transform) {
  require(object(transform), 'Missing entity transform');
  if (transform.kind === 'trs') {
    require(exact(transform, ['kind', 'translation', 'rotation', 'scale']) && vector(transform.translation, 3)
      && vector(transform.rotation, 4) && vector(transform.scale, 3) && transform.scale.every(value => value !== 0)
      && Math.abs(Math.hypot(...transform.rotation) - 1) <= 1e-5, 'Malformed canonical TRS transform');
  } else {
    require(exact(transform, ['kind', 'elements']) && transform.kind === 'matrix' && vector(transform.elements, 16), 'Malformed matrix transform');
    const m = transform.elements;
    const determinant = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
    require(m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1 && determinant !== 0 && Number.isFinite(determinant), 'Non-affine or singular matrix transform');
  }
}
function validateWorld(world) {
  require(exact(world, ['kind', 'schemaVersion', 'id', 'revision', 'coordinates', 'assets', 'entities', 'requiredFeatures'])
    && world.kind === 'world-fixture' && world.schemaVersion === '0.1.0' && id(world.id) && digest(world.revision)
    && same(world.coordinates, coordinates), 'Malformed authored world contract or coordinates');
  require(Array.isArray(world.assets) && world.assets.length <= PORTABLE_EVIDENCE_LIMITS.assets
    && Array.isArray(world.entities) && world.entities.length <= PORTABLE_EVIDENCE_LIMITS.entities
    && Array.isArray(world.requiredFeatures) && world.requiredFeatures.length <= 128
    && new Set(world.requiredFeatures).size === world.requiredFeatures.length && world.requiredFeatures.every(name => known.includes(name)), 'Invalid world inventories or required features');
  const assets = new Map(), entities = new Map();
  for (const asset of world.assets) {
    require(exact(asset, ['id', 'revision', 'kind'], ['sourceCoordinates']) && id(asset.id) && digest(asset.revision)
      && ['model', 'image', 'audio', 'video', 'attachment'].includes(asset.kind) && !assets.has(asset.id), 'Malformed or duplicate asset reference');
    if (asset.sourceCoordinates !== undefined) {
      const source = asset.sourceCoordinates;
      require(exact(source, ['unitsPerMeter', 'handedness', 'up', 'authoredForward', 'sourceToWorld'])
        && Number.isFinite(source.unitsPerMeter) && source.unitsPerMeter > 0 && ['right', 'left'].includes(source.handedness)
        && ['+Y', '+Z'].includes(source.up) && ['+Z', '-Z', '+Y', '-Y'].includes(source.authoredForward)
        && vector(source.sourceToWorld, 16), 'Malformed source-coordinate metadata');
    }
    assets.set(asset.id, asset);
  }
  for (const entity of world.entities) {
    require(exact(entity, ['id', 'name', 'transform', 'components'], ['parentId']) && id(entity.id) && !entities.has(entity.id)
      && typeof entity.name === 'string' && entity.name.length <= 256 && (entity.parentId === undefined || id(entity.parentId))
      && Array.isArray(entity.components) && entity.components.length <= 64, 'Malformed or duplicate entity');
    validateTransform(entity.transform);
    entities.set(entity.id, entity);
  }
  const playback = new Map();
  for (const entity of world.entities) {
    let parent = entity; const chain = new Set();
    while (parent) {
      require(!chain.has(parent.id) && chain.size < PORTABLE_EVIDENCE_LIMITS.depth, 'Cyclic or excessive entity hierarchy');
      chain.add(parent.id);
      require(parent.parentId === undefined || entities.has(parent.parentId), 'Missing entity parent');
      parent = entities.get(parent.parentId);
    }
    const types = new Set();
    for (const component of entity.components) {
      require(exact(component, ['type', 'version', 'required', 'data']) && feature(component.type) && !types.has(component.type)
        && typeof component.version === 'string' && component.version.length <= 64 && /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(component.version)
        && typeof component.required === 'boolean', 'Malformed or duplicate entity component');
      types.add(component.type);
      if (component.required) require(known.includes(component.type) && component.version === '0.1.0', 'Unsupported required component');
      if (!known.includes(component.type) || component.version !== '0.1.0') continue;
      const data = component.data;
      require(object(data), 'Malformed builtin component data');
      const reference = data.asset ?? data.sourceAsset;
      if (reference !== undefined) require(id(reference) && assets.has(reference), 'Missing component asset');
      if (component.type === 'bve:mesh') require(exact(data, ['asset']) && assets.get(reference)?.kind === 'model', 'Invalid mesh binding');
      if (component.type === 'bve:collider') require(exact(data, ['shape', 'halfExtents', 'body', 'massKg']) && data.shape === 'box'
        && vector(data.halfExtents, 3) && data.halfExtents.every(value => value > 0 && value <= 10000)
        && ['static', 'dynamic', 'kinematic'].includes(data.body) && Number.isFinite(data.massKg) && data.massKg >= 0 && data.massKg <= 10000
        && (data.body !== 'dynamic' || data.massKg > 0), 'Invalid solid collider');
      if (component.type === 'bve:animation') require(exact(data, ['asset', 'clip', 'loop', 'route', 'speedMetersPerSecond'])
        && assets.get(reference)?.kind === 'model' && typeof data.clip === 'string' && data.clip.length > 0 && data.clip.length <= 128
        && typeof data.loop === 'boolean' && Array.isArray(data.route) && data.route.length >= 2 && data.route.length <= 128
        && data.route.every(value => vector(value, 3)) && Number.isFinite(data.speedMetersPerSecond)
        && data.speedMetersPerSecond > 0 && data.speedMetersPerSecond <= 100, 'Invalid animation binding');
      if (component.type === 'bve:media-surface') require(exact(data, ['sourceAsset', 'playbackId', 'aspectRatio'])
        && ['image', 'video'].includes(assets.get(reference)?.kind) && id(data.playbackId)
        && Number.isFinite(data.aspectRatio) && data.aspectRatio > 0 && data.aspectRatio <= 64, 'Invalid media binding');
      if (component.type === 'bve:audio-emitter') {
        require(exact(data, ['sourceAsset', 'playbackId', 'bus', 'spatial', 'localOffset', 'gain', 'curve', 'channels', 'loop'])
          && ['audio', 'video'].includes(assets.get(reference)?.kind) && id(data.playbackId) && ['voice', 'video', 'music', 'ambience', 'effects'].includes(data.bus)
          && typeof data.spatial === 'boolean' && vector(data.localOffset, 3) && Number.isFinite(data.gain) && data.gain >= 0 && data.gain <= 4
          && ['mono', 'stereo'].includes(data.channels) && typeof data.loop === 'boolean', 'Invalid audio binding');
        const curve = data.curve;
        require(exact(curve, ['model', 'referenceDistance', 'rolloff', 'fadeStart', 'cutoff'])
          && ['inverse', 'linear', 'exponential'].includes(curve.model) && [curve.referenceDistance, curve.rolloff, curve.fadeStart, curve.cutoff].every(Number.isFinite)
          && curve.rolloff >= 0 && curve.referenceDistance > 0 && curve.referenceDistance <= curve.fadeStart && curve.fadeStart < curve.cutoff, 'Invalid spatial attenuation');
      }
      if (data.playbackId !== undefined) {
        require(!playback.has(data.playbackId) || playback.get(data.playbackId) === data.sourceAsset, 'Conflicting playback identity');
        playback.set(data.playbackId, data.sourceAsset);
      }
    }
  }
  const revision = hash(canonicalCarrierJSON({ id: world.id, coordinates: world.coordinates, assets: world.assets, entities: world.entities, requiredFeatures: world.requiredFeatures }));
  require(world.revision === revision, 'Authored world revision does not match all authored content');
}

export function inspectPortableCarrier(bytes) {
  require(Buffer.isBuffer(bytes) && bytes.length >= 48 && bytes.length <= PORTABLE_EVIDENCE_LIMITS.bytes, 'Invalid or excessive file length');
  require(bytes.subarray(0, 8).equals(Buffer.from('BVEF05W1')), 'Invalid carrier magic');
  const manifestLength = bytes.readUInt32LE(8), payloadLength = bytes.readUInt32LE(12);
  require(manifestLength > 0 && manifestLength <= PORTABLE_EVIDENCE_LIMITS.manifestBytes && 48 + manifestLength + payloadLength === bytes.length,
    'Truncated, trailing or excessive carrier lengths');
  require(hash(bytes.subarray(48)) === bytes.subarray(16, 48).toString('hex'), 'Complete body digest differs');
  const manifestBytes = bytes.subarray(48, 48 + manifestLength), manifest = parseManifest(manifestBytes);
  require(exact(manifest, ['kind', 'version', 'world', 'assets']) && manifest.kind === 'f05-evaluation-world' && manifest.version === 1
    && Array.isArray(manifest.assets) && manifest.assets.length <= PORTABLE_EVIDENCE_LIMITS.assets, 'Invalid carrier manifest');
  validateWorld(manifest.world);
  require(manifest.assets.length === manifest.world.assets.length, 'Original asset inventory differs from authored references');
  const originals = new Map(), assetReceipts = []; let offset = 48 + manifestLength;
  for (const [index, descriptor] of manifest.assets.entries()) {
    const reference = manifest.world.assets[index];
    require(exact(descriptor, ['id', 'mediaType', 'byteLength']) && descriptor.id === reference.id && !originals.has(descriptor.id)
      && typeof descriptor.mediaType === 'string' && descriptor.mediaType.length <= 128 && /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(descriptor.mediaType)
      && Number.isSafeInteger(descriptor.byteLength) && descriptor.byteLength > 0 && offset + descriptor.byteLength <= bytes.length,
    'Duplicate, reordered, missing or excessive original asset descriptor');
    const original = bytes.subarray(offset, offset + descriptor.byteLength); offset += descriptor.byteLength;
    require(hash(original) === reference.revision, 'An original asset revision differs from its actual bytes');
    originals.set(reference.id, original);
    assetReceipts.push({ ...descriptor, revision: reference.revision });
  }
  require(offset === bytes.length, 'Payload has unclaimed original bytes');
  return { world: manifest.world, originals, assetReceipts, bytes: bytes.length, integrity: hash(bytes), manifestIntegrity: hash(manifestBytes), bodyIntegrity: hash(bytes.subarray(48)) };
}

// Reconstruct the deliberately transformed synthetic input from the checked F03
// original. The submitted carrier cannot choose a different model and bless it
// by changing its own hash, report fields and envelope together.
export function expectedPortableImportedModel(original) {
  const model = JSON.parse(original);
  require(Array.isArray(model.nodes) && model.nodes[0] && model.buffers?.length === 1
    && typeof model.buffers[0].uri === 'string', 'Pinned prop fixture layout differs');
  const match = /^data:application\/octet-stream;base64,([A-Za-z0-9+/]+={0,2})$/.exec(model.buffers[0].uri);
  require(match, 'Pinned prop fixture must have one embedded buffer');
  const binary = Buffer.from(match[1], 'base64');
  require(binary.length === model.buffers[0].byteLength, 'Pinned prop buffer length differs');
  model.nodes[0].translation = [4, 1, -2]; model.nodes[0].scale = [8, 8, 8]; delete model.buffers[0].uri;
  const json = Buffer.from(JSON.stringify(model));
  const jsonLength = Math.ceil(json.length / 4) * 4, binLength = Math.ceil(binary.length / 4) * 4;
  const result = Buffer.alloc(12 + 8 + jsonLength + 8 + binLength);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonLength, 12); result.writeUInt32LE(0x4e4f534a, 16);
  result.fill(32, 20, 20 + jsonLength); json.copy(result, 20);
  result.writeUInt32LE(binLength, 20 + jsonLength); result.writeUInt32LE(0x004e4942, 24 + jsonLength);
  binary.copy(result, 28 + jsonLength);
  return result;
}

export function expectedPortableAffineEntities() {
  return [
    { id: 'portable-affine-parent', name: 'Signed affine parent', transform: { kind: 'matrix', elements: [-1.2, 0, 0, 0, 0.4, 1.1, 0, 0, 0, 0.2, 0.8, 0, -5, 1.5, 3, 1] }, components: [] },
    { id: 'portable-affine-solid', name: 'Affine static original prop', parentId: 'portable-affine-parent',
      transform: { kind: 'trs', translation: [1, 0.25, -0.5], rotation: [0, Math.sin(Math.PI / 12), 0, Math.cos(Math.PI / 12)], scale: [1.3, 0.8, 0.6] },
      components: [
        { type: 'bve:mesh', version: '0.1.0', required: true, data: { asset: 'prop-model' } },
        { type: 'bve:collider', version: '0.1.0', required: true, data: { shape: 'box', halfExtents: [0.6, 0.5, 0.4], body: 'static', massKg: 0 } }
      ] }
  ];
}
const nearVector = (actual, expected, tolerance = 1e-5) => vector(actual, expected.length) && actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

export function validatePortableWorldObservations(carriers, observed, { frozenWorld, catalog, originalPropBytes } = {}) {
  const errors = [];
  try {
    require(object(observed) && object(observed.exported) && object(observed.reexported) && object(observed.variant), 'Missing independently bound portable observations');
    require(carriers.exported.integrity === carriers.reexported.integrity, 'Re-export changed authored content or original bytes');
    const derived = expectedPortableImportedModel(originalPropBytes), revision = hash(derived);
    const assetId = 'dropped-' + revision, entityId = 'prop-1-' + revision.slice(0, 6), meshEntityId = entityId + '-model';
    const factor = 5 / 9, center = [5.2, 0.5, -2], half = [2, 35 / 18, 4 / 3];
    const exportedWorld = carriers.exported.world;
    const prop = exportedWorld.entities.find(entity => entity.id === 'prop-0');
    require(prop?.transform.kind === 'trs' && same(prop.transform.translation, [2, 4, 2]) && same(prop.transform.scale, [1, 1, 1]), 'Expected authored prop edit is missing');
    require(exportedWorld.entities.length === frozenWorld.entities.length + 2, 'Missing or extra imported entities');
    const expectedOriginalEntities = structuredClone(frozenWorld.entities);
    expectedOriginalEntities.find(entity => entity.id === 'prop-0').transform = prop.transform;
    require(same(exportedWorld.entities.slice(0, frozenWorld.entities.length), expectedOriginalEntities), 'Original entity content or ordering changed');
    const body = exportedWorld.entities[frozenWorld.entities.length], child = exportedWorld.entities[frozenWorld.entities.length + 1];
    require(body.id === entityId && body.name === 'off-center-scaled-prop.glb' && body.parentId === undefined && body.transform.kind === 'trs'
      && nearVector(body.transform.translation, [0, 2, 5]) && same(body.transform.rotation, [0, 0, 0, 1]) && same(body.transform.scale, [1, 1, 1])
      && body.components.length === 1 && body.components[0].type === 'bve:collider'
      && body.components[0].version === '0.1.0' && body.components[0].required === true, 'Imported body identity, placement or component ownership differs');
    const collider = body.components[0].data;
    require(collider.shape === 'box' && collider.body === 'dynamic' && collider.massKg === 3 && nearVector(collider.halfExtents, half), 'Imported collider does not match the independent normalized model bounds');
    require(child.id === meshEntityId && child.parentId === entityId && child.name === (body.name + ' model').slice(0, 256)
      && child.transform.kind === 'trs' && same(child.transform.rotation, [0, 0, 0, 1])
      && nearVector(child.transform.translation, center.map(value => -value * factor)) && nearVector(child.transform.scale, [factor, factor, factor])
      && same(child.components, [{ type: 'bve:mesh', version: '0.1.0', required: true, data: { asset: assetId } }]), 'Imported normalized mesh hierarchy differs');
    const variant = structuredClone(exportedWorld);
    variant.entities.push(...expectedPortableAffineEntities());
    delete variant.revision;
    const actualVariant = { ...carriers.authored.world }; delete actualVariant.revision;
    require(same(actualVariant, variant), 'Authored affine variant differs from the exact intended additions');
    for (const [kind, file] of [['exported', 'exported-world.bveworld'], ['reexported', 'reexported-world.bveworld'], ['authored', 'authored-world.bveworld']]) {
      const carrier = carriers[kind], value = observed[kind === 'authored' ? 'variant' : kind];
      require(value.file === file && value.bytes === carrier.bytes && value.sha256 === carrier.integrity
        && value.worldId === carrier.world.id && value.worldRevision === carrier.world.revision
        && value.manifestIntegrity === carrier.manifestIntegrity && same(value.assetReceipts, carrier.assetReceipts)
        && value.entityCount === carrier.world.entities.length, 'Portable observation differs from retained ' + kind + ' carrier');
      require(carrier.world.assets.length === frozenWorld.assets.length + 1
        && same(carrier.world.assets.slice(0, frozenWorld.assets.length), frozenWorld.assets), 'Frozen asset references, ordering or source coordinates changed');
      require(carrier.world.id === frozenWorld.id && same(carrier.world.coordinates, frozenWorld.coordinates)
        && same(carrier.world.requiredFeatures, frozenWorld.requiredFeatures), 'Original world identity or feature contract changed');
      require(same(carrier.world.assets.at(-1), { id: assetId, revision, kind: 'model' })
        && carrier.originals.get(assetId)?.equals(derived)
        && carrier.assetReceipts.at(-1)?.mediaType === 'model/gltf-binary', 'Imported original differs from the deterministic checked-source derivative');
      require(same(value.authoredProp, carrier.world.entities.find(entity => entity.id === 'prop-0')), 'Authored prop observation differs from retained content');
      const imported = value.imported;
      require(object(imported) && imported.entityId === entityId && imported.meshEntityId === meshEntityId && imported.assetId === assetId
        && imported.name === body.name && imported.bytes === derived.length && imported.revision === revision && imported.vertices === 72
        && nearVector(imported.colliderHalfExtents, half) && object(imported.normalization)
        && nearVector(imported.normalization.offset, center) && Number.isFinite(imported.normalization.scale)
        && Math.abs(imported.normalization.scale - factor) <= 1e-5, 'Imported observation differs from independently derived geometry');
      for (const reference of frozenWorld.assets) {
        const resource = catalog.resources.find(item => item.id === reference.id), receipt = carrier.assetReceipts.find(item => item.id === reference.id);
        require(resource && receipt && receipt.mediaType === resource.mediaType && receipt.byteLength === resource.sizeBytes
          && receipt.revision === resource.sha256, 'A frozen original is missing or has changed');
      }
    }
  } catch (error) { errors.push(error.message); }
  return errors;
}
