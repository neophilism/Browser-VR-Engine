import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, symlink, truncate, cp } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { digest } from '../ci/evidence.mjs';
import { evaluationCommands, validateEvaluationFiles } from '../ci/evaluation-evidence.mjs';
import { collectPortableEvidence, evaluationRunDirectories, validatePortableBrowserEvidence,
  requiredF05BuildInputs, requiredF05WorkspaceInputs, requiredF05BuildOutputs, requiredF05SourceFiles } from '../ci/evaluate.mjs';
import { inspectPortableCarrier, expectedPortableAffineEntities } from '../ci/portable-carrier-evidence.mjs';
import { fixtureRoot, portableFixture, bindPortableFixture, makeCarrier, canonical, pretty } from './evaluation-fixtures.mjs';

async function validate(value) { return validatePortableBrowserEvidence(value.report, value.summary, bindPortableFixture(value)); }
function rawCarrier(text, payload) {
  const manifest = Buffer.isBuffer(text) ? text : Buffer.from(text), bytes = Buffer.alloc(48 + manifest.length + payload.length);
  bytes.write('BVEF05W1'); bytes.writeUInt32LE(manifest.length, 8); bytes.writeUInt32LE(payload.length, 12);
  manifest.copy(bytes, 48); payload.copy(bytes, 48 + manifest.length); Buffer.from(digest(bytes.subarray(48)), 'hex').copy(bytes, 16);
  return bytes;
}
function splitCarrier(bytes) {
  const length = bytes.readUInt32LE(8);
  return { text: bytes.subarray(48, 48 + length).toString(), payload: bytes.subarray(48 + length) };
}
function replaceCarrier(value, key, mutate) {
  const source = value[key + 'Bytes'], manifest = JSON.parse(splitCarrier(source).text);
  const originals = new Map([...value.originals].map(([id, asset]) => [id, { ...asset, bytes: Buffer.from(asset.bytes) }]));
  const observed = value.report.observed[key === 'authored' ? 'variant' : key];
  mutate(manifest.world, originals, observed);
  const carrier = makeCarrier(manifest.world, originals);
  value.originals = originals;
  value[key + 'Bytes'] = carrier.bytes;
  Object.assign(observed, { bytes: carrier.bytes.length, sha256: digest(carrier.bytes), worldId: manifest.world.id,
    worldRevision: manifest.world.revision, manifestIntegrity: carrier.manifestIntegrity, assetReceipts: carrier.assetReceipts,
    authoredProp: manifest.world.entities.find(entity => entity.id === 'prop-0'), entityCount: manifest.world.entities.length });
}

test('portable command, input closure and outputs are exact and separate from desktop and XR', () => {
  assert.equal(evaluationCommands.length, 14);
  const index = evaluationCommands.findIndex(command => command.id === 'f05-portable-browser');
  assert.equal(evaluationCommands[index - 1].id, 'f05-xr-browser');
  assert.deepEqual(evaluationCommands[index], { id: 'f05-portable-browser', cwd: 'evaluations/babylon-vrspace', argv: ['node', 'run.mjs', 'test-world'] });
  assert.equal(requiredF05BuildInputs.length, 15); assert.equal(requiredF05WorkspaceInputs.length, 8);
  assert.equal(requiredF05BuildOutputs.length, 4); assert.equal(requiredF05SourceFiles.length, 34);
});
test('independent portable verifier accepts consistent synthetic bytes without executing a submitted bundle', async () => {
  const value = await portableFixture();
  assert.deepEqual(await validate(value), []);
  const result = inspectPortableCarrier(value.exportedBytes);
  assert.equal(result.world.entities.length, 57); assert.equal(result.originals.size, 12);
  assert.deepEqual(result.originals.get('readability-image'), value.originals.get('readability-image').bytes);
});

for (const [name, change, pattern] of [
  ['missing current method', value => { value.report.checks.pop(); }, /9 portable-world checks/],
  ['reordered methods', value => { value.report.checks.reverse(); }, /9 portable-world checks/],
  ['failed check hidden by counts', value => { value.report.checks[0].status = 'failed'; }, /9 portable-world checks/],
  ['malformed check', value => { value.report.checks[0] = null; }, /9 portable-world checks/],
  ['claim of physical headset execution', value => { value.report.physicalHeadset = true; }, /incomplete software/],
  ['claim of physical GPU execution', value => { value.report.environment.physicalGPU = true; }, /software-rendering identity/],
  ['full qualification', value => { value.report.qualificationStatus = 'passed'; }, /incomplete software/],
  ['missing physical limitations', value => { value.report.missingEvidence = []; }, /limitations/],
  ['missing portable source', value => { delete value.report.sourceDigests['src/portable-world.js']; }, /source.*coverage/],
  ['missing independent portable test source', value => { delete value.report.sourceDigests['test/portable-browser-checks.mjs']; }, /source.*coverage/],
  ['missing workspace source', value => { delete value.report.build.workspaceInputs['packages/contracts/src/index.ts']; }, /workspace build input.*coverage/],
  ['changed workspace source', value => { value.report.build.workspaceInputs['packages/contracts/src/schemas.ts'].sha256 = '0'.repeat(64); }, /Changed workspace build input/],
  ['extra workspace input', value => { value.report.build.workspaceInputs['packages/other/src/index.ts'] = { bytes: 1, sha256: '0'.repeat(64) }; }, /workspace build input.*coverage/],
  ['missing standalone output', value => { delete value.report.build.outputs['dist/portable-world.mjs']; }, /output inventory/],
  ['unbound fourth output', value => { value.report.build.outputs['dist/portable-world.mjs'].bytes = 0; }, /output fingerprint/],
  ['changed TypeBox candidate', value => { value.report.candidate.typebox = '0.0.0'; }, /candidate differs/],
  ['changed frozen comparison', value => { value.report.comparison.fixtureSetId = 'other'; }, /fixture\/comparison/],
  ['historical output directory', value => { value.record.portable.runDirectory = 'evidence/old-run'; }, /run directory|command output/],
  ['stale report', value => { value.portableCommand.startedAt = '2027-01-01T00:00:00Z'; }, /time bounds/],
  ['desktop command substitution', value => { value.portableCommand.argv = ['node', 'run.mjs', 'test']; }, /command did not complete/],
  ['wrong command cwd', value => { value.portableCommand.cwd = '.'; }, /command did not complete/],
  ['nonzero child exit', value => { value.portableCommand.exitCode = 7; }, /command did not complete/],
  ['spawn error alongside zero exit', value => { value.portableCommand.errorCode = 'EPERM'; }, /command did not complete/],
  ['child signal alongside zero exit', value => { value.portableCommand.signal = 'SIGTERM'; }, /command did not complete/],
  ['different stdout run', value => { value.portableCommand.log = value.portableCommand.log.replace('run-Synthetic', 'run-Other'); }, /command output/],
  ['two stdout success objects', value => { value.portableCommand.log += '\n' + value.portableCommand.log; }, /command output/],
  ['late page error', value => { value.report.logs.push({ type: 'pageerror', text: 'Synthetic late event' }); }, /page errors/],
  ['malformed log entry', value => { value.report.logs.push('malformed'); }, /invalid diagnostics/],
  ['late failed request', value => { value.report.failedRequests.push({ url: 'https://example.invalid/' }); }, /failed requests/],
  ['cleanup rejection', value => { value.report.finalizationErrors.push({ stage: 'browser-close', message: 'Synthetic failure' }); }, /finalization/],
  ['log overflow', value => { value.report.counts.logOverflow = 1; }, /counts/],
  ...['', false, 0, {}, [], 'late fatal'].map(fatal => ['non-null fatal ' + JSON.stringify(fatal), value => { value.report.fatalError = fatal; }, /fatal/]),
  ['summary fatal despite a passing report', value => { value.summary.fatalError = false; }, /fatal/],
  ['silent fixture fallback', value => { value.report.fixtureAttempts.fresh = 1; }, /fixture-route/],
  ['missing fallback counter', value => { delete value.report.fixtureAttempts.rollback; }, /fixture-route/],
  ['inconsistent summary', value => { value.summary.checks[0].method = 'simulation'; }, /summary/],
  ['truncated PNG with rebound digest', value => { value.screenshotBytes = value.screenshotBytes.subarray(0, 24); }, /complete 1280x720 PNG/],
  ['different observation world id', value => { value.report.observed.exported.worldId = 'unrelated'; }, /observation differs/],
  ['original omitted from observation receipts', value => { value.report.observed.exported.assetReceipts.pop(); }, /observation differs/],
  ['invented import center', value => { value.report.observed.exported.imported.normalization.offset[0] += 1; }, /independently derived geometry/],
  ['invented vertex count', value => { value.report.observed.exported.imported.vertices = 1; }, /independently derived geometry/],
]) test(`portable verifier rejects ${name} with recalculated outer hashes`, async () => {
  const value = await portableFixture(); change(value);
  assert.match((await validate(value)).join('\n'), pattern);
});

test('carrier manifest parser rejects hostile canonical content after whole-body digest is recalculated', async () => {
  const value = await portableFixture(), { text, payload } = splitCarrier(value.exportedBytes);
  const original = JSON.parse(text);
  const cases = [
    ['duplicate key', text.replace('"version":1', '"version":1,"version":1'), payload],
    ['noncanonical ordering', JSON.stringify(original, null, 2), payload],
    ['invalid UTF8', Buffer.concat([Buffer.from([0xff]), Buffer.from(text)]), payload],
    ['unclaimed bytes', text, Buffer.concat([payload, Buffer.from([0])])],
    ['deep nested manifest', '{"excess":' + '['.repeat(60) + '0' + ']'.repeat(60) + '}', payload],
  ];
  for (const [name, changed, bytes] of cases) assert.throws(() => inspectPortableCarrier(rawCarrier(changed, bytes)), undefined, name);
  for (const mutate of [
    manifest => { manifest.assets.reverse(); }, manifest => { manifest.assets[0] = manifest.assets[1]; },
    manifest => { manifest.assets.pop(); }, manifest => { manifest.assets[0].extra = true; },
    manifest => { manifest.assets[0].byteLength = Number.MAX_SAFE_INTEGER; },
    manifest => { manifest.world.revision = '0'.repeat(64); },
    manifest => { manifest.world.entities[0].parentId = manifest.world.entities[0].id; },
    manifest => { manifest.world.entities[0].transform.scale[0] = 0; },
  ]) {
    const changed = structuredClone(original); mutate(changed);
    assert.throws(() => inspectPortableCarrier(rawCarrier(canonical(changed), payload)));
  }
  const broken = Buffer.from(value.exportedBytes); broken[broken.length - 1] ^= 1;
  assert.throws(() => inspectPortableCarrier(broken), /digest/);
  assert.throws(() => inspectPortableCarrier(Buffer.alloc(4 * 1024 * 1024 + 1)), /length/);
});

test('independent world checks reject authored substitutions after revision, body digest, observations and envelope are all rebound', async () => {
  for (const [name, mutate, pattern] of [
    ['missing unreferenced SVG', (world, originals) => { world.assets = world.assets.filter(asset => asset.id !== 'readability-image'); originals.delete('readability-image'); }, /Frozen asset/],
    ['source-coordinate alteration', world => { world.assets.find(asset => asset.id === 'coordinate-model').sourceCoordinates = {
      unitsPerMeter: 100, handedness: 'right', up: '+Y', authoredForward: '-Z', sourceToWorld: [0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 1]
    }; }, /Frozen asset/],
    ['changed unused original with rebound revision', (world, originals) => {
      const asset = originals.get('readability-image'); asset.bytes = Buffer.concat([asset.bytes, Buffer.from('<!-- synthetic change -->')]);
      world.assets.find(reference => reference.id === 'readability-image').revision = digest(asset.bytes);
    }, /Frozen asset/],
    ['unrelated imported bytes with rebound identity', (world, originals, observation) => {
      const reference = world.assets.at(-1), asset = originals.get(reference.id), oldId = reference.id;
      asset.bytes[asset.bytes.length - 1] ^= 1; reference.revision = digest(asset.bytes); reference.id = 'dropped-' + reference.revision;
      originals.delete(oldId); originals.set(reference.id, asset);
      const body = world.entities.at(-2), child = world.entities.at(-1);
      body.id = 'prop-1-' + reference.revision.slice(0, 6); child.id = body.id + '-model'; child.parentId = body.id; child.components[0].data.asset = reference.id;
      Object.assign(observation.imported, { entityId: body.id, meshEntityId: child.id, assetId: reference.id, revision: reference.revision });
    }, /body identity|deterministic checked-source/],
    ['wrong collider', world => { world.entities.at(-2).components[0].data.halfExtents[0] += 1; }, /collider/],
    ['wrong normalization', world => { world.entities.at(-1).transform.translation[0] += 1; }, /normalized mesh/],
    ['lost parent', world => { delete world.entities.at(-1).parentId; }, /normalized mesh/],
    ['wrong author edit', world => { world.entities.find(entity => entity.id === 'prop-0').transform.translation[0] = 9; }, /authored prop edit/],
    ['changed animation source', world => { world.entities.find(entity => entity.id === 'bird').components.find(component => component.type === 'bve:animation').data.clip = 'wrong'; }, /Original entity content/],
  ]) {
    const value = await portableFixture();
    replaceCarrier(value, 'exported', mutate);
    value.reexportedBytes = Buffer.from(value.exportedBytes);
    value.report.observed.reexported = { ...structuredClone(value.report.observed.exported), file: 'reexported-world.bveworld' };
    const changedWorld = JSON.parse(splitCarrier(value.exportedBytes).text).world;
    replaceCarrier(value, 'authored', world => { Object.assign(world, structuredClone(changedWorld)); world.entities.push(...expectedPortableAffineEntities()); });
    assert.match((await validate(value)).join('\n'), pattern, name);
  }
  const variant = await portableFixture();
  replaceCarrier(variant, 'authored', world => { world.entities.at(-2).transform.elements[0] = 1.2; });
  assert.match((await validate(variant)).join('\n'), /affine variant/);
  const liveState = await portableFixture();
  replaceCarrier(liveState, 'reexported', world => { world.entities.find(entity => entity.id === 'prop-0').transform.translation[1] = 0.5; });
  assert.match((await validate(liveState)).join('\n'), /Re-export changed authored content/);
});

test('portable raw files must match their exact seven-file bindings', async () => {
  for (const field of ['reportBytes', 'summaryBytes', 'buildBytes', 'screenshotBytes', 'exportedBytes', 'reexportedBytes', 'authoredBytes']) {
    const value = bindPortableFixture(await portableFixture()); value[field] = Buffer.from('synthetic mutation');
    assert.match((await validatePortableBrowserEvidence(value.report, value.summary, value)).join('\n'), /not bound/);
  }
});
test('portable collector refuses historical runs, ambiguous fresh runs and escaping directories', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bve-portable-collector-'));
  try {
    const runs = join(directory, 'evaluations/babylon-vrspace/artifacts/portable-runs');
    await mkdir(join(runs, 'run-Old'), { recursive: true });
    const before = await evaluationRunDirectories(directory, 'portable');
    await assert.rejects(collectPortableEvidence({ files: [] }, directory, directory, before, {}), /exactly one new/);
    await mkdir(join(runs, 'run-New1')); await mkdir(join(runs, 'run-New2'));
    await assert.rejects(collectPortableEvidence({ files: [] }, directory, directory, before, {}), /exactly one new/);
    await symlink(join(runs, 'run-Old'), join(runs, 'run-Link'));
    await assert.rejects(evaluationRunDirectories(directory, 'portable'), /real directory/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('portable carrier artifact size is rejected before allocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bve-portable-size-'));
  try {
    await mkdir(join(directory, 'portable'));
    const name = 'portable/exported-world.bveworld'; await writeFile(join(directory, name), '');
    await truncate(join(directory, name), 4 * 1024 * 1024 + 1);
    assert.match((await validateEvaluationFiles({ files: [{ path: name, bytes: 4 * 1024 * 1024 + 1, sha256: '0'.repeat(64) }] }, directory)).join('\n'), /oversized/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('portable collector checks current source, workspace and all four build outputs in a synthetic filesystem', async () => {
  const value = bindPortableFixture(await portableFixture()), directory = await mkdtemp(join(tmpdir(), 'bve-portable-bound-'));
  try {
    const candidate = 'evaluations/babylon-vrspace', output = join(directory, 'collected');
    const copy = async name => { const target = join(directory, name); await mkdir(dirname(target), { recursive: true }); await writeFile(target, await readFile(join(fixtureRoot, name))); };
    for (const name of [...requiredF05SourceFiles, 'vendor/vrspace/provenance.json']) await copy(candidate + '/' + name);
    for (const name of requiredF05WorkspaceInputs) await copy(name);
    await cp(join(fixtureRoot, 'packages/qualification-fixtures/fixtures'), join(directory, 'packages/qualification-fixtures/fixtures'), { recursive: true });
    const run = join(directory, candidate, value.record.portable.runDirectory);
    await mkdir(run, { recursive: true }); await mkdir(join(output, 'portable'), { recursive: true });
    await mkdir(join(directory, candidate, 'dist'));
    for (const name of requiredF05BuildOutputs) await writeFile(join(directory, candidate, name), 'Synthetic verifier output, never executed: ' + name + '\n');
    await writeFile(join(directory, candidate, 'dist/build.json'), value.buildBytes);
    for (const [name, bytes] of [
      ['portable-browser-checks.json', value.reportBytes], ['portable-summary.json', value.summaryBytes], ['build.json', value.buildBytes], ['portable-world.png', value.screenshotBytes],
      ['exported-world.bveworld', value.exportedBytes], ['reexported-world.bveworld', value.reexportedBytes], ['authored-world.bveworld', value.authoredBytes]
    ]) await writeFile(join(run, name), bytes);
    const record = { files: [] };
    await collectPortableEvidence(record, directory, output, new Set(), value.portableCommand);
    assert.equal(record.files.length, 7);
    await writeFile(join(directory, 'packages/contracts/src/canonical.ts'), 'Changed synthetic source\n');
    await assert.rejects(collectPortableEvidence({ files: [] }, directory, output, new Set(), value.portableCommand), /Changed workspace build input/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
