// Synthetic verifier data, never a retained execution receipt. The event writer
// below is intentionally separate from the downloaded-data replay implementation.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { digest } from '../ci/evidence.mjs';
import { evaluationCommands } from '../ci/evaluation-evidence.mjs';
import { requiredF05LifecycleChecks } from '../ci/evaluate.mjs';
import { fixtureRoot, pretty, json, makeCarrier, rebindF05Inputs } from './evaluation-fixtures.mjs';

const clone = value => structuredClone(value);
const zeros = keys => Object.fromEntries(keys.map(key => [key, 0]));

// Plain synthetic projection, not the production readiness reducer. Tests set
// the trace totals and milestone positions explicitly from their chosen facts.
export function syntheticMediaObservation(activity, before = null) {
  const wall = activity.audio.sources.find(source => source.id === 'wall-playback');
  const prior = before?.audio.sources.find(source => source.id === 'wall-playback');
  const baseline = before ? Math.max(before.audio.time * before.audio.sampleRate, prior.endFrame ?? 0) : Infinity;
  return clone({ at: activity.at, steps: activity.physicsSteps, animation: activity.animations[0], audioState: activity.audio.state,
    clock: activity.audio.time, sampleRate: activity.audio.sampleRate, video: activity.video, invalidMessages: wall.invalidMessages,
    latestWallWindow: wall.windows.at(-1) ?? null,
    positiveWallWindow: wall.windows.find(window => window.startFrame >= baseline && window.endFrame > baseline
      && window.sampleRate === activity.audio.sampleRate && window.invalidFrames === 0 && window.droppedWindows === 0
      && window.inputRms > 0.01) ?? null });
}

export async function lifecycleFixture(root = fixtureRoot) {
  const directory = resolve(root, 'packages/qualification-fixtures/fixtures');
  const world = await json(resolve(directory, 'world.json')), catalog = await json(resolve(directory, 'catalog.json'));
  const thresholds = await json(resolve(directory, 'thresholds.json'));
  const originals = new Map(await Promise.all(catalog.resources.map(async resource => [resource.id,
    { bytes: await readFile(resolve(directory, resource.path)), mediaType: resource.mediaType }])));
  const profileBytes = await readFile(resolve(root, 'evaluations/babylon-vrspace/test/lifecycle-profile.json'));
  const profile = JSON.parse(profileBytes), profileSha256 = digest(profileBytes), carrier = makeCarrier(clone(world), originals);
  const input = { worldId: carrier.manifest.world.id, worldRevision: carrier.manifest.world.revision, bytes: carrier.bytes.length,
    sha256: digest(carrier.bytes), assetReceipts: carrier.assetReceipts };
  const identities = { documentToken: 'synthetic-document', contextId: 'synthetic-context', targetId: 'synthetic-target' };
  const events = { schemaVersion: 1, profileSha256, ...identities,
    native: { events: [], overflow: 0, faults: [] }, cdp: { events: [], overflow: 0 }, fixtureAttempts: [] };
  const nativeLive = Object.fromEntries(profile.nativeCounters.map(key => [key, new Map()]));
  let nextId = 0, at = Date.parse('2026-10-18T00:01:00.000Z'), created = 0, closed = 0, destroyed = 0;
  const open = new Set(), cycles = [];
  const native = (cycle, phase, category, action, id, contextId) => {
    const entry = { sequence: events.native.events.length + 1, cycle, phase, category, action, id: id ?? category + ':' + ++nextId };
    if (contextId !== undefined) entry.contextId = contextId;
    if (action === 'allocate') nativeLive[category].set(entry.id, contextId); else nativeLive[category].delete(entry.id);
    events.native.events.push(entry); return entry.id;
  };
  const cdp = (cycle, phase, event, data) => {
    events.cdp.events.push({ sequence: events.cdp.events.length + 1, cycle, phase, event, data });
    if (event === 'contextCreated') { created++; open.add(data.context.contextId); }
    if (event === 'contextChanged' && data.context.contextState === 'closed') { closed++; open.delete(data.context.contextId); }
    if (event === 'contextWillBeDestroyed') { destroyed++; open.delete(data.contextId); }
  };
  const memory = { policy: 'diagnostic-only', jsHeap: { status: 'available', usedBytes: 10000, totalBytes: 20000 },
    domCounters: { status: 'available', documents: 1, nodes: 80, jsEventListeners: 1 },
    userAgentSpecific: { status: 'not-measured', reason: 'Synthetic unavailable process-memory measurement' },
    gpu: { status: 'unavailable', reason: 'No portable physical GPU byte counter' } };
  const listeners = Object.fromEntries(profile.listenerTargets.map(target => [target, { available: true,
    counts: target === 'world-file' ? { 'change|false|false|false': 1 } : {} }]));
  const emptyRuntime = createdInstances => ({ instanceId: null, state: 'empty', counters: zeros(profile.runtimeCounters),
    scene: zeros(profile.sceneCounters), host: { phase: 'empty', createdInstances, pendingHostTask: false, failedOwner: false,
      publishedInstance: false, publishedAdapter: false, foundationReady: false }, activity: null });
  const snapshot = (cycle, phase, runtime = emptyRuntime(cycle)) => ({ ...identities,
    at: new Date(at += 100).toISOString(), cycle, phase, runtime: clone(runtime),
    native: { sequence: events.native.events.length, counters: Object.fromEntries(profile.nativeCounters.map(key => [key, nativeLive[key].size])),
      overflow: 0, faults: [], live: Object.fromEntries(profile.nativeCounters.map(key => [key, [...nativeLive[key].keys()].sort()])) },
    listeners: clone(listeners), dom: { videoElements: runtime.counters.videoElements },
    cdp: { sequence: events.cdp.events.length, audioContexts: [...open].sort(), createdContexts: created, closedContexts: closed, destroyedContexts: destroyed },
    memory: clone(memory) });
  const baseline = snapshot(0, 'baseline');
  const before = snapshot(0, 'negative-before'), extra = native(0, 'negative-allocated', 'objectUrls', 'allocate');
  const allocated = snapshot(0, 'negative-allocated'); native(0, 'negative-released', 'objectUrls', 'release', extra);
  const negativeControl = { before, allocated, released: snapshot(0, 'negative-released'), id: extra, comparisonRejected: true };
  const animation = world.entities.flatMap(entity => entity.components.filter(component => component.type === 'bve:animation')
    .map(component => ({ entityId: entity.id, clip: component.data.clip })))[0];
  for (let index = 1; index <= 10; index++) {
    const contextId = 'native-audio-' + index, audio = native(index, 'loading', 'audioContexts', 'allocate');
    for (let source = 0; source < 6; source++) native(index, 'loading', 'workletPorts', 'allocate', undefined, audio);
    for (let url = 0; url < 14; url++) native(index, 'loading', 'objectUrls', 'allocate');
    for (const category of profile.nativeCounters.filter(key => key.startsWith('gl'))) native(index, 'loading', category, 'allocate');
    const timeout = native(index, 'loading', 'timeouts', 'allocate');
    native(index, 'loading', 'intervals', 'allocate'); const frame = native(index, 'loading', 'animationFrames', 'allocate');
    cdp(index, 'loading', 'contextCreated', { context: { contextId, contextType: 'realtime', contextState: 'suspended' } });
    for (const [nodeType, count] of Object.entries({ AudioBufferSource: 5, MediaElementAudioSource: 1, Panner: 6, AudioWorklet: 6 }))
      for (let item = 0; item < count; item++) cdp(index, 'loading', 'audioNodeCreated', { node: { contextId, nodeId: `${contextId}-${nodeType}-${item}`, nodeType } });
    const counters = { ...zeros(profile.runtimeCounters), ...profile.loadedExpectations,
      originalBytes: input.assetReceipts.reduce((sum, asset) => sum + asset.byteLength, 0), assetContainers: 13,
      assetCacheEntries: 11, objectUrls: 14 };
    const scene = zeros(profile.sceneCounters);
    for (const key of ['animationGroups', 'meshes', 'transformNodes', 'skeletons', 'materials', 'textures', 'geometries', 'cameras', 'lights']) scene[key] = 1;
    const activity = { at: index * 1000, physicsSteps: 10, sceneFrame: 10, animations: [{ ...animation, playing: true, frame: 1, position: [0, 3, 0] }],
      audio: { state: 'suspended', time: 0, sampleRate: 48000, activation: null,
        sources: profile.sourceIds.map(id => ({ id, inputRms: 0, endFrame: null, invalidMessages: 0, windows: [] })) },
      video: { time: 0, duration: 2, loop: true, paused: true, seeking: false, readyState: 4, decodedFrames: 1 } };
    const runtime = { instanceId: index, state: 'ready', counters, scene,
      host: { phase: 'ready', createdInstances: index, pendingHostTask: false, failedOwner: false, publishedInstance: true, publishedAdapter: true, foundationReady: true }, activity };
    const cycle = { index, instanceId: index, loaded: snapshot(index, 'loaded', runtime), activation: { before: snapshot(index, 'activation-before', runtime) } };
    native(index, 'activating', 'timeouts', 'fire', timeout); native(index, 'activating', 'animationFrames', 'fire', frame);
    native(index, 'activating', 'animationFrames', 'allocate');
    cdp(index, 'activating', 'contextChanged', { context: { contextId, contextType: 'realtime', contextState: 'running' } });
    runtime.state = 'running'; runtime.counters.meterWindows = 6;
    activity.at += 500; activity.physicsSteps = 30; activity.sceneFrame = 30; activity.animations[0].frame = 2; activity.animations[0].position = [0.1, 3, 0.1];
    activity.audio = { state: 'running', time: 0.5, sampleRate: 48000,
      activation: { isActive: true, hasBeenActive: true, at: index * 1000, before: 'suspended', after: 'running' },
      sources: profile.sourceIds.map(id => ({ id, inputRms: 0.1, endFrame: 896, invalidMessages: 0,
        windows: [{ startFrame: 0, endFrame: 896, sampleRate: 48000, invalidFrames: 0, droppedWindows: 0, inputRms: 0.1 }] })) };
    activity.video = { time: 0.5, duration: 2, loop: true, paused: false, seeking: false, readyState: 4, decodedFrames: 15 };
    cycle.activation.after = snapshot(index, 'activation-after', runtime);
    const mediaBefore = syntheticMediaObservation(cycle.activation.before.runtime.activity);
    const mediaAfter = syntheticMediaObservation(activity, cycle.activation.before.runtime.activity);
    cycle.activation.mediaProgress = { before: mediaBefore, last: clone(mediaAfter), samples: [mediaAfter],
      videoElapsed: 0.5, wraps: 0, videoDuration: 2,
      milestones: { audio: 0, physics: 0, animation: 0, video: 0, wallAudio: 0 }, ready: true };
    for (const category of profile.nativeCounters.filter(key => key !== 'audioContexts')) for (const [id, owner] of [...nativeLive[category]]) {
      const action = category === 'workletPorts' ? 'close' : ['timeouts', 'intervals', 'animationFrames'].includes(category) ? 'clear' : 'release';
      native(index, 'unloading', category, action, id, owner);
    }
    native(index, 'unloading', 'audioContexts', 'close', audio);
    cdp(index, 'unloading', 'contextChanged', { context: { contextId, contextType: 'realtime', contextState: 'closed' } });
    cycle.unloadReceipt = { instanceId: index, state: 'disposed', counters: zeros(profile.runtimeCounters), scene: zeros(profile.sceneCounters), activity: null };
    cycle.unloaded = snapshot(index, 'unloaded');
    cycle.postInput = { before: snapshot(index, 'post-input-before'), after: snapshot(index, 'post-input-after'), actions: [...profile.postInputActions] };
    cycles.push(cycle);
  }
  const final = snapshot(10, 'final');
  const historical = await json(resolve(root, 'evaluations/babylon-vrspace/evidence/audio-measurement-fix/browser-checks.json'));
  const report = { scope: 'Synthetic lifecycle verifier fixture; no browser execution', method: 'real-browser', physicalHeadset: false, physicalAudio: false,
    qualificationStatus: 'incomplete', startedAt: '2026-10-18T00:01:00.000Z', timestamp: '2026-10-18T00:02:00.000Z',
    candidate: { babylon: '9.30.0', rapier: '0.21.0', typebox: '0.34.52' }, environment: historical.environment,
    fixtureDigests: historical.fixtureDigests, comparison: historical.comparison, build: historical.build,
    profile, profileSha256, ...identities, input, baseline, cycles, final, negativeControl, fixtureAttempts: 0,
    memory: { policy: 'diagnostic-only', byteOrPercentAcceptanceTolerance: null, physicalDeviceQualified: false, qualificationStatus: 'incomplete' },
    checks: requiredF05LifecycleChecks.map(id => ({ id, status: 'passed', method: 'real-browser' })),
    logs: [], failedRequests: [], finalizationErrors: [], missingEvidence: ['Synthetic verifier input does not establish browser or physical-device qualification.'],
    counts: { passed: 6, failed: 0, pageErrors: 0, failedRequests: 0, logOverflow: 0 }, runStatus: 'passed' };
  await rebindF05Inputs(report, root);
  const summary = { qualificationStatus: 'incomplete', evidenceFile: 'lifecycle-browser-checks.json', checks: clone(report.checks), counts: { ...report.counts }, runStatus: 'passed' };
  const runDirectory = 'artifacts/lifecycle-runs/run-Synthetic', record = { files: [], lifecycle: { runDirectory, startedAt: report.startedAt, finishedAt: report.timestamp } };
  const lifecycleCommand = { ...clone(evaluationCommands.find(command => command.id === 'f05-lifecycle-browser')),
    outcome: 'passed', exitCode: 0, errorCode: null, signal: null, durationMs: 62000,
    startedAt: '2026-10-18T00:00:59.000Z', finishedAt: '2026-10-18T00:02:01.000Z',
    log: JSON.stringify({ runStatus: 'passed', ...report.counts, output: runDirectory }) };
  return { root, report, summary, record, lifecycleCommand, events, profile, world, catalog, thresholds, originals };
}

export function lifecycleSnapshots(report) {
  return [report.baseline, report.negativeControl.before, report.negativeControl.allocated, report.negativeControl.released,
    ...report.cycles.flatMap(cycle => [cycle.loaded, cycle.activation.before, cycle.activation.after, cycle.unloaded, cycle.postInput.before, cycle.postInput.after]), report.final];
}

export function bindLifecycleFixture(value) {
  const eventsBytes = pretty(value.events); value.report.eventsSha256 = digest(eventsBytes);
  const reportBytes = pretty(value.report), summaryBytes = pretty(value.summary), buildBytes = pretty(value.report.build);
  for (const [field, name, bytes] of [['reportSha256', 'lifecycle-browser-checks.json', reportBytes], ['summarySha256', 'lifecycle-summary.json', summaryBytes],
    ['buildSha256', 'build.json', buildBytes], ['eventsSha256', 'lifecycle-resource-events.json', eventsBytes]]) {
    const path = 'lifecycle/' + name; value.record.lifecycle[field] = digest(bytes);
    value.record.files = value.record.files.filter(item => item.path !== path); value.record.files.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  }
  return { ...value, reportBytes, summaryBytes, buildBytes, eventsBytes };
}
