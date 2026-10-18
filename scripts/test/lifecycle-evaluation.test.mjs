import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateLifecycleBrowserEvidence, collectLifecycleEvidence, evaluationRunDirectories, requiredF05LifecycleChecks } from '../ci/evaluate.mjs';
import { validateLifecycleObservations } from '../ci/lifecycle-resource-evidence.mjs';
import { validateEvaluationFiles, evaluationCommands } from '../ci/evaluation-evidence.mjs';
import { lifecycleFixture, bindLifecycleFixture, lifecycleSnapshots, syntheticMediaObservation } from './lifecycle-fixtures.mjs';

const validate = async value => validateLifecycleBrowserEvidence(value.report, value.summary, bindLifecycleFixture(value));
const point = value => value.report.cycles[0].activation.after;
const event = (value, category, action) => value.events.native.events.find(item => item.category === category && item.action === action && item.cycle === 1);
const trace = value => value.report.cycles[0].activation.mediaProgress;
const activity = value => point(value).runtime.activity;
function rebindMediaEndpoints(value) {
  const { before, after, mediaProgress } = value.report.cycles[0].activation;
  mediaProgress.before = syntheticMediaObservation(before.runtime.activity);
  mediaProgress.last = syntheticMediaObservation(after.runtime.activity, before.runtime.activity);
  mediaProgress.samples[mediaProgress.samples.length - 1] = structuredClone(mediaProgress.last);
}
function earlyMediaSample(value) {
  const progress = trace(value), early = structuredClone(progress.before);
  early.at += 100; early.audioState = 'running'; early.clock = 0.1;
  early.video.time = 0.05; early.video.paused = false; early.video.decodedFrames = 2;
  progress.samples.unshift(early);
  progress.milestones = { audio: 1, physics: 1, animation: 1, video: 1, wallAudio: 1 };
  return early;
}

test('lifecycle is a distinct mandatory14th command after portable with six unchanged outcome IDs', () => {
  assert.equal(evaluationCommands.length, 14);
  const index = evaluationCommands.findIndex(command => command.id === 'f05-lifecycle-browser');
  assert.equal(evaluationCommands[index - 1].id, 'f05-portable-browser');
  assert.deepEqual(evaluationCommands[index].argv, ['node', 'run.mjs', 'test-lifecycle']);
  assert.equal(evaluationCommands[index].cwd, 'evaluations/babylon-vrspace');
  assert.equal(requiredF05LifecycleChecks.length, 6);
});

test('independent lifecycle replay accepts a synthetic ten-cycle trace with native closes and no GC destruction', async () => {
  const value = await lifecycleFixture();
  assert.deepEqual(await validate(value), []);
  assert.equal(value.report.final.cdp.closedContexts, 10);
  assert.equal(value.report.final.cdp.destroyedContexts, 0, 'GC destruction is not the close gate');
});

test('diagnostic unavailable and increasing memory are not converted into zero or an invented budget', async () => {
  const value = await lifecycleFixture();
  for (const [index, snapshot] of lifecycleSnapshots(value.report).entries()) {
    snapshot.memory.jsHeap = index % 2 ? { status: 'available', usedBytes: index * 100000000, totalBytes: index * 100000000 + 50000 }
      : { status: 'unavailable', reason: 'Synthetic browser does not expose this diagnostic sample' };
    snapshot.memory.domCounters = { status: 'unavailable', reason: 'Synthetic DOM diagnostic is unavailable' };
  }
  assert.deepEqual(await validate(value), []);
});

test('late CDP wrapper destruction is replayed without requiring a garbage collection deadline', async () => {
  const value = await lifecycleFixture();
  for (let cycle = 1; cycle <= 10; cycle++) value.events.cdp.events.push({ sequence: value.events.cdp.events.length + 1,
    cycle: 10, phase: 'final', event: 'contextWillBeDestroyed', data: { contextId: 'native-audio-' + cycle } });
  assert.deepEqual(await validate(value), []);
});

test('CDP nodes destroyed before activation cannot satisfy the live graph using cumulative creation counts', async () => {
  for (const nodeType of ['AudioBufferSource', 'MediaElementAudioSource', 'Panner', 'AudioWorklet']) {
    const value = await lifecycleFixture(), cycle = value.report.cycles[0], sequence = cycle.activation.before.cdp.sequence;
    const node = value.events.cdp.events.find(entry => entry.cycle === 1 && entry.event === 'audioNodeCreated' && entry.data.node.nodeType === nodeType).data.node;
    value.events.cdp.events.splice(sequence, 0, { cycle: 1, phase: 'activating', event: 'audioNodeWillBeDestroyed', data: { contextId: node.contextId, nodeId: node.nodeId } });
    value.events.cdp.events.forEach((entry, index) => { entry.sequence = index + 1; });
    for (const snapshot of lifecycleSnapshots(value.report)) if (snapshot.cdp.sequence > sequence) snapshot.cdp.sequence++;
    assert.match((await validate(value)).join('\n'), /CDP graph lacks.*at activation/, nodeType);
  }
});

test('milestones can occur in distinct native samples while final animation phase and latest audio return to their initial values', async () => {
  const value = await lifecycleFixture(), cycle = value.report.cycles[0], progress = trace(value), final = activity(value);
  const first = structuredClone(progress.before);
  first.at += 50; first.steps++; first.audioState = 'running'; first.clock = 0.05;
  first.video.time = 0.05; first.video.paused = false; first.video.decodedFrames = 2;
  first.latestWallWindow = structuredClone(progress.last.latestWallWindow);
  first.positiveWallWindow = structuredClone(first.latestWallWindow);
  const second = structuredClone(progress.last);
  second.at = progress.before.at + 250; second.clock = 0.25; second.video.time = 0.25; second.video.decodedFrames = 8;
  final.animations[0] = structuredClone(cycle.activation.before.runtime.activity.animations[0]);
  for (const source of final.audio.sources) {
    source.windows.push({ startFrame: 896, endFrame: 1792, sampleRate: 48000, invalidFrames: 0, droppedWindows: 0, inputRms: 0 });
    source.inputRms = 0; source.endFrame = 1792;
  }
  rebindMediaEndpoints(value);
  progress.samples = [first, second, structuredClone(progress.last)];
  progress.milestones = { physics: 0, wallAudio: 0, audio: 1, animation: 1, video: 1 };
  assert.deepEqual(await validate(value), []);
});

test('adjacent observations prove playback across a loop wrap without a final-clock-difference assumption', async () => {
  const value = await lifecycleFixture(), cycle = value.report.cycles[0];
  cycle.activation.before.runtime.activity.video.time = 1.9;
  activity(value).video.time = 0.3;
  rebindMediaEndpoints(value);
  trace(value).videoElapsed = 2 + (0.3 - 1.9); trace(value).wraps = 1;
  assert.deepEqual(await validate(value), []);
});

test('an initial metadata-ready trace may have an early sample before any readiness milestone', async () => {
  const value = await lifecycleFixture(); earlyMediaSample(value);
  assert.deepEqual(await validate(value), []);
});

for (const [name, change, pattern] of [
  ['missing native media trace', value => { delete value.report.cycles[0].activation.mediaProgress; }, /cycle index\/instance\/schema/],
  ['empty observation trace', value => { trace(value).samples = []; }, /missing or unbounded/],
  ['257 media observations', value => { trace(value).samples = Array.from({ length: 257 }, () => structuredClone(trace(value).last)); }, /missing or unbounded/],
  ['129 retained source windows', value => { const source = activity(value).audio.sources[0]; source.windows = Array.from({ length: 129 }, () => structuredClone(source.windows[0])); }, /paired audio activity/],
  ['before observation unbound from native snapshot', value => { trace(value).before.at++; }, /not bound/],
  ['last observation unbound from native snapshot', value => { trace(value).last.clock++; }, /not bound/],
  ['last sample omitted', value => { trace(value).samples[0].video.time = 0.4; }, /not bound/],
  ['coherently rebound activation longer than the frozen20s interval', value => {
    activity(value).at = value.report.cycles[0].activation.before.runtime.activity.at + 20001;
    rebindMediaEndpoints(value);
  }, /frozen observation deadline/],
  ['intermediate observation outside the activation deadline', value => { earlyMediaSample(value).at += 20001; }, /frozen activation deadline/],
  ['regressed sample clock', value => { earlyMediaSample(value).clock = 0.75; }, /regressed/],
  ['regressed decoded frame count', value => { earlyMediaSample(value).video.decodedFrames = 16; }, /regressed/],
  ['changed video identity', value => { earlyMediaSample(value).video.duration = 3; }, /regressed/],
  ['changed audio sample rate', value => { earlyMediaSample(value).sampleRate = 44100; }, /invalid native media/],
  ['missing native metadata readiness', value => { value.report.cycles[0].activation.before.runtime.activity.video.readyState = 1; rebindMediaEndpoints(value); }, /metadata readiness/],
  ['invented first milestone positions', value => { trace(value).milestones.audio = 1; }, /milestones/],
  ['invented video elapsed duration', value => { trace(value).videoElapsed = 1; }, /wrap\/progress totals/],
  ['invented video wrap count', value => { trace(value).wraps = 1; }, /wrap\/progress totals/],
  ['invented video duration binding', value => { trace(value).videoDuration = 3; }, /wrap\/progress totals/],
  ['seek jumps counted as elapsed playback', value => { earlyMediaSample(value).video.seeking = true; }, /wrap\/progress totals/],
  ['passing counters conceal incomplete media reducer', value => { trace(value).ready = false; }, /milestones/],
  ['positive audio without any native window', value => { earlyMediaSample(value).positiveWallWindow = structuredClone(trace(value).last.positiveWallWindow); }, /stale, invalid or silent/],
  ['silent window relabeled as positive', value => { const sample = earlyMediaSample(value); sample.latestWallWindow = structuredClone(trace(value).last.latestWallWindow); sample.positiveWallWindow = { ...sample.latestWallWindow, inputRms: 0 }; }, /stale, invalid or silent/],
  ['dropped window relabeled as positive', value => { const sample = earlyMediaSample(value); sample.latestWallWindow = structuredClone(trace(value).last.latestWallWindow); sample.positiveWallWindow = { ...sample.latestWallWindow, droppedWindows: 1 }; }, /stale, invalid or silent/],
  ['wrong audio render-window length', value => { const source = activity(value).audio.sources[0]; source.windows[0].endFrame++; source.endFrame++; }, /native paired audio window/],
  ['reordered audio history', value => { const source = activity(value).audio.sources[0]; source.windows.push(structuredClone(source.windows[0])); }, /reordered or overlaps/],
  ['latest RMS detached from retained native window', value => { activity(value).audio.sources[0].inputRms = 0.2; }, /latest paired audio/],
  ['coherently rebound future windows for all six sources', value => {
    for (const source of activity(value).audio.sources) {
      source.windows[0].startFrame = 1000000; source.windows[0].endFrame = 1000896; source.endFrame = 1000896;
    }
    rebindMediaEndpoints(value);
  }, /past the sampled audio clock/],
  ['future raw wall window used as an intermediate milestone', value => {
    const sample = earlyMediaSample(value);
    sample.latestWallWindow = { startFrame: 1000000, endFrame: 1000896, sampleRate: 48000, invalidFrames: 0, droppedWindows: 0, inputRms: 0.1 };
    sample.positiveWallWindow = structuredClone(sample.latestWallWindow);
    trace(value).milestones.wallAudio = 0;
  }, /past the sampled audio clock/],
  ['all positive audio predates activation', value => {
    const before = value.report.cycles[0].activation.before.runtime.activity;
    before.audio.time = 1; activity(value).audio.time = 1.5; rebindMediaEndpoints(value);
  }, /fresh measured samples/],
  ['all source windows contain invalid frames', value => {
    for (const source of activity(value).audio.sources) source.windows[0].invalidFrames = 1;
    rebindMediaEndpoints(value);
  }, /fresh measured samples/],
  ['all source windows were dropped', value => {
    for (const source of activity(value).audio.sources) source.windows[0].droppedWindows = 1;
    rebindMediaEndpoints(value);
  }, /fresh measured samples/],
]) test(`lifecycle independently rejects ${name} after all envelope hashes are rebound`, async () => {
  const value = await lifecycleFixture(); change(value);
  assert.match((await validate(value)).join('\n'), pattern);
});

for (const [name, change, pattern] of [
  ['nine cycles despite six passing checks', value => { value.report.cycles.pop(); }, /exactly ten activated cycles/],
  ['duplicate cycle identity', value => { value.report.cycles[3].index = 3; }, /cycle index/],
  ['same instance reused', value => { value.report.cycles[1].instanceId = 1; }, /cycle index/],
  ['new browser context halfway through', value => { value.report.cycles[4].loaded.contextId = 'another-context'; }, /identity/],
  ['page reload token', value => { value.report.cycles[4].unloaded.documentToken = 'another-document'; }, /identity/],
  ['different raw event target', value => { value.events.targetId = 'another-target'; }, /identity/],
  ['snapshot outside actual run', value => { value.report.final.at = '2026-10-18T00:03:00.000Z'; }, /timestamp/],
  ['snapshot order reversal', value => { value.report.cycles[0].unloaded.at = value.report.baseline.at; }, /execution order/],
  ['undeclared snapshot phase', value => { value.report.final.phase = 'loaded'; }, /phase\/cycle/],
  ['fallback fixture request', value => { value.report.fixtureAttempts = 1; }, /fallback fixtures/],
  ['raw fallback request hidden by report count', value => { value.events.fixtureAttempts.push({ path: '/fixtures/world.json' }); }, /fallback fixtures/],
  ['changed input carrier hash', value => { value.report.input.sha256 = '0'.repeat(64); }, /reconstructed frozen-world/],
  ['omitted unused original SVG', value => { value.report.input.assetReceipts.pop(); }, /reconstructed frozen-world/],
  ['changed authored world input revision', value => { value.report.input.worldRevision = '0'.repeat(64); }, /reconstructed frozen-world/],
  ['missing strict counter key', value => { delete point(value).runtime.counters.originalBytes; }, /runtime counter/],
  ['negative runtime counter', value => { point(value).runtime.counters.meshes = -1; }, /runtime counter/],
  ['nonfinite runtime counter', value => { point(value).runtime.counters.originalBytes = Infinity; }, /non-finite/],
  ['empty synthetic scene called loaded', value => { point(value).runtime.scene.meshes = 0; }, /loaded scene/],
  ['missing solid bodies', value => { point(value).runtime.counters.rigidBodies = 0; }, /rigidBodies/],
  ['missing decoded originals', value => { point(value).runtime.counters.originalBytes = 0; }, /original\/model/],
  ['lost import ownership', value => { point(value).runtime.host.pendingHostTask = true; }, /active owner/],
  ['stale published adapter after unload', value => { value.report.cycles[0].unloaded.runtime.host.publishedAdapter = true; }, /host retains/],
  ['failed retained instance after unload', value => { value.report.cycles[0].unloaded.runtime.host.failedOwner = true; }, /host retains/],
  ['final remains ready', value => { value.report.final.runtime.host.foundationReady = true; }, /host retains/],
  ['live original bytes after unload', value => { value.report.cycles[0].unloaded.runtime.counters.originalBytes = 1; }, /empty baseline/],
  ['live meshes hidden by empty host', value => { value.report.cycles[0].unloaded.runtime.scene.meshes = 1; }, /empty baseline/],
  ['dispose receipt belongs to another instance', value => { value.report.cycles[0].unloadReceipt.instanceId = 2; }, /instance disposed/],
  ['cleanup failed receipt relabeled by counts', value => { value.report.cycles[0].unloadReceipt.state = 'cleanup-failed'; }, /instance disposed/],
  ['disposed receipt still owns port', value => { value.report.cycles[0].unloadReceipt.counters.workletPorts = 1; }, /retains live resources/],
  ['physics never advanced', value => { point(value).runtime.activity.physicsSteps = value.report.cycles[0].activation.before.runtime.activity.physicsSteps; }, /physics or scene/],
  ['render frames never advanced', value => { point(value).runtime.activity.sceneFrame = value.report.cycles[0].activation.before.runtime.activity.sceneFrame; }, /physics or scene/],
  ['route moved but animation frame frozen', value => { activity(value).animations[0].frame = 1; rebindMediaEndpoints(value); delete trace(value).milestones.animation; }, /readiness milestones/],
  ['animation frame changed but route frozen', value => { activity(value).animations[0].position = [0, 3, 0]; rebindMediaEndpoints(value); delete trace(value).milestones.animation; }, /readiness milestones/],
  ['different animation used as evidence', value => { point(value).runtime.activity.animations[0].entityId = 'synthetic-cube'; }, /frozen animation/],
  ['audio clock frozen', value => {
    activity(value).audio.time = 0;
    for (const source of activity(value).audio.sources) { source.windows = []; source.endFrame = null; source.inputRms = 0; }
  }, /audio did not actually advance/],
  ['no actual user gesture', value => { point(value).runtime.activity.audio.activation.isActive = false; }, /user-click/],
  ['missing audio source', value => { point(value).runtime.activity.audio.sources.pop(); }, /six exact source/],
  ['silent source hidden by counters', value => { const source = activity(value).audio.sources[0]; source.inputRms = source.windows[0].inputRms = 0; }, /measured samples/],
  ['invalid worklet message', value => { point(value).runtime.activity.audio.sources[0].invalidMessages = 1; }, /paired audio/],
  ['absent measured worklet frame', value => { const source = activity(value).audio.sources[0]; source.endFrame = null; source.inputRms = 0; source.windows = []; }, /measured samples/],
  ['video paused', value => { point(value).runtime.activity.video.paused = true; }, /video clock/],
  ['video clock frozen', value => { activity(value).video.time = 0; rebindMediaEndpoints(value); trace(value).videoElapsed = 0; delete trace(value).milestones.video; }, /readiness milestones/],
  ['no decoded video progress', value => { point(value).runtime.activity.video.decodedFrames = 1; }, /video clock/],
  ['decoded frames unavailable', value => { point(value).runtime.activity.video.decodedFrames = null; }, /decoded video progress/],
  ['missing post-unload mouse action', value => { value.report.cycles[0].postInput.actions.pop(); }, /input actions/],
  ['post-unload input created another instance', value => { value.report.cycles[0].postInput.after.runtime.host.createdInstances++; }, /host retains/],
  ['new lingering DOM video', value => { value.report.cycles[0].unloaded.dom.videoElements = 1; }, /native resources remain/],
  ['missing listener target', value => { delete value.report.final.listeners.document; }, /listener census/],
  ['lingering keydown listener', value => { value.report.final.listeners.window.counts['keydown|false|false|false'] = 1; }, /listener census changed/],
  ['passive listener change', value => { value.report.final.listeners['world-file'].counts = { 'change|false|true|false': 1 }; }, /listener census changed/],
  ['lost permanent world-file host listener', value => { value.report.baseline.listeners['world-file'].counts = {}; }, /one world-file/],
  ['native observer fault', value => { value.events.native.faults.push('Synthetic unsupported timer'); }, /observer failed/],
  ['native event overflow', value => { value.events.native.overflow = 1; }, /observer failed/],
  ['snapshot observer overflow', value => { point(value).native.overflow = 1; }, /native observer/],
  ['CDP overflow', value => { value.events.cdp.overflow = 1; }, /CDP observer/],
  ['native event sequence gap', value => { event(value, 'objectUrls', 'allocate').sequence++; }, /reordered native/],
  ['native close reclassified as an unproven release', value => { event(value, 'audioContexts', 'close').action = 'release'; }, /no matching live/],
  ['worklet port bound to another native context', value => { event(value, 'workletPorts', 'allocate').contextId = 'audioContexts:missing'; }, /no live observed audio/],
  ['interval callback treated as release', value => { event(value, 'intervals', 'clear').action = 'fire'; }, /no matching live/],
  ['GL deletion removed from actual event trace', value => { event(value, 'glTextures', 'release').action = 'clear'; }, /no matching live/],
  ['raw allocation not represented by snapshot IDs', value => { event(value, 'objectUrls', 'allocate').id = 'objectUrls:unknown'; }, /event prefix/],
  ['native count hides live-ID entry', value => { point(value).native.counters.objectUrls = 0; }, /live-ID counts/],
  ['renderer allocation observation omitted', value => { point(value).native.counters.glBuffers = 0; point(value).native.live.glBuffers = []; }, /native renderer/],
  ['native prefix made stale', value => { point(value).native.sequence = 0; }, /execution order/],
  ['CDP prefix made stale', value => { point(value).cdp.sequence = 0; }, /execution order/],
  ['CDP close state hidden', value => { value.events.cdp.events.find(item => item.event === 'contextChanged' && item.data.context.contextState === 'closed').data.context.contextState = 'running'; }, /CDP snapshot differs/],
  ['invented garbage collection count', value => { value.report.final.cdp.destroyedContexts = 10; }, /CDP snapshot differs/],
  ['invented closed-context count', value => { value.report.final.cdp.closedContexts = 0; }, /CDP snapshot differs/],
  ['missing CDP source creation', value => { value.events.cdp.events.find(item => item.event === 'audioNodeCreated').data.node.nodeType = 'Gain'; }, /CDP graph/],
  ['duplicate CDP node ID', value => { const entries = value.events.cdp.events.filter(item => item.event === 'audioNodeCreated'); entries[1].data.node.nodeId = entries[0].data.node.nodeId; }, /unique live context/],
  ['CDP audio ownership outside current context', value => { value.events.cdp.events.find(item => item.event === 'audioNodeCreated').data.node.contextId = 'missing-context'; }, /unique live context/],
  ['negative control boolean without allocation', value => { value.report.negativeControl.allocated.native.counters.objectUrls = 0; value.report.negativeControl.allocated.native.live.objectUrls = []; }, /one real extra native/],
  ['negative control never released', value => { value.report.negativeControl.released = structuredClone(value.report.negativeControl.allocated); value.report.negativeControl.released.phase = 'negative-released'; }, /native resources remain/],
  ['missing diagnostic availability', value => { value.report.final.memory.jsHeap = { usedBytes: 0, totalBytes: 0 }; }, /unavailable heap/],
  ['unavailable heap disguised as zero', value => { value.report.final.memory.jsHeap = { status: 'unavailable', usedBytes: 0, totalBytes: 0 }; }, /unavailable heap/],
  ['unreviewed memory tolerance', value => { value.report.memory.byteOrPercentAcceptanceTolerance = 0.05; }, /memory evidence invents/],
  ['physical GPU measurement claim', value => { value.report.final.memory.gpu = { status: 'available', usedBytes: 0 }; }, /unsupported allocation/],
  ['different checked profile hash', value => { value.report.profileSha256 = '0'.repeat(64); }, /profile differs|different observation profile/],
  ['different raw event profile', value => { value.events.profileSha256 = '0'.repeat(64); }, /different observation profile/],
  ['missing profile source hash', value => { delete value.report.sourceDigests['test/lifecycle-profile.json']; }, /source.*coverage/],
  ['changed observer source hash', value => { value.report.sourceDigests['test/lifecycle-observer.mjs'].sha256 = '0'.repeat(64); }, /Changed source/],
  ['missing lifecycle check', value => { value.report.checks.pop(); }, /6 lifecycle checks/],
  ['failed check hidden by passed counts', value => { value.report.checks[0].status = 'failed'; }, /6 lifecycle checks/],
  ['wrong run command', value => { value.lifecycleCommand.argv = ['node', 'run.mjs', 'test-world']; }, /command did not complete/],
  ['failed command despite passing browser', value => { value.lifecycleCommand.exitCode = 1; }, /command did not complete/],
  ['child error despite zero exit', value => { value.lifecycleCommand.errorCode = 'EPERM'; }, /command did not complete/],
  ['child signal despite zero exit', value => { value.lifecycleCommand.signal = 'SIGTERM'; }, /command did not complete/],
  ['different stdout run', value => { value.lifecycleCommand.log = value.lifecycleCommand.log.replace('run-Synthetic', 'run-Other'); }, /command output/],
  ['two passing stdout receipts', value => { value.lifecycleCommand.log += '\n' + value.lifecycleCommand.log; }, /command output/],
  ['historical evidence directory', value => { value.record.lifecycle.runDirectory = 'evidence/lifecycle'; }, /fresh lifecycle run/],
  ['run outside actual command', value => { value.lifecycleCommand.startedAt = '2026-10-18T00:03:00.000Z'; }, /command time bounds/],
  ['full qualification claim', value => { value.report.qualificationStatus = 'passed'; }, /incomplete software/],
  ['late browser error', value => { value.report.logs.push({ type: 'pageerror', text: 'Synthetic late error' }); }, /page errors/],
  ['late failed request', value => { value.report.failedRequests.push({ url: 'https://synthetic.invalid/' }); }, /failed requests/],
  ['late browser cleanup failure', value => { value.report.finalizationErrors.push({ stage: 'close-browser', message: 'Synthetic late error' }); }, /finalization/],
  ...['', false, 0, {}, [], 'late fatal'].map(fatal => ['non-null fatal ' + JSON.stringify(fatal), value => { value.report.fatalError = fatal; }, /fatal/]),
]) test(`lifecycle verifier rejects ${name} with all file hashes recomputed`, async () => {
  const value = await lifecycleFixture(); change(value);
  assert.match((await validate(value)).join('\n'), pattern);
});

test('a native allocation after final snapshot cannot be hidden by a later matching release', async () => {
  const value = await lifecycleFixture(), entries = value.events.native.events;
  for (const action of ['allocate', 'release']) entries.push({ sequence: entries.length + 1, cycle: 10, phase: 'final', category: 'glTextures', action, id: 'glTextures:999999' });
  assert.match((await validate(value)).join('\n'), /native allocation after final/);
});

test('transient native work caused by unloaded input is rejected even after both live snapshots are empty', async () => {
  const value = await lifecycleFixture(), cycle = value.report.cycles[0], sequence = cycle.postInput.before.native.sequence;
  value.events.native.events.splice(sequence, 0, ...['allocate', 'clear'].map(action => ({ cycle: 1, phase: 'post-input-before', category: 'timeouts', action, id: 'timeouts:999999' })));
  value.events.native.events.forEach((item, index) => { item.sequence = index + 1; });
  for (const snapshot of lifecycleSnapshots(value.report)) if (snapshot.native.sequence > sequence
    || snapshot === cycle.postInput.after) snapshot.native.sequence += 2;
  assert.match((await validate(value)).join('\n'), /unloaded input reactivated/);
});

test('native/CDP live traces cannot be replaced by empty boolean-only summaries', async () => {
  for (const stream of ['native', 'cdp']) {
    const value = await lifecycleFixture(); value.events[stream].events = [];
    assert.match((await validate(value)).join('\n'), /sequence exceeds|event prefix|event replay/);
  }
});

test('every collected lifecycle file remains bound to its actual bytes and inventory', async () => {
  for (const field of ['reportBytes', 'summaryBytes', 'buildBytes', 'eventsBytes']) {
    const value = bindLifecycleFixture(await lifecycleFixture()); value[field] = Buffer.from('Synthetic changed bytes');
    assert.match((await validateLifecycleBrowserEvidence(value.report, value.summary, value)).join('\n'), /not bound/);
  }
});

test('lifecycle collector requires exactly one new real run directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bve-lifecycle-directory-'));
  try {
    const runs = join(root, 'evaluations/babylon-vrspace/artifacts/lifecycle-runs');
    await mkdir(join(runs, 'run-Old'), { recursive: true }); const before = await evaluationRunDirectories(root, 'lifecycle');
    await assert.rejects(collectLifecycleEvidence({ files: [] }, root, root, before, {}), /exactly one new/);
    await mkdir(join(runs, 'run-New1')); await mkdir(join(runs, 'run-New2'));
    await assert.rejects(collectLifecycleEvidence({ files: [] }, root, root, before, {}), /exactly one new/);
    await symlink(join(runs, 'run-Old'), join(runs, 'run-Link'));
    await assert.rejects(evaluationRunDirectories(root, 'lifecycle'), /real directory/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('downloaded lifecycle event size is rejected before reading an oversized file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bve-lifecycle-size-'));
  try {
    await mkdir(join(root, 'lifecycle')); const path = 'lifecycle/lifecycle-resource-events.json';
    await writeFile(join(root, path), ''); await truncate(join(root, path), 16 * 1024 * 1024 + 1);
    const record = { files: [{ path, bytes: 16 * 1024 * 1024 + 1, sha256: '0'.repeat(64) }] };
    assert.match((await validateEvaluationFiles(record, root)).join('\n'), /oversized/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('semantic inspector bounds hostile nesting and reports invalid checked originals', async () => {
  const value = await lifecycleFixture();
  let nested = {}; value.events.unexpected = nested;
  for (let index = 0; index < 40; index++) { nested.next = {}; nested = nested.next; }
  assert.match(validateLifecycleObservations(value.report, value.events, value).join('\n'), /value\/depth/);
  delete value.events.unexpected; value.originals.get('readability-image').bytes = Buffer.from('synthetic changed original');
  assert.match(validateLifecycleObservations(value.report, value.events, value).join('\n'), /checked original/);
});
