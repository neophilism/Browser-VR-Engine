import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { packageRoot } from './config.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export const buildInputPaths = ['src/main.js', 'src/spatial-audio.js', 'src/audio-meter.js', 'src/import-policy.js', 'src/import-resources.js', 'index.html', 'package.json', 'package-lock.json', 'fixture-pins.json', 'vendor/vrspace/asset-loader.js', 'build.mjs'];
export async function fingerprintFiles(paths) {
  return Object.fromEntries(await Promise.all(paths.map(async path => {
    const bytes = await readFile(resolve(packageRoot, path));
    return [path, { bytes: bytes.length, sha256: sha256(bytes) }];
  })));
}

export async function loadFixtureSet(directory) {
  const root = await realpath(directory);
  const pins = JSON.parse(await readFile(resolve(packageRoot, 'fixture-pins.json'), 'utf8'));
  const documents = {}, sourceFileDigests = {}, resources = new Map();
  async function containedFile(name) {
    if (name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..') || name.startsWith('/')) throw new Error('Unsafe fixture path');
    const file = await realpath(resolve(root, name));
    if (!file.startsWith(root + sep)) throw new Error('Fixture symlink escapes its package');
    return readFile(file);
  }
  for (const [name, pin] of Object.entries(pins.files)) {
    const bytes = await containedFile(name);
    if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) throw new Error(`Frozen F03 metadata mismatch: ${name}`);
    const key = name.slice(0, -5);
    documents[key] = JSON.parse(bytes);
    sourceFileDigests[key] = pin.sha256;
  }
  if (documents.comparison.fixtureSetId !== pins.fixtureSetId) throw new Error('F03 comparison identity mismatch');
  for (const resource of documents.catalog.resources) {
    if (resources.has(resource.path)) throw new Error('Duplicate fixture resource path');
    const bytes = await containedFile(resource.path);
    if (bytes.length !== resource.sizeBytes || sha256(bytes) !== resource.sha256) throw new Error(`Frozen F03 resource mismatch: ${resource.path}`);
    resources.set(resource.path, { bytes, mediaType: resource.mediaType });
  }
  const manifest = {
    world: documents.world, scenario: documents.scenario, catalog: documents.catalog,
    thresholds: documents.thresholds, workloads: documents.workloads, devices: documents.devices,
    schemaSet: documents['schema-set'], comparison: documents.comparison,
    source: pins.repositoryPath, sourceFileDigests,
  };
  return { manifest, resources };
}

export async function verifyVendor() {
  const expected = '1afa505b193dac8f60ee54ea7ccdfd60e9a0620cf561fa393aa570055d23fa06';
  const file = resolve(packageRoot, 'vendor/vrspace/asset-loader.js');
  const bytes = await readFile(file);
  if (sha256(bytes) !== expected) throw new Error('Pinned VRSpace AssetLoader differs from its recorded upstream bytes');
  return bytes;
}

