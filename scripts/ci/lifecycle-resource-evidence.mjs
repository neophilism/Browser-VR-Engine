// Inspect data produced by the lifecycle harness without importing the runtime,
// observer, browser bundle, or any downloaded executable. This verifier rebuilds
// the input and replays plain resource events; passing booleans are not proof.
import { createHash } from 'node:crypto';
import { canonicalCarrierJSON } from './portable-carrier-evidence.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const require = (condition, message) => { if (!condition) throw new Error(`Lifecycle resource evidence: ${message}`); };
const exact = (value, keys, optional = []) => object(value) && keys.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => keys.includes(key) || optional.includes(key));
const same = (a, b) => canonicalCarrierJSON(a) === canonicalCarrierJSON(b);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const identity = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && /^[A-Za-z0-9._:-]+$/.test(value);
const vector = value => Array.isArray(value) && value.length === 3 && value.every(finite);
const sorted = values => [...values].sort();
const contextKeys = ['documentToken', 'contextId', 'targetId'];
const glKeys = ['glBuffers', 'glFramebuffers', 'glPrograms', 'glRenderbuffers', 'glShaders', 'glTextures', 'glQueries',
  'glSamplers', 'glSyncs', 'glTransformFeedbacks', 'glVertexArrays'];
const nativeKeys = ['objectUrls', 'audioContexts', 'workletPorts', 'timeouts', 'intervals', 'animationFrames', ...glKeys];
const hostKeys = ['phase', 'createdInstances', 'pendingHostTask', 'failedOwner', 'publishedInstance', 'publishedAdapter', 'foundationReady'];
const snapshotKeys = [...contextKeys, 'at', 'cycle', 'phase', 'runtime', 'native', 'listeners', 'dom', 'cdp', 'memory'];
const cdpEvents = ['contextCreated', 'contextChanged', 'contextWillBeDestroyed', 'audioNodeCreated', 'audioNodeWillBeDestroyed',
  'audioListenerCreated', 'audioListenerWillBeDestroyed', 'nodesConnected', 'nodesDisconnected', 'nodeParamConnected', 'nodeParamDisconnected',
  'audioParamCreated', 'audioParamWillBeDestroyed'];

function boundedJSON(value) {
  const pending = [[value, 0]]; let visited = 0;
  while (pending.length) {
    const [item, depth] = pending.pop();
    require(++visited <= 1_000_000 && depth <= 32, 'observation JSON exceeds its value/depth bound');
    if (typeof item === 'number') require(finite(item), 'non-finite observation number');
    else if (typeof item === 'string') require(item.length <= 65_536, 'observation string exceeds its bound');
    else if (item !== null && typeof item === 'object') {
      const keys = Object.keys(item);
      require(keys.length + visited + pending.length <= 1_000_000, 'observation JSON exceeds its value bound');
      for (const key of keys) {
        require(key.length <= 1024 && !['__proto__', 'prototype', 'constructor'].includes(key), 'reserved or excessive observation key');
        pending.push([item[key], depth + 1]);
      }
    } else require(item === null || typeof item === 'boolean', 'non-JSON observation value');
  }
}

/** The actual carrier used in all ten cycles is reconstructed from checked F03
 * originals. The receipt cannot silently substitute an empty or edited world. */
export function expectedLifecycleInput(world, catalog, originals) {
  require(object(world) && Array.isArray(world.assets) && Array.isArray(world.entities)
    && object(catalog) && Array.isArray(catalog.resources) && originals instanceof Map, 'missing checked lifecycle input');
  require(world.assets.length === 11 && world.entities.length === 55 && catalog.resources.length === 11 && originals.size === 11,
    'lifecycle input is not the complete frozen 55-entity/11-original world');
  const source = structuredClone(world), resources = new Map(catalog.resources.map(item => [item.id, item]));
  source.revision = hash(canonicalCarrierJSON({ id: source.id, coordinates: source.coordinates, assets: source.assets,
    entities: source.entities, requiredFeatures: source.requiredFeatures }));
  const payload = [], assetReceipts = [];
  for (const reference of source.assets) {
    const original = originals.get(reference.id), resource = resources.get(reference.id);
    require(object(original) && Buffer.isBuffer(original.bytes) && object(resource) && original.bytes.length === resource.sizeBytes
      && original.mediaType === resource.mediaType && hash(original.bytes) === resource.sha256 && resource.sha256 === reference.revision,
    'checked original bytes/media/revision differ');
    payload.push(original.bytes);
    assetReceipts.push({ id: reference.id, mediaType: original.mediaType, byteLength: original.bytes.length, revision: reference.revision });
  }
  const descriptors = assetReceipts.map(({ revision, ...descriptor }) => descriptor);
  const manifest = Buffer.from(canonicalCarrierJSON({ kind: 'f05-evaluation-world', version: 1, world: source, assets: descriptors }));
  const body = Buffer.concat([manifest, ...payload]);
  require(body.length <= 4 * 1024 * 1024 - 48, 'frozen lifecycle input exceeds its bounded carrier inventory');
  const header = Buffer.alloc(48); header.write('BVEF05W1'); header.writeUInt32LE(manifest.length, 8);
  header.writeUInt32LE(body.length - manifest.length, 12); Buffer.from(hash(body), 'hex').copy(header, 16);
  const carrier = Buffer.concat([header, body]);
  return { worldId: source.id, worldRevision: source.revision, bytes: carrier.length, sha256: hash(carrier), assetReceipts };
}

function validateProfile(profile, thresholds, world) {
  require(profile?.schemaVersion === 1 && profile.id === 'f05-resource-lifecycle-v1'
    && profile.fixtureSetId === 'bve-foundation-0.1.0' && profile.cycles === 10 && thresholds?.cleanupCycles === profile.cycles,
  'the lifecycle profile must preserve the frozen ten-cycle threshold');
  require(profile.sameDocument === true && profile.sameContext === true && profile.strictLiveBaseline === true
    && same(profile.nativeCounters, nativeKeys), 'profile cannot relax document/context identity or native live baseline');
  for (const name of ['runtimeCounters', 'sceneCounters', 'listenerTargets', 'snapshotPhases', 'eventPhases', 'postInputActions'])
    require(Array.isArray(profile[name]) && profile[name].length > 0 && profile[name].length <= 128
      && profile[name].every(identity) && new Set(profile[name]).size === profile[name].length, 'invalid profile inventory: ' + name);
  require(profile.observer?.maximumEvents === 50_000 && profile.observer.maximumLiveEntries === 1024
    && profile.observer.maximumCDPEvents === 20_000 && profile.observer.overflowFails === true
    && profile.observer.unsupportedTimerCallbackFails === true, 'profile observer bounds differ');
  require(profile.memory?.policy === 'diagnostic-only' && profile.memory.byteOrPercentAcceptanceTolerance === null
    && profile.memory.unavailableIsZero === false && profile.memory.physicalDeviceQualified === false, 'memory profile invents a tolerance or hardware claim');
  require(same(profile.emptyOwnership, { allRuntimeCounters: 0, allSceneCounters: 0, allNativeCounters: 0,
    documentVideoElements: 0, cdpAudioContexts: 0, publishedInstance: false, publishedAdapter: false, failedOwner: false, pendingHostTask: false }),
  'profile relaxes empty ownership');
  const components = type => world.entities.flatMap(entity => entity.components.filter(component => component.type === type).map(component => ({ entity, component })));
  const emitters = components('bve:audio-emitter'), animation = components('bve:animation');
  require(same(sorted(emitters.map(({ component }) => component.data.playbackId)), profile.sourceIds)
    && emitters.length === 6 && animation.length === 1 && components('bve:collider').length === 46,
  'profile/world animation, audio or solid inventory differs');
  const expected = { instances: 1, engines: 1, scenes: 1, renderLoops: 1, entityNodes: world.entities.length,
    originalEntries: world.assets.length, originalBuffers: world.assets.length, physicsWorlds: 1,
    rigidBodies: components('bve:collider').length + 1, colliders: components('bve:collider').length + 1, characterControllers: 1,
    audioContexts: 1, audioSources: emitters.length, bufferSources: 5, mediaSources: 1, panners: emitters.length,
    workletNodes: emitters.length, workletPorts: emitters.length, workletHandlers: emitters.length, videoElements: 1,
    xrSessions: 0, pendingLoads: 0, pendingImports: 0, pendingDisposals: 0 };
  require(same(profile.loadedExpectations, expected), 'loaded expectations differ from the complete frozen world');
  require(profile.activation?.deadlineMs === 20_000 && profile.activation.audioSeconds === 0.2 && profile.activation.videoSeconds === 0.1
    && profile.activation.minimumInputRms === 0.01 && profile.activation.minimumVideoReadyState === 2
    && profile.activation.maximumObservations === 256 && profile.activation.maximumSourceWindows === 128
    && profile.activation.independentObservedMilestones === true && profile.activation.wrapAwareVideoProgress === true
    && ['requiredPhysicsProgress', 'requiredSceneProgress', 'requiredAnimationProgress',
      'requiredDecodedVideoProgress', 'userClickRequired'].every(key => profile.activation[key] === true), 'activation minima cannot be relaxed');
  return { animationEntity: animation[0].entity.id, animationClip: animation[0].component.data.clip };
}

function counterMap(value, keys, name) {
  require(exact(value, keys) && Object.values(value).every(integer), 'invalid ' + name + ' counter schema/number');
}
function validateMemory(memory) {
  require(exact(memory, ['policy', 'jsHeap', 'domCounters', 'userAgentSpecific', 'gpu']) && memory.policy === 'diagnostic-only', 'invalid memory diagnostic schema');
  const unavailable = (item, status) => exact(item, ['status', 'reason']) && item.status === status
    && typeof item.reason === 'string' && item.reason.trim().length > 0 && item.reason.length <= 2048;
  require(unavailable(memory.jsHeap, 'unavailable') || (exact(memory.jsHeap, ['status', 'usedBytes', 'totalBytes'])
    && memory.jsHeap.status === 'available' && integer(memory.jsHeap.usedBytes) && integer(memory.jsHeap.totalBytes)
    && memory.jsHeap.totalBytes >= memory.jsHeap.usedBytes), 'unavailable heap cannot be represented as zero');
  require(unavailable(memory.domCounters, 'unavailable') || (exact(memory.domCounters, ['status', 'documents', 'nodes', 'jsEventListeners'])
    && memory.domCounters.status === 'available' && [memory.domCounters.documents, memory.domCounters.nodes, memory.domCounters.jsEventListeners].every(integer)),
  'invalid DOM diagnostic availability');
  require(unavailable(memory.userAgentSpecific, 'not-measured') && unavailable(memory.gpu, 'unavailable'), 'unsupported allocation measurement is not explicitly unavailable');
}
function validateListeners(listeners, profile) {
  require(exact(listeners, profile.listenerTargets), 'listener census must cover each stable target');
  for (const target of profile.listenerTargets) {
    const item = listeners[target];
    require(exact(item, ['available', 'counts']) && typeof item.available === 'boolean' && object(item.counts)
      && Object.keys(item.counts).length <= 256, 'invalid listener target census');
    require(item.available || (target === 'navigator.xr' && Object.keys(item.counts).length === 0), 'required listener target unavailable');
    for (const [key, count] of Object.entries(item.counts)) require(key.length <= 180
      && /^[^|\s]+\|(?:true|false|0|1)\|(?:true|false|0|1)\|(?:true|false|0|1)$/.test(key)
      && integer(count) && count > 0, 'malformed listener type/options/count');
  }
}

function snapshot(value, cycle, phase, report, profile) {
  require(exact(value, snapshotKeys) && value.cycle === cycle && value.phase === phase && profile.snapshotPhases.includes(phase), 'snapshot phase/cycle schema differs');
  for (const key of contextKeys) require(identity(value[key]) && value[key] === report[key], 'snapshot changed document/context/target identity');
  require(typeof value.at === 'string' && Number.isFinite(Date.parse(value.at)) && Date.parse(value.at) >= Date.parse(report.startedAt)
    && Date.parse(value.at) <= Date.parse(report.timestamp), 'snapshot timestamp lies outside the actual run');
  require(exact(value.runtime, ['instanceId', 'state', 'counters', 'scene', 'host', 'activity']), 'invalid runtime snapshot schema');
  counterMap(value.runtime.counters, profile.runtimeCounters, 'runtime'); counterMap(value.runtime.scene, profile.sceneCounters, 'scene');
  require(exact(value.runtime.host, hostKeys) && integer(value.runtime.host.createdInstances), 'invalid host ownership snapshot');
  for (const key of hostKeys.slice(2)) require(typeof value.runtime.host[key] === 'boolean', 'invalid host ownership flag');
  require(exact(value.native, ['sequence', 'counters', 'overflow', 'faults', 'live']) && integer(value.native.sequence)
    && value.native.overflow === 0 && Array.isArray(value.native.faults) && value.native.faults.length === 0, 'native observer failure or invalid sequence');
  counterMap(value.native.counters, nativeKeys, 'native');
  require(exact(value.native.live, nativeKeys), 'native live-ID inventory is incomplete');
  for (const category of nativeKeys) require(Array.isArray(value.native.live[category]) && value.native.live[category].length <= profile.observer.maximumLiveEntries
    && value.native.live[category].every(identity) && new Set(value.native.live[category]).size === value.native.live[category].length
    && same(value.native.live[category], sorted(value.native.live[category])) && value.native.counters[category] === value.native.live[category].length,
  'native live-ID counts do not match their inventory');
  validateListeners(value.listeners, profile);
  require(exact(value.dom, ['videoElements']) && integer(value.dom.videoElements), 'invalid native video count');
  require(exact(value.cdp, ['sequence', 'audioContexts', 'createdContexts', 'closedContexts', 'destroyedContexts']) && integer(value.cdp.sequence)
    && Array.isArray(value.cdp.audioContexts) && value.cdp.audioContexts.length <= 10 && value.cdp.audioContexts.every(identity)
    && same(value.cdp.audioContexts, sorted(new Set(value.cdp.audioContexts))) && integer(value.cdp.createdContexts) && integer(value.cdp.closedContexts)
    && integer(value.cdp.destroyedContexts), 'invalid CDP live-context inventory');
  validateMemory(value.memory);
}
function empty(value, baseline, created) {
  require(value.runtime.instanceId === null && value.runtime.state === 'empty' && value.runtime.activity === null
    && Object.values(value.runtime.counters).every(count => count === 0) && Object.values(value.runtime.scene).every(count => count === 0),
  'unloaded runtime does not match the strict empty baseline');
  require(value.runtime.host.phase === 'empty' && value.runtime.host.createdInstances === created
    && hostKeys.slice(2).every(key => value.runtime.host[key] === false), 'unloaded host retains an owner, task, adapter or ready state');
  require(nativeKeys.every(key => value.native.counters[key] === 0) && value.dom.videoElements === 0 && value.cdp.audioContexts.length === 0,
    'native resources remain above the empty baseline');
  if (baseline) require(same(value.listeners, baseline.listeners), 'listener census changed from the empty baseline');
}
function loaded(value, cycle, profile, inputBytes) {
  const runtime = value.runtime;
  require(runtime.instanceId === cycle && ['ready', 'running'].includes(runtime.state) && runtime.host.phase === 'ready'
    && runtime.host.createdInstances === cycle && !runtime.host.pendingHostTask && !runtime.host.failedOwner
    && runtime.host.publishedInstance && runtime.host.publishedAdapter && runtime.host.foundationReady, 'loaded cycle lacks its unique active owner');
  for (const [key, count] of Object.entries(profile.loadedExpectations)) require(runtime.counters[key] === count, 'loaded frozen-world resource differs: ' + key);
  require(runtime.counters.originalBytes === inputBytes && runtime.counters.assetContainers > 0 && runtime.counters.assetCacheEntries > 0
    && runtime.counters.objectUrls > 0 && runtime.counters.keys === 0 && runtime.counters.pointerCaptures === 0,
  'loaded original/model/input ownership is incomplete');
  for (const key of ['animationGroups', 'meshes', 'transformNodes', 'skeletons', 'materials', 'textures', 'geometries', 'cameras', 'lights'])
    require(runtime.scene[key] > 0, 'loaded scene is missing frozen resources: ' + key);
  require(value.native.counters.audioContexts === 1 && value.native.counters.workletPorts === 6
    && value.native.counters.objectUrls === runtime.counters.objectUrls && value.dom.videoElements === 1 && value.cdp.audioContexts.length === 1,
  'loaded native graph does not match runtime ownership');
  require(['glBuffers', 'glTextures', 'glPrograms'].every(key => value.native.counters[key] > 0), 'native renderer allocations were not observed while loaded');
}
function animationFact(value, expected) {
  require(exact(value, ['entityId', 'clip', 'playing', 'frame', 'position']) && value.entityId === expected.animationEntity
    && value.clip === expected.animationClip && value.playing === true && finite(value.frame) && vector(value.position), 'frozen animation is not actually playing');
}
function videoFact(value) {
  require(exact(value, ['time', 'duration', 'loop', 'paused', 'seeking', 'readyState', 'decodedFrames']) && finite(value.time) && value.time >= 0
    && finite(value.duration) && value.duration > 0 && value.time <= value.duration
    && ['loop', 'paused', 'seeking'].every(key => typeof value[key] === 'boolean') && integer(value.readyState) && value.readyState <= 4
    && integer(value.decodedFrames), 'decoded video progress is unavailable or malformed');
}
function audioWindow(value, rate, clock) {
  require(exact(value, ['startFrame', 'endFrame', 'sampleRate', 'invalidFrames', 'droppedWindows', 'inputRms'])
    && integer(value.startFrame) && integer(value.endFrame) && value.endFrame > value.startFrame && value.sampleRate === rate
    && value.endFrame - value.startFrame === Math.max(128, Math.floor(rate / 50 / 128) * 128)
    && integer(value.invalidFrames) && value.invalidFrames <= value.endFrame - value.startFrame
    && integer(value.droppedWindows) && value.droppedWindows <= 1000 && finite(value.inputRms) && value.inputRms >= 0,
  'invalid native paired audio window');
  // AudioContext time is expressed in seconds. Recover its nearest native
  // sample index; this is numeric representation, not an audio tolerance.
  const observedFrame = Math.round(clock * rate);
  require(integer(observedFrame) && value.endFrame <= observedFrame,
    'native paired audio window extends past the sampled audio clock');
}
const positiveWindow = (windows, baseline, rate, minimum) => windows.find(window => window.startFrame >= baseline && window.endFrame > baseline
  && window.sampleRate === rate && window.invalidFrames === 0 && window.droppedWindows === 0 && window.inputRms > minimum) ?? null;

// Rebuild the shared observer's claims from its retained native observations.
// No helper/bundle execution is used, and every final fact binds to a full
// same-page snapshot. Milestones can occur in different samples of this one
// interval; video time is accumulated across observed loop wraps only.
function mediaProgress(progress, before, after, profile, expected) {
  require(exact(progress, ['before', 'last', 'samples', 'videoElapsed', 'wraps', 'videoDuration', 'milestones', 'ready'])
    && Array.isArray(progress.samples) && progress.samples.length > 0 && progress.samples.length <= profile.activation.maximumObservations,
  'missing or unbounded retained media progress trace');
  const wallBefore = before.audio.sources.find(source => source.id === 'wall-playback');
  const baselineFrame = Math.max(before.audio.time * before.audio.sampleRate, wallBefore.endFrame ?? 0);
  const observation = (activity, initial = false) => {
    const wall = activity.audio.sources.find(source => source.id === 'wall-playback');
    return { at: activity.at, steps: activity.physicsSteps, animation: activity.animations[0], audioState: activity.audio.state,
      clock: activity.audio.time, sampleRate: activity.audio.sampleRate, video: activity.video, invalidMessages: wall.invalidMessages,
      latestWallWindow: wall.windows.at(-1) ?? null,
      positiveWallWindow: initial ? null : positiveWindow(wall.windows, baselineFrame, activity.audio.sampleRate, profile.activation.minimumInputRms) };
  };
  require(same(progress.before, observation(before, true)) && same(progress.last, observation(after))
    && same(progress.last, progress.samples.at(-1)), 'media trace is not bound to its actual before/after snapshots');
  const valid = value => {
    require(exact(value, ['at', 'steps', 'animation', 'audioState', 'clock', 'sampleRate', 'video', 'invalidMessages', 'latestWallWindow', 'positiveWallWindow'])
      && finite(value.at) && value.at >= 0 && integer(value.steps) && finite(value.clock) && value.clock >= 0
      && value.sampleRate === before.audio.sampleRate && ['running', 'suspended'].includes(value.audioState) && value.invalidMessages === 0,
    'invalid native media progress observation');
    require(value.at >= before.at && value.at - before.at <= profile.activation.deadlineMs,
      'media observation exceeds the frozen activation deadline');
    animationFact(value.animation, expected); videoFact(value.video);
    if (value.latestWallWindow !== null) audioWindow(value.latestWallWindow, value.sampleRate, value.clock);
    if (value.positiveWallWindow !== null) {
      audioWindow(value.positiveWallWindow, value.sampleRate, value.clock);
      require(value.latestWallWindow !== null && value.positiveWallWindow.endFrame <= value.latestWallWindow.endFrame
        && positiveWindow([value.positiveWallWindow], baselineFrame, value.sampleRate, profile.activation.minimumInputRms) !== null,
      'media trace uses stale, invalid or silent wall audio');
    }
  };
  valid(progress.before);
  require(progress.before.video.readyState >= profile.activation.minimumVideoReadyState, 'media baseline precedes native video metadata readiness');
  let previous = progress.before, elapsed = 0, wraps = 0;
  const milestones = {};
  for (const [index, sample] of progress.samples.entries()) {
    valid(sample);
    require(sample.at >= previous.at && sample.clock >= previous.clock && sample.steps >= previous.steps
      && sample.video.decodedFrames >= previous.video.decodedFrames && sample.video.duration === before.video.duration
      && (sample.latestWallWindow?.endFrame ?? 0) >= (previous.latestWallWindow?.endFrame ?? 0), 'media clock, window or video identity regressed');
    if (!previous.video.seeking && !sample.video.seeking) {
      const delta = sample.video.time - previous.video.time;
      if (delta >= 0) elapsed += delta;
      else if (sample.video.loop && previous.video.loop) { elapsed += sample.video.duration + delta; wraps++; }
    }
    const facts = {
      audio: sample.audioState === 'running' && sample.clock > before.audio.time + profile.activation.audioSeconds,
      physics: sample.steps > before.physicsSteps,
      animation: sample.animation.frame !== before.animations[0].frame && sample.animation.position.some((value, axis) => Math.abs(value - before.animations[0].position[axis]) > 0.001),
      video: !sample.video.paused && !sample.video.seeking && sample.video.loop && elapsed > profile.activation.videoSeconds
        && sample.video.decodedFrames > before.video.decodedFrames,
      wallAudio: sample.positiveWallWindow !== null,
    };
    for (const [name, satisfied] of Object.entries(facts)) if (satisfied && !Object.hasOwn(milestones, name)) milestones[name] = index;
    previous = sample;
  }
  require(progress.videoElapsed === elapsed && progress.wraps === wraps && progress.videoDuration === before.video.duration,
    'retained video wrap/progress totals do not match actual adjacent observations');
  require(same(progress.milestones, milestones) && Object.keys(milestones).length === 5 && progress.ready === true
    && previous.audioState === 'running' && previous.animation.playing === true && !previous.video.paused && !previous.video.seeking,
  'media readiness milestones are not independently observed');
}

function activation(before, after, progress, profile, expected) {
  const valid = activity => {
    require(exact(activity, ['at', 'physicsSteps', 'sceneFrame', 'animations', 'audio', 'video']) && finite(activity.at) && activity.at >= 0 && integer(activity.physicsSteps)
      && integer(activity.sceneFrame) && Array.isArray(activity.animations) && activity.animations.length === 1, 'invalid activation activity schema');
    animationFact(activity.animations[0], expected);
    require(exact(activity.audio, ['state', 'time', 'sampleRate', 'activation', 'sources']) && ['suspended', 'running'].includes(activity.audio.state)
      && finite(activity.audio.time) && activity.audio.time >= 0 && Array.isArray(activity.audio.sources)
      && integer(activity.audio.sampleRate) && activity.audio.sampleRate >= 8000 && activity.audio.sampleRate <= 384000
      && same(activity.audio.sources.map(item => item?.id), profile.sourceIds), 'audio activity lacks the six exact source IDs');
    for (const source of activity.audio.sources) {
      require(exact(source, ['id', 'inputRms', 'endFrame', 'invalidMessages', 'windows']) && finite(source.inputRms) && source.inputRms >= 0
        && (source.endFrame === null || integer(source.endFrame)) && source.invalidMessages === 0
        && Array.isArray(source.windows) && source.windows.length <= profile.activation.maximumSourceWindows, 'invalid paired audio activity measurement');
      for (const [index, window] of source.windows.entries()) {
        audioWindow(window, activity.audio.sampleRate, activity.audio.time);
        require(index === 0 || window.startFrame >= source.windows[index - 1].endFrame, 'paired audio history is reordered or overlaps');
      }
      require(source.inputRms === (source.windows.at(-1)?.inputRms ?? 0) && source.endFrame === (source.windows.at(-1)?.endFrame ?? null),
        'latest paired audio measurement differs from retained windows');
    }
    videoFact(activity.video);
    return activity;
  };
  const a = valid(before.runtime.activity), b = valid(after.runtime.activity);
  require(b.at >= a.at && b.at - a.at <= profile.activation.deadlineMs,
    'activation exceeds the frozen observation deadline');
  require(b.physicsSteps > a.physicsSteps && b.sceneFrame > a.sceneFrame, 'physics or scene did not advance during activation');
  require(after.runtime.state === 'running' && b.audio.state === 'running' && b.audio.sampleRate === a.audio.sampleRate && b.audio.time > a.audio.time + profile.activation.audioSeconds,
    'audio did not actually advance through the activation interval');
  const click = b.audio.activation;
  require(exact(click, ['isActive', 'hasBeenActive', 'at', 'before', 'after']) && click.isActive === true && click.hasBeenActive === true
    && finite(click.at) && click.at >= 0 && ['suspended', 'running'].includes(click.before) && click.after === 'running', 'real user-click audio activation is missing');
  require(b.audio.sources.every((source, index) => positiveWindow(source.windows, Math.max(a.audio.time * a.audio.sampleRate,
    a.audio.sources[index].endFrame ?? 0), b.audio.sampleRate, profile.activation.minimumInputRms) !== null)
    && after.runtime.counters.meterWindows > 0, 'not all six native audio sources produced fresh measured samples');
  require(!b.video.paused && !b.video.seeking && b.video.readyState >= profile.activation.minimumVideoReadyState
    && b.video.decodedFrames > a.video.decodedFrames, 'video clock and decoded frames did not advance');
  mediaProgress(progress, a, b, profile, expected);
}

function replayNative(stream, snapshots, profile, final) {
  require(exact(stream, ['events', 'overflow', 'faults']) && Array.isArray(stream.events) && stream.events.length <= profile.observer.maximumEvents
    && stream.overflow === 0 && Array.isArray(stream.faults) && stream.faults.length === 0, 'raw native observer failed or overflowed');
  const live = Object.fromEntries(nativeKeys.map(key => [key, new Map()])), seen = new Set(), queries = new Map();
  const allocations = [], contexts = [];
  for (const point of snapshots) {
    require(point.native.sequence <= stream.events.length, 'native snapshot sequence exceeds its event stream');
    const list = queries.get(point.native.sequence) ?? []; list.push(point); queries.set(point.native.sequence, list);
  }
  const compare = sequence => {
    for (const point of queries.get(sequence) ?? []) for (const category of nativeKeys)
      require(same(point.native.live[category], sorted(live[category].keys())), 'native snapshot does not match replayed event prefix');
  };
  compare(0); let priorCycle = 0;
  for (const [index, event] of stream.events.entries()) {
    require(exact(event, ['sequence', 'cycle', 'phase', 'category', 'action', 'id'], ['contextId']) && event.sequence === index + 1
      && integer(event.cycle) && event.cycle <= 10 && event.cycle >= priorCycle && profile.eventPhases.includes(event.phase)
      && nativeKeys.includes(event.category) && identity(event.id) && event.id.startsWith(event.category + ':'), 'malformed or reordered native resource event');
    priorCycle = event.cycle;
    const table = live[event.category];
    if (event.action === 'allocate') {
      require(event.sequence <= final.native.sequence && !seen.has(event.id) && table.size < profile.observer.maximumLiveEntries,
        'native allocation after final snapshot, reused ID or excessive live entries');
      if (event.category === 'workletPorts') require(identity(event.contextId) && live.audioContexts.has(event.contextId), 'worklet allocation has no live observed audio owner');
      else require(event.contextId === undefined, 'unexpected native resource context binding');
      seen.add(event.id); table.set(event.id, event.contextId); allocations.push(event);
      if (event.category === 'audioContexts') contexts.push(event);
    } else {
      const actions = { objectUrls: ['release'], audioContexts: ['close'], workletPorts: ['close'], timeouts: ['fire', 'clear'], intervals: ['clear'], animationFrames: ['fire', 'clear'],
        ...Object.fromEntries(glKeys.map(key => [key, ['release']])) };
      require(actions[event.category].includes(event.action) && table.has(event.id) && table.get(event.id) === event.contextId,
        'native release/fire/clear has no matching live allocation');
      table.delete(event.id);
    }
    compare(event.sequence);
  }
  require(nativeKeys.every(key => live[key].size === 0), 'terminal native event replay retains live resources');
  require(contexts.length === 10 && same(contexts.map(event => event.cycle), Array.from({ length: 10 }, (_, index) => index + 1)), 'native contexts were not created exactly once in each of ten cycles');
  for (let cycle = 1; cycle <= 10; cycle++) require(allocations.filter(event => event.category === 'workletPorts' && event.cycle === cycle).length === 6,
    'each cycle must allocate its six actual native worklet ports');
  return allocations;
}

function replayCDP(stream, snapshots, profile) {
  require(exact(stream, ['events', 'overflow']) && Array.isArray(stream.events) && stream.events.length <= profile.observer.maximumCDPEvents
    && stream.overflow === 0, 'raw CDP observer failed or overflowed');
  const live = new Set(), closedIds = new Set(), destroyedIds = new Set(), contexts = new Map(), nodes = new Map(), queries = new Map();
  let created = 0, priorCycle = 0;
  for (const point of snapshots) {
    require(point.cdp.sequence <= stream.events.length, 'CDP snapshot sequence exceeds its event stream');
    const list = queries.get(point.cdp.sequence) ?? []; list.push(point); queries.set(point.cdp.sequence, list);
  }
  const graphTypes = { AudioBufferSource: 5, MediaElementAudioSource: 1, Panner: 6, AudioWorklet: 6 };
  const compare = sequence => { for (const point of queries.get(sequence) ?? []) {
    require(same(point.cdp.audioContexts, sorted(live)) && point.cdp.createdContexts === created
      && point.cdp.closedContexts === closedIds.size && point.cdp.destroyedContexts === destroyedIds.size,
      'CDP snapshot differs from native event replay');
    if (point.phase === 'activation-after') {
      const types = contexts.get(point.cdp.audioContexts[0])?.liveNodeTypes;
      require(types && Object.entries(graphTypes).every(([type, count]) => types[type] === count),
        'CDP graph lacks the six real spatial sources/worklets at activation');
    }
  } };
  compare(0);
  for (const [index, entry] of stream.events.entries()) {
    require(exact(entry, ['sequence', 'cycle', 'phase', 'event', 'data']) && entry.sequence === index + 1 && integer(entry.cycle)
      && entry.cycle <= 10 && entry.cycle >= priorCycle && profile.eventPhases.includes(entry.phase) && cdpEvents.includes(entry.event)
      && object(entry.data), 'malformed or reordered CDP event');
    priorCycle = entry.cycle;
    const data = entry.data;
    if (entry.event === 'contextCreated') {
      const value = data.context;
      require(object(value) && identity(value.contextId) && value.contextType === 'realtime' && ['suspended', 'running'].includes(value.contextState) && !contexts.has(value.contextId)
        && entry.cycle >= 1 && entry.cycle <= 10, 'invalid or duplicated CDP context creation');
      contexts.set(value.contextId, { cycle: entry.cycle, nodeTypes: {}, liveNodeTypes: {} }); live.add(value.contextId); created++;
    } else if (entry.event === 'contextChanged') {
      const value = data.context;
      require(object(value) && contexts.has(value.contextId) && ['suspended', 'running', 'closed'].includes(value.contextState), 'CDP state change has no observed context');
      if (value.contextState === 'closed') { closedIds.add(value.contextId); live.delete(value.contextId); }
      else require(live.has(value.contextId) && !closedIds.has(value.contextId) && !destroyedIds.has(value.contextId), 'CDP reopened a closed or destroyed context');
    } else if (entry.event === 'contextWillBeDestroyed') {
      require(identity(data.contextId) && contexts.has(data.contextId) && !destroyedIds.has(data.contextId), 'CDP context destruction has no unique observed owner');
      live.delete(data.contextId); destroyedIds.add(data.contextId);
    } else if (entry.event === 'audioNodeCreated') {
      const value = data.node, owner = contexts.get(value?.contextId);
      require(object(value) && identity(value.nodeId) && owner && live.has(value.contextId) && !nodes.has(value.nodeId)
        && identity(value.nodeType), 'CDP audio node lacks a unique live context owner');
      nodes.set(value.nodeId, { contextId: value.contextId, nodeType: value.nodeType });
      owner.nodeTypes[value.nodeType] = (owner.nodeTypes[value.nodeType] ?? 0) + 1;
      owner.liveNodeTypes[value.nodeType] = (owner.liveNodeTypes[value.nodeType] ?? 0) + 1;
    } else if (entry.event === 'audioNodeWillBeDestroyed') {
      const node = nodes.get(data.nodeId), owner = contexts.get(data.contextId);
      require(node?.contextId === data.contextId && owner && owner.liveNodeTypes[node.nodeType] > 0, 'CDP node destruction has no matching live creation');
      owner.liveNodeTypes[node.nodeType]--;
      nodes.delete(data.nodeId);
    }
    compare(entry.sequence);
  }
  require(created === 10 && live.size === 0 && contexts.size === 10, 'CDP must observe ten real contexts and zero open contexts at completion');
  require(same([...contexts.values()].map(value => value.cycle).sort((a, b) => a - b), Array.from({ length: 10 }, (_, index) => index + 1)), 'CDP contexts do not cover all ten cycles');
  for (const value of contexts.values()) for (const [type, count] of Object.entries(graphTypes))
    require(value.nodeTypes[type] === count, 'CDP graph lacks the six real spatial sources/worklets in a cycle');
  return contexts;
}

export function validateLifecycleObservations(report, events, { profile, world, catalog, thresholds, originals } = {}) {
  try {
    boundedJSON(report); boundedJSON(events);
    const expected = validateProfile(profile, thresholds, world), input = expectedLifecycleInput(world, catalog, originals);
    require(same(report.input, input), 'reported input differs from the exact reconstructed frozen-world carrier');
    require(exact(events, ['schemaVersion', 'profileSha256', ...contextKeys, 'native', 'cdp', 'fixtureAttempts'])
      && events.schemaVersion === 1 && events.profileSha256 === report.profileSha256, 'raw event file uses a different observation profile');
    for (const key of contextKeys) require(identity(report[key]) && events[key] === report[key], 'raw events changed document/context/target identity');
    require(report.fixtureAttempts === 0 && Array.isArray(events.fixtureAttempts) && events.fixtureAttempts.length === 0, 'lifecycle fetched fallback fixtures');
    require(same(report.memory, { policy: 'diagnostic-only', byteOrPercentAcceptanceTolerance: null,
      physicalDeviceQualified: false, qualificationStatus: 'incomplete' }), 'memory evidence invents a tolerance or qualified measurement');
    require(Array.isArray(report.cycles) && report.cycles.length === 10, 'exactly ten activated cycles are required');
    const points = [], add = (point, cycle, phase) => { snapshot(point, cycle, phase, report, profile); points.push(point); return point; };
    const baseline = add(report.baseline, 0, 'baseline'); empty(baseline, null, 0);
    require(baseline.cdp.createdContexts === 0 && baseline.cdp.closedContexts === 0 && baseline.cdp.destroyedContexts === 0, 'empty baseline follows a prior native context');
    const changes = Object.entries(baseline.listeners['world-file'].counts).filter(([key]) => key.startsWith('change|')).reduce((sum, [, count]) => sum + count, 0);
    require(changes === 1, 'empty host must retain exactly one world-file change listener');
    const negative = report.negativeControl;
    require(exact(negative, ['before', 'allocated', 'released', 'id', 'comparisonRejected']) && negative.comparisonRejected === true && identity(negative.id), 'missing real observer negative control');
    empty(add(negative.before, 0, 'negative-before'), baseline, 0);
    add(negative.allocated, 0, 'negative-allocated');
    const withoutURL = structuredClone(negative.allocated); withoutURL.native.counters.objectUrls = 0; withoutURL.native.live.objectUrls = [];
    empty(withoutURL, baseline, 0);
    require(negative.allocated.native.counters.objectUrls === 1 && same(negative.allocated.native.live.objectUrls, [negative.id]), 'negative control does not contain one real extra native URL');
    empty(add(negative.released, 0, 'negative-released'), baseline, 0);
    const originalBytes = input.assetReceipts.reduce((total, item) => total + item.byteLength, 0);
    for (const [offset, cycle] of report.cycles.entries()) {
      const index = offset + 1;
      require(exact(cycle, ['index', 'instanceId', 'loaded', 'activation', 'unloadReceipt', 'unloaded', 'postInput'])
        && cycle.index === index && cycle.instanceId === index && exact(cycle.activation, ['before', 'after', 'mediaProgress'])
        && exact(cycle.postInput, ['before', 'after', 'actions']), 'cycle index/instance/schema is missing, repeated or reordered');
      loaded(add(cycle.loaded, index, 'loaded'), index, profile, originalBytes);
      loaded(add(cycle.activation.before, index, 'activation-before'), index, profile, originalBytes);
      loaded(add(cycle.activation.after, index, 'activation-after'), index, profile, originalBytes);
      activation(cycle.activation.before, cycle.activation.after, cycle.activation.mediaProgress, profile, expected);
      const receipt = cycle.unloadReceipt;
      require(exact(receipt, ['instanceId', 'state', 'counters', 'scene', 'activity']) && receipt.instanceId === index
        && receipt.state === 'disposed' && receipt.activity === null, 'unload did not return this instance disposed');
      counterMap(receipt.counters, profile.runtimeCounters, 'unload'); counterMap(receipt.scene, profile.sceneCounters, 'unload scene');
      require([...Object.values(receipt.counters), ...Object.values(receipt.scene)].every(value => value === 0), 'disposed receipt retains live resources');
      empty(add(cycle.unloaded, index, 'unloaded'), baseline, index);
      empty(add(cycle.postInput.before, index, 'post-input-before'), baseline, index);
      empty(add(cycle.postInput.after, index, 'post-input-after'), baseline, index);
      require(same(cycle.postInput.actions, profile.postInputActions), 'unloaded input actions were not all exercised');
    }
    const final = add(report.final, 10, 'final'); empty(final, baseline, 10);
    for (let index = 1; index < points.length; index++) require(Date.parse(points[index].at) >= Date.parse(points[index - 1].at)
      && points[index].native.sequence >= points[index - 1].native.sequence && points[index].cdp.sequence >= points[index - 1].cdp.sequence,
    'snapshot timestamps/event prefixes are not in execution order');
    const allocations = replayNative(events.native, points, profile, final), contexts = replayCDP(events.cdp, points, profile);
    for (const cycle of report.cycles) {
      require([cycle.loaded, cycle.activation.before, cycle.activation.after].every(point => contexts.get(point.cdp.audioContexts[0])?.cycle === cycle.index),
        'loaded snapshot reuses another cycle native context');
      const active = cycle.activation.after;
      require(active.cdp.createdContexts === cycle.index && cycle.unloaded.cdp.createdContexts === cycle.index, 'native context creation does not match the current cycle');
      require(!allocations.some(event => event.sequence > cycle.postInput.before.native.sequence && event.sequence <= cycle.postInput.after.native.sequence),
        'unloaded input reactivated native allocation');
    }
    require(final.cdp.createdContexts === 10 && final.cdp.audioContexts.length === 0, 'final snapshot precedes the tenth native close/observed state release');
    require(allocations.filter(event => event.cycle === 0 && event.category === 'objectUrls' && event.phase.startsWith('negative-')).length === 1
      && allocations.some(event => event.id === negative.id && event.sequence > negative.before.native.sequence
        && event.sequence <= negative.allocated.native.sequence), 'negative control is not bound to the real allocation journal');
    return [];
  } catch (error) { return [error.message]; }
}
