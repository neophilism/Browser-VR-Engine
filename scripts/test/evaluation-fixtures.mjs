// Synthetic verifier fixtures only. No browser/bundle execution, and no edits
// to retained historical captures or their original fingerprints.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { digest } from '../ci/evidence.mjs';
import { evaluationCommands } from '../ci/evaluation-evidence.mjs';
import { requiredF05BuildInputs, requiredF05WorkspaceInputs, requiredF05BuildOutputs, requiredF05SourceFiles, requiredF05PortableChecks } from '../ci/evaluate.mjs';
import { expectedPortableImportedModel, expectedPortableAffineEntities } from '../ci/portable-carrier-evidence.mjs';

export const fixtureRoot = resolve(import.meta.dirname, '../..');
export const pretty = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value !== null && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
export const json = async path => JSON.parse(await readFile(path, 'utf8'));
export async function rebindF05Inputs(report, root = fixtureRoot) {
  const fingerprints = async (names, prefix = '') => Object.fromEntries(await Promise.all(names.map(async name => {
    const bytes = await readFile(resolve(root, prefix, name)); return [name, { bytes: bytes.length, sha256: digest(bytes) }];
  })));
  report.sourceDigests = await fingerprints(requiredF05SourceFiles, 'evaluations/babylon-vrspace');
  report.build.inputs = await fingerprints(requiredF05BuildInputs, 'evaluations/babylon-vrspace');
  report.build.workspaceInputs = await fingerprints(requiredF05WorkspaceInputs);
  report.build.outputs = Object.fromEntries(requiredF05BuildOutputs.map(name => {
    const bytes = Buffer.from('Synthetic verifier output, never executed: ' + name + '\n');
    return [name, { bytes: bytes.length, sha256: digest(bytes) }];
  }));
  return report;
}

export function reviseWorld(world) {
  world.revision = digest(canonical({ id: world.id, coordinates: world.coordinates, assets: world.assets, entities: world.entities, requiredFeatures: world.requiredFeatures }));
  return world;
}
export function makeCarrier(world, originals) {
  reviseWorld(world);
  const assets = world.assets.map(reference => ({ id: reference.id, mediaType: originals.get(reference.id).mediaType, byteLength: originals.get(reference.id).bytes.length }));
  const manifest = { kind: 'f05-evaluation-world', version: 1, world, assets };
  const manifestBytes = Buffer.from(canonical(manifest));
  const payload = Buffer.concat(world.assets.map(reference => originals.get(reference.id).bytes));
  const bytes = Buffer.alloc(48 + manifestBytes.length + payload.length);
  bytes.write('BVEF05W1', 0); bytes.writeUInt32LE(manifestBytes.length, 8); bytes.writeUInt32LE(payload.length, 12);
  manifestBytes.copy(bytes, 48); payload.copy(bytes, 48 + manifestBytes.length); Buffer.from(digest(bytes.subarray(48)), 'hex').copy(bytes, 16);
  return { bytes, manifest, manifestIntegrity: digest(manifestBytes), assetReceipts: assets.map((asset, index) => ({ ...asset, revision: world.assets[index].revision })) };
}

export async function portableFixture(root = fixtureRoot) {
  const frozenDirectory = resolve(root, 'packages/qualification-fixtures/fixtures');
  const frozenWorld = await json(resolve(frozenDirectory, 'world.json')), catalog = await json(resolve(frozenDirectory, 'catalog.json'));
  const originals = new Map(await Promise.all(catalog.resources.map(async resource => [resource.id, {
    bytes: await readFile(resolve(frozenDirectory, resource.path)), mediaType: resource.mediaType
  }])));
  const derived = expectedPortableImportedModel(originals.get('prop-model').bytes), revision = digest(derived), assetId = 'dropped-' + revision;
  originals.set(assetId, { bytes: derived, mediaType: 'model/gltf-binary' });
  const world = structuredClone(frozenWorld), entityId = 'prop-1-' + revision.slice(0, 6), meshEntityId = entityId + '-model';
  world.entities.find(entity => entity.id === 'prop-0').transform.translation = [2, 4, 2];
  world.assets.push({ id: assetId, revision, kind: 'model' });
  const factor = 5 / 9, center = [5.2, 0.5, -2], half = [2, 35 / 18, 4 / 3], name = 'off-center-scaled-prop.glb';
  world.entities.push(
    { id: entityId, name, transform: { kind: 'trs', translation: [0, 2, 5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      components: [{ type: 'bve:collider', version: '0.1.0', required: true, data: { shape: 'box', halfExtents: half, body: 'dynamic', massKg: 3 } }] },
    { id: meshEntityId, name: name + ' model', parentId: entityId,
      transform: { kind: 'trs', translation: center.map(value => -value * factor), rotation: [0, 0, 0, 1], scale: [factor, factor, factor] },
      components: [{ type: 'bve:mesh', version: '0.1.0', required: true, data: { asset: assetId } }] }
  );
  const exported = makeCarrier(world, originals), variantWorld = structuredClone(world);
  variantWorld.entities.push(...expectedPortableAffineEntities());
  const authored = makeCarrier(variantWorld, originals);
  const imported = { entityId, meshEntityId, assetId, name, bytes: derived.length, revision, vertices: 72, colliderHalfExtents: half, normalization: { offset: center, scale: factor } };
  const observation = (file, carrier) => ({ file, bytes: carrier.bytes.length, sha256: digest(carrier.bytes), worldId: carrier.manifest.world.id,
    worldRevision: carrier.manifest.world.revision, manifestIntegrity: carrier.manifestIntegrity, assetReceipts: carrier.assetReceipts,
    authoredProp: carrier.manifest.world.entities.find(entity => entity.id === 'prop-0'), imported: structuredClone(imported), entityCount: carrier.manifest.world.entities.length });
  const history = resolve(root, 'evaluations/babylon-vrspace/evidence/audio-measurement-fix');
  const historical = await json(resolve(history, 'browser-checks.json'));
  const report = { scope: 'Synthetic portable verifier fixture; no browser execution', method: 'real-browser', physicalHeadset: false, physicalAudio: false,
    qualificationStatus: 'incomplete', startedAt: '2026-10-18T00:01:00.000Z', timestamp: '2026-10-18T00:02:00.000Z',
    candidate: { babylon: '9.30.0', rapier: '0.21.0', typebox: '0.34.52' }, environment: historical.environment,
    fixtureDigests: historical.fixtureDigests, comparison: historical.comparison, build: historical.build,
    checks: requiredF05PortableChecks.map(id => ({ id, status: 'passed', method: 'real-browser' })),
    observed: { exported: observation('exported-world.bveworld', exported), reexported: observation('reexported-world.bveworld', exported), variant: observation('authored-world.bveworld', authored) },
    fixtureAttempts: { author: 0, fresh: 0, rollback: 0 }, logs: [], failedRequests: [], finalizationErrors: [],
    missingEvidence: ['Synthetic verifier fixture does not establish browser or hardware execution.'],
    counts: { passed: 9, failed: 0, pageErrors: 0, failedRequests: 0, logOverflow: 0 }, runStatus: 'passed' };
  await rebindF05Inputs(report, root);
  const summary = { qualificationStatus: 'incomplete', evidenceFile: 'portable-browser-checks.json', checks: structuredClone(report.checks), counts: { ...report.counts }, runStatus: 'passed' };
  const runDirectory = 'artifacts/portable-runs/run-Synthetic', record = { files: [], portable: { runDirectory, startedAt: report.startedAt, finishedAt: report.timestamp } };
  const portableCommand = { ...structuredClone(evaluationCommands.find(command => command.id === 'f05-portable-browser')),
    outcome: 'passed', exitCode: 0, errorCode: null, signal: null, durationMs: 62000, startedAt: '2026-10-18T00:00:59.000Z', finishedAt: '2026-10-18T00:02:01.000Z',
    log: JSON.stringify({ runStatus: 'passed', ...report.counts, output: runDirectory }) };
  return { root, report, summary, record, portableCommand, originals, frozenWorld, catalog,
    exportedBytes: exported.bytes, reexportedBytes: Buffer.from(exported.bytes), authoredBytes: authored.bytes,
    screenshotBytes: await readFile(resolve(history, 'courtyard-verified.png')) };
}

export function bindPortableFixture(value) {
  const reportBytes = pretty(value.report), summaryBytes = pretty(value.summary), buildBytes = pretty(value.report.build);
  for (const [field, name, bytes] of [
    ['reportSha256', 'portable-browser-checks.json', reportBytes], ['summarySha256', 'portable-summary.json', summaryBytes], ['buildSha256', 'build.json', buildBytes],
    ['screenshotSha256', 'portable-world.png', value.screenshotBytes], ['exportedSha256', 'exported-world.bveworld', value.exportedBytes],
    ['reexportedSha256', 'reexported-world.bveworld', value.reexportedBytes], ['authoredSha256', 'authored-world.bveworld', value.authoredBytes],
  ]) {
    const path = 'portable/' + name;
    value.record.portable[field] = digest(bytes); value.record.files = value.record.files.filter(item => item.path !== path);
    value.record.files.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  }
  return { ...value, reportBytes, summaryBytes, buildBytes };
}
