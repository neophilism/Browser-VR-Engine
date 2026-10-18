import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { bundleRoot } from './config.mjs';
import { canonicalJson, readJson, sha256 } from './lib.mjs';
import { fixturePins } from './fixtures.mjs';
import { glbSummary } from './browser-support.mjs';
const manifest = await readJson(join(bundleRoot, 'evidence/index.json'));
assert.equal(manifest.F04, 'blocked');
for (const file of manifest.files) {
  const path = await realpath(join(bundleRoot, file.path));
  const rel = relative(await realpath(bundleRoot), path);
  assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`), 'Evidence path must stay within the bundle.');
  const bytes = await readFile(path);
  assert.equal(bytes.length, file.sizeBytes, `${file.path} size`);
  assert.equal(sha256(bytes), file.sha256, `${file.path} digest`);
}
const original = await readJson(join(bundleRoot, 'evidence/2026-10-17-initial/spoke-interactions.json'));
const originalGlb = glbSummary(await readFile(join(bundleRoot, 'evidence/2026-10-17-initial/spoke-courtyard-export.glb')));
assert.equal(originalGlb.sha256, original.observations.glbExport.sha256);
assert.equal(originalGlb.bytes, 45500);
const audit = await readJson(join(bundleRoot, 'evidence/2026-10-17-initial/hubs-dependency-audit.json'));
assert.equal(audit.processError, 'ETIMEDOUT');
for (const capture of manifest.captures) {
  if (capture.kind !== 'portable-spoke-editor') continue;
  const result = await readJson(join(bundleRoot, capture.result));
  assert.equal(result.F04, 'blocked'); assert.equal(result.status, 'passed-editor-subset');
  assert.equal(canonicalJson(result.fixturePins), canonicalJson(fixturePins));
  const glb = glbSummary(await readFile(join(bundleRoot, capture.glb)));
  assert.equal(glb.sha256, result.observations.glbExport.sha256);
}
console.log(JSON.stringify({ status: 'captured-artifact-integrity-verified', files: manifest.files.length, F04: 'blocked',
  meaning: 'Checks retained bytes and recorded limits only; does not rerun browsers, services, performance routes, or headsets.' }));
