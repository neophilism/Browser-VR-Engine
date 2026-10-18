import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { snapshotSources, verifyHistoricalArtifacts } from './historical-integrity.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'f04-historical-test-'));
  const files = [], mapping = { schemaVersion: 1, files: {} };
  for (const path of [...snapshotSources, 'evidence/capture.json']) {
    const bytes = Buffer.from(`synthetic original ${path}\n`), sha256 = createHash('sha256').update(bytes).digest('hex');
    files.push({ path, sizeBytes: bytes.length, sha256 });
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytes);
    if (snapshotSources.includes(path)) {
      const snapshot = `evidence/2026-10-18-runtime-extension/original-toolkit-sources/${path}`;
      await mkdir(dirname(join(root, snapshot)), { recursive: true });
      await writeFile(join(root, snapshot), bytes);
      mapping.files[path] = { snapshot, sizeBytes: bytes.length, sha256 };
    }
  }
  const manifest = Buffer.from(JSON.stringify({ files }));
  mapping.captureIndexSha256 = createHash('sha256').update(manifest).digest('hex');
  return { root, manifest, mapping, verify: () => verifyHistoricalArtifacts(root, manifest, Buffer.from(JSON.stringify(mapping))),
    close: () => rm(root, { recursive: true, force: true }) };
}

test('changed current toolkit source does not become fresh execution evidence', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.verify()).currentSourcesMatchCapture, true);
    await writeFile(join(f.root, 'README.md'), 'synthetic current source\n');
    const result = await f.verify();
    assert.equal(result.historicalIntegrity, 'verified');
    assert.equal(result.currentSourcesMatchCapture, false);
    assert.deepEqual(result.currentSourceDifferences, ['README.md']);
  } finally { await f.close(); }
});
test('changed original source snapshot fails historical integrity', async () => {
  const f = await fixture();
  try { await writeFile(join(f.root, f.mapping.files['package.json'].snapshot), 'corrupt'); await assert.rejects(f.verify); }
  finally { await f.close(); }
});
test('actual captured artifacts cannot be redirected through source snapshots', async () => {
  const f = await fixture();
  try { f.mapping.files['evidence/capture.json'] = f.mapping.files['package.json']; await assert.rejects(f.verify); }
  finally { await f.close(); }
});
test('a changed capture and an escaped snapshot both fail', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'evidence/capture.json'), 'corrupt');
    await assert.rejects(f.verify);
    f.mapping.files['README.md'].snapshot = '../elsewhere';
    await assert.rejects(f.verify);
  } finally { await f.close(); }
});
