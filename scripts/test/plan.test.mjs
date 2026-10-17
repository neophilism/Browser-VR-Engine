import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePlan, validateReferences } from '../check-plan.mjs';

const planSource = JSON.parse(await readFile(new URL('../../docs/plan/pr-plan.json', import.meta.url), 'utf8'));
const progressSource = JSON.parse(await readFile(new URL('../../docs/progress.json', import.meta.url), 'utf8'));
function fixture() {
  const plan = structuredClone(planSource);
  const progress = structuredClone(progressSource);
  for (const unit of progress.units) Object.assign(unit, { status: 'planned', verification: [], securityReview: null, pullRequest: null, mergedCommit: null, deployment: null, qualification: null, blockers: [] });
  return { plan, progress };
}
const card = (plan, id) => plan.cards.find(item => item.id === id);
const unit = (progress, id) => progress.units.find(item => item.id === id);
function accept(progress, id) {
  Object.assign(unit(progress, id), { status: 'accepted', verification: [`docs/evidence/${id}.md`], securityReview: `docs/security/${id}.md`, pullRequest: 'https://github.com/neophilism/Browser-VR-Engine/pull/1', mergedCommit: 'a'.repeat(40) });
}

test('the actual current plan and ledger pass structural validation', () => assert.deepEqual(validatePlan(planSource, progressSource), []));

for (const [name, mutate, expected] of [
  ['duplicate card', ({ plan }) => plan.cards.push(structuredClone(plan.cards[0])), /duplicate card/],
  ['malformed card', ({ plan }) => plan.cards.push(null), /Invalid.*card/],
  ['unknown dependency', ({ plan }) => card(plan, 'F02').depends.push('Z99'), /unknown dependency/],
  ['dependency cycle', ({ plan }) => card(plan, 'F01').depends.push('F02'), /cycle/],
  ['non-array dependencies', ({ plan }) => { card(plan, 'F02').depends = {}; }, /invalid dependencies/],
  ['application import in dependency graph', ({ plan }) => card(plan, 'F02').depends.push('C01'), /depends on application/],
  ['removed engine-first gate', ({ plan }) => { card(plan, 'C01').depends = ['F03']; }, /wait for complete engine/],
  ['missing progress', ({ progress }) => progress.units.pop(), /Missing progress/],
  ['duplicate progress', ({ progress }) => progress.units.push(structuredClone(progress.units[0])), /duplicate progress/],
  ['malformed progress', ({ progress }) => progress.units.push(null), /Invalid.*progress/],
  ['empty acceptance', ({ plan }) => { card(plan, 'F02').acceptance = ''; }, /lacks acceptance/],
  ['blocked without reason', ({ progress }) => { unit(progress, 'F02').status = 'blocked'; }, /blocked without reason/],
  ['unproved verification', ({ progress }) => Object.assign(unit(progress, 'F02'), { status: 'verified', verification: ['passed'], securityReview: {} }), /lacks verification/],
  ['accepted before dependency', ({ progress }) => accept(progress, 'F02'), /accepted before F01/],
  ['wrong PR repository', ({ progress }) => { accept(progress, 'F01'); unit(progress, 'F01').pullRequest = 'https://github.com/neophilism/XLR8/pull/1'; }, /immutable merge/],
  ['deployment inferred from acceptance', ({ progress }) => { accept(progress, 'F01'); unit(progress, 'F01').deployment = { status: 'deployed' }; }, /separate deployment/],
  ['qualification without device evidence', ({ progress }) => { unit(progress, 'F01').qualification = { status: 'qualified' }; }, /separate qualification/]
]) {
  test(`plan mutation rejects ${name}`, () => {
    const value = fixture();
    mutate(value);
    assert.match(validatePlan(value.plan, value.progress).join('\n'), expected);
  });
}

test('historical accepted evidence survives a new implementing card without claiming deployment', () => {
  const { plan, progress } = fixture();
  accept(progress, 'F01');
  unit(progress, 'F02').status = 'implemented';
  assert.deepEqual(validatePlan(plan, progress), []);
  assert.equal(unit(progress, 'F01').deployment, null);
});

test('new plan namespaces can be added without a fixed total-card assertion', () => {
  const { plan, progress } = fixture();
  const namespace = [...'GHIJKLMNOPQRSTUVWXYZABCDEF'].find(prefix => !plan.cards.some(item => item.id.startsWith(prefix)));
  assert.ok(namespace, 'Choose a new namespace fixture after all available prefixes are allocated');
  const id = `${namespace}01`;
  plan.cards.push({ ...structuredClone(card(plan, 'F02')), id, depends: ['F02'] });
  progress.units.push({ ...structuredClone(unit(progress, 'F02')), id });
  assert.deepEqual(validatePlan(plan, progress), []);
});

test('missing evidence files cannot satisfy a structural reference', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'engine-reference-'));
  try {
    const { progress } = fixture();
    accept(progress, 'F01');
    assert.match((await validateReferences(progress, directory)).join('\n'), /missing or unsafe evidence/);
    const independent = { units: [{ status: 'implemented', deployment: { status: 'deployed', evidence: ['docs/evidence/missing-deployment.md'] }, qualification: { status: 'qualified', evidence: ['docs/evidence/missing-device.md'] } }] };
    assert.equal((await validateReferences(independent, directory)).length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
