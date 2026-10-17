import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessQualification, createTraceAdapter, parseDocument, runScenario, sha256 } from '@browser-vr-engine/contracts';
import { createFixtureAssetPort } from '@browser-vr-engine/qualification-fixtures';

// This consumer only uses public package exports. It works outside the workspace too.
const fixtureUrl = path => import.meta.resolve(`@browser-vr-engine/qualification-fixtures/fixtures/${path}`);
async function document(kind, path, options) {
  const result = parseDocument(kind, await readFile(new URL(fixtureUrl(path)), 'utf8'), options);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.value;
}
const world = await document('world', 'world.json');
const scenario = await document('scenario', 'scenario.json', { world });
const catalog = await document('catalog', 'catalog.json');
const files = new Map(await Promise.all(catalog.resources.map(async resource => [resource.path, new Uint8Array(await readFile(new URL(fixtureUrl(resource.path))))])));
const assets = createFixtureAssetPort(catalog, files);
const architecture = await assets.resolve(world.assets.find(asset => asset.id === 'architecture'));
assert.equal(await sha256(architecture.bytes), architecture.reference.revision);
const adapter = createTraceAdapter();
const result = await runScenario(adapter, { world, scenario, assets });
const assessment = await assessQualification({ world, scenario }, result);
assert.equal(result.observations.length, scenario.assertions.length);
assert.equal(adapter.disposed(), true);
assert.equal(assessment.status, 'incomplete');
assert.ok(assessment.findings.every(finding => finding.startsWith('METHOD_NOT_ALLOWED:')));
console.log(JSON.stringify({
  world: world.id, units: world.coordinates.units, entities: world.entities.length,
  resourceIntegrity: 'verified', logicalActions: result.observations.length,
  qualificationStatus: assessment.status,
  evidence: 'Logical replay and content integrity only. Browser, service, audio-device and headset capabilities remain unmeasured.'
}, null, 2));
