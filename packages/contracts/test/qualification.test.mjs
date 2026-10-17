import test from 'node:test';
import assert from 'node:assert/strict';
import { assessQualification, createTraceAdapter, digestJson, runScenario } from '../dist/index.js';
import { assets, scenario, world } from './helpers.mjs';

const context = (methods = ['real-browser']) => ({ world: world(), scenario: scenario(methods), assets });

test('logical replay is reproducible and releases its resources', async () => {
  const input = context(['simulation']);
  const one = createTraceAdapter(), two = createTraceAdapter();
  const first = await runScenario(one, input), second = await runScenario(two, input);
  assert.deepEqual(first, second);
  assert.deepEqual(one.trace, ['load:test-world', '12:edit-1:edit', 'dispose']);
  assert.equal(one.disposed(), true);
  assert.deepEqual(await assessQualification(input, first), { status: 'passed', findings: [] });
});

test('a simulated success cannot satisfy a browser or physical headset requirement', async () => {
  for (const method of ['real-browser', 'physical-headset']) {
    const input = context([method]);
    const result = await runScenario(createTraceAdapter(), input);
    const assessment = await assessQualification(input, result);
    assert.equal(assessment.status, 'incomplete');
    assert.deepEqual(assessment.findings, ['METHOD_NOT_ALLOWED:position:simulation']);
  }
});

test('missing observations stay not-run and failed or unsupported evidence is explicit', async () => {
  const input = context(['simulation']), adapter = createTraceAdapter();
  adapter.perform = async () => [];
  const result = await runScenario(adapter, input);
  assert.equal(result.observations[0].status, 'not-run');
  assert.equal((await assessQualification(input, result)).status, 'incomplete');
  result.observations[0].status = 'failed';
  assert.equal((await assessQualification(input, result)).status, 'failed');
  result.observations[0].status = 'unsupported';
  assert.equal((await assessQualification(input, result)).status, 'incomplete');
  result.observations = [];
  assert.deepEqual((await assessQualification(input, result)).findings, ['MISSING_ASSERTION:position']);
});

test('assessment rejects stale input hashes, unknown assertions and duplicate records', async () => {
  const input = context(['simulation']);
  const result = await runScenario(createTraceAdapter(), input);
  result.worldDigest = 'f'.repeat(64);
  assert.ok((await assessQualification(input, result)).findings.includes('STALE_INPUTS'));
  result.observations.push({ ...result.observations[0], assertionId: 'unexpected' });
  assert.ok((await assessQualification(input, result)).findings.includes('UNEXPECTED_ASSERTION:unexpected'));
  result.observations.push(result.observations[0]);
  await assert.rejects(assessQualification(input, result), /DUPLICATE_ID/);
});

test('a real harness supplies scheduling while unscheduled replay makes no timing claim', async () => {
  const input = context(['simulation']), calls = [];
  input.scenario.assertions.push({ ...input.scenario.assertions[0], id: 'second' });
  input.scenario.steps.push({ id: 'select-2', action: 'select', tick: 42, targetId: 'object', assertions: ['second'] });
  await runScenario(createTraceAdapter(), input, { async waitForTick(tick, tickRate) { calls.push([tick, tickRate]); } });
  assert.deepEqual(calls, [[12, 60], [42, 60]]);
});

test('runs use frozen input snapshots and bind results to the original input content', async () => {
  const input = context(['simulation']), expected = await digestJson(input.world), adapter = createTraceAdapter();
  adapter.load = async (loaded, runContext) => {
    assert.equal(runContext.world, loaded);
    assert.ok(Object.isFrozen(loaded.entities[0].transform.translation));
    assert.ok(Object.isFrozen(runContext.scenario.steps[0]));
    assert.throws(() => { loaded.entities[0].name = 'mutated'; }, TypeError);
    input.world.entities[0].name = 'changed by caller during await';
    assert.equal(loaded.entities[0].name, 'object');
  };
  const result = await runScenario(adapter, input);
  assert.equal(result.worldDigest, expected);
});

test('load/action/observation failures still dispose the adapter exactly once', async () => {
  for (const stage of ['load', 'perform', 'unexpected', 'duplicate']) {
    const adapter = createTraceAdapter(); let disposals = 0;
    adapter.dispose = async () => { disposals++; };
    if (stage === 'load' || stage === 'perform') adapter[stage] = async () => { throw new Error('candidate failure'); };
    else adapter.perform = async () => stage === 'unexpected'
      ? [{ assertionId: 'unknown', status: 'passed', method: 'simulation', detail: 'test' }]
      : new Array(2).fill({ assertionId: 'position', status: 'passed', method: 'simulation', detail: 'test' });
    await assert.rejects(runScenario(adapter, context()));
    assert.equal(disposals, 1, stage);
  }
});

test('aborting after load prevents actions and disposes partial resources', async () => {
  const controller = new AbortController(), adapter = createTraceAdapter();
  let actions = 0, disposals = 0;
  adapter.load = async () => { controller.abort(); };
  adapter.perform = async () => { actions++; return []; };
  adapter.dispose = async () => { disposals++; };
  await assert.rejects(runScenario(adapter, { ...context(), signal: controller.signal }), { name: 'AbortError' });
  assert.equal(actions, 0); assert.equal(disposals, 1);
});

test('invalid inputs and pre-aborted runs also release the supplied adapter', async () => {
  for (const reason of ['schema', 'abort']) {
    const input = context(), adapter = createTraceAdapter(), controller = new AbortController();
    let loads = 0, disposals = 0;
    adapter.load = async () => { loads++; }; adapter.dispose = async () => { disposals++; };
    if (reason === 'schema') input.world.schemaVersion = 'unsupported';
    else { controller.abort(); input.signal = controller.signal; }
    await assert.rejects(runScenario(adapter, input));
    assert.equal(loads, 0); assert.equal(disposals, 1);
  }
});
