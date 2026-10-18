import assert from 'node:assert/strict';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

export const snapshotSources = ['README.md', 'REUSE_ASSESSMENT.md', 'SECURITY_REVIEW.md', 'package.json', 'scripts/verify-evidence.mjs'];
const sha256 = data => createHash('sha256').update(data).digest('hex');
async function readContained(root, name) {
  assert.ok(typeof name === 'string' && /^[A-Za-z0-9._/-]+$/.test(name) && !isAbsolute(name)
    && name.split('/').every(part => part && part !== '.' && part !== '..'), 'Unsafe historical path');
  const path = join(root, name), resolved = await realpath(path), rel = relative(await realpath(root), resolved);
  assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) && !(await lstat(path)).isSymbolicLink(), 'Historical path escapes bundle');
  return readFile(resolved);
}

export async function verifyHistoricalArtifacts(root, manifestBytes, mapBytes) {
  const manifest = JSON.parse(manifestBytes), mapping = JSON.parse(mapBytes);
  assert.equal(mapping.schemaVersion, 1);
  assert.equal(mapping.captureIndexSha256, sha256(manifestBytes), 'Original capture index changed');
  assert.deepEqual(Object.keys(mapping.files).sort(), [...snapshotSources].sort(), 'Only the declared toolkit source paths may use original-source snapshots');
  assert.ok(Array.isArray(manifest.files) && new Set(manifest.files.map(file => file.path)).size === manifest.files.length, 'Duplicate historical artifact path');
  const entries = new Map(manifest.files.map(file => [file.path, file]));
  for (const name of snapshotSources) {
    const item = mapping.files[name], original = entries.get(name);
    assert.ok(original, 'Snapshot source is absent from original capture index');
    assert.equal(item.snapshot, `evidence/2026-10-18-runtime-extension/original-toolkit-sources/${name}`);
    assert.equal(item.sha256, original.sha256);
    assert.equal(item.sizeBytes, original.sizeBytes);
  }
  const changed = [];
  for (const file of manifest.files) {
    const source = mapping.files[file.path];
    const bytes = await readContained(root, source?.snapshot ?? file.path);
    assert.equal(bytes.length, file.sizeBytes, `${file.path} historical size`);
    assert.equal(sha256(bytes), file.sha256, `${file.path} historical digest`);
    if (source) {
      const current = await readContained(root, file.path);
      if (current.length !== file.sizeBytes || sha256(current) !== file.sha256) changed.push(file.path);
    }
  }
  return { historicalIntegrity: 'verified', currentSourcesMatchCapture: changed.length === 0,
    currentSourceDifferences: changed, files: manifest.files.length };
}
