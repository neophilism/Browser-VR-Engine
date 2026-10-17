import { CONTRACT_VERSION, ObservationSchema, type AssertionObservation, type QualificationResult } from './schemas.js';
import type { QualificationAdapter, QualificationContext } from './ports.js';
import { requireDocument } from './validation.js';
import { digestJson } from './canonical.js';
import { Value } from '@sinclair/typebox/value';

export interface ScenarioRunOptions {
  /** Real-browser harnesses supply their scheduler. Omission dispatches logical ticks only. */
  waitForTick?: (tick: number, tickRate: number, signal?: AbortSignal) => Promise<void>;
}
function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}
/** Replays the same logical actions through any candidate; always releases adapter resources. */
export async function runScenario(adapter: QualificationAdapter, context: QualificationContext, options: ScenarioRunOptions = {}): Promise<QualificationResult> {
  try {
    const world = freezeJson(structuredClone(requireDocument('world', context.world)));
    const scenario = freezeJson(structuredClone(requireDocument('scenario', context.scenario, { world })));
    const runContext = Object.freeze({ ...context, world, scenario });
    const descriptor = { ...adapter.descriptor };
    const worldDigest = await digestJson(world), scenarioDigest = await digestJson(scenario);
    const observations: AssertionObservation[] = [];
    context.signal?.throwIfAborted();
    await adapter.load(world, runContext);
    for (const step of scenario.steps) {
      context.signal?.throwIfAborted();
      if (options.waitForTick) await options.waitForTick(step.tick, scenario.tickRate, context.signal);
      context.signal?.throwIfAborted();
      const returned = await adapter.perform(step, runContext);
      context.signal?.throwIfAborted();
      if (!Array.isArray(returned) || returned.length > step.assertions.length) throw new TypeError('Adapter returned an invalid observation count');
      const byId = new Map<string, AssertionObservation>();
      for (const observation of returned) {
        if (!Value.Check(ObservationSchema, observation) || !step.assertions.includes(observation.assertionId) || byId.has(observation.assertionId)) throw new TypeError('Adapter returned an invalid, unexpected or duplicate assertion');
        byId.set(observation.assertionId, observation);
      }
      for (const assertionId of step.assertions) observations.push(byId.get(assertionId) ?? { assertionId, status: 'not-run', method: 'simulation', detail: 'Adapter did not supply an observation for this required assertion.' });
    }
    return requireDocument('result', {
      kind: 'qualification-result', schemaVersion: CONTRACT_VERSION,
      scenarioId: scenario.id, candidateId: descriptor.id, candidateVersion: descriptor.version,
      scenarioDigest, worldDigest, observations
    });
  } finally { await adapter.dispose(); }
}

export async function assessQualification(context: Pick<QualificationContext, 'world' | 'scenario'>, value: unknown): Promise<{ status: 'passed' | 'failed' | 'incomplete'; findings: string[] }> {
  const world = requireDocument('world', context.world), scenario = requireDocument('scenario', context.scenario, { world }), result = requireDocument('result', value);
  const findings: string[] = [];
  if (result.worldDigest !== await digestJson(world) || result.scenarioDigest !== await digestJson(scenario) || result.scenarioId !== scenario.id) findings.push('STALE_INPUTS');
  const expected = new Map(scenario.assertions.map(assertion => [assertion.id, assertion]));
  const observed = new Map(result.observations.map(observation => [observation.assertionId, observation]));
  for (const id of observed.keys()) if (!expected.has(id)) findings.push(`UNEXPECTED_ASSERTION:${id}`);
  let failed = false;
  for (const assertion of scenario.assertions) {
    const observation = observed.get(assertion.id);
    if (!observation) { findings.push(`MISSING_ASSERTION:${assertion.id}`); continue; }
    if (observation.status === 'failed') { failed = true; findings.push(`FAILED:${assertion.id}`); }
    else if (observation.status !== 'passed') findings.push(`INCOMPLETE:${assertion.id}:${observation.status}`);
    if (!assertion.allowedMethods.includes(observation.method)) findings.push(`METHOD_NOT_ALLOWED:${assertion.id}:${observation.method}`);
  }
  return { status: failed ? 'failed' : findings.length ? 'incomplete' : 'passed', findings };
}

/** Only a logical tracing adapter: it never establishes renderer/service/hardware evidence. */
export function createTraceAdapter(): QualificationAdapter & { readonly trace: string[]; readonly disposed: () => boolean } {
  const trace: string[] = []; let disposed = false;
  return {
    descriptor: { id: 'logical-trace', version: CONTRACT_VERSION }, trace, disposed: () => disposed,
    async probe() { return [{ feature: 'bve:logical-trace', status: 'available', method: 'simulation', detail: 'Logical action replay only.' }]; },
    async load(world) { trace.push(`load:${world.id}`); disposed = false; },
    async perform(step) {
      trace.push(`${step.tick}:${step.id}:${step.action}`);
      return step.assertions.map(assertionId => ({ assertionId, status: 'passed', method: 'simulation', detail: 'Logical replay only; no runtime or hardware feature was evaluated.' }));
    },
    async dispose() { trace.push('dispose'); disposed = true; }
  };
}
