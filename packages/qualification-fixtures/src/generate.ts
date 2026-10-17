import { CONTRACT_VERSION, COORDINATES, canonicalJson, digestJson, exportJsonSchemas, sha256,
  type AssetRef, type EntityFixture, type FixtureCatalog, type QualificationScenario, type Transform,
  type WorkloadManifest, type DeviceManifest, type ThresholdManifest, type WorldFixture } from '@browser-vr-engine/contracts';
import { courtyardParts, generateCoordinateLab, generateCourtyard, generateCreature, generateProp } from './gltf.js';

export const FIXTURE_SEED = 0x42564503;
export const FIXTURE_SET_ID = 'bve-foundation-0.1.0';
export interface GeneratedFixtureSet {
  files: Map<string, Uint8Array>; catalog: FixtureCatalog; world: WorldFixture;
  scenario: QualificationScenario; workloads: WorkloadManifest[]; devices: DeviceManifest[]; thresholds: ThresholdManifest;
}
const encode = (value: unknown) => new TextEncoder().encode(canonicalJson(value) + '\n');
const trs = (translation: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1], rotation: [number, number, number, number] = [0, 0, 0, 1]): Transform => ({ kind: 'trs', translation, scale, rotation });
const component = (type: string, data: unknown, required = true) => ({ type, version: CONTRACT_VERSION, required, data });

/** Original one-second PCM16 mono loops with integer cycles and fixed RMS. */
export function generateToneWav(frequency: number, sampleRate = 48000): Uint8Array {
  if (!Number.isInteger(frequency) || frequency < 1 || frequency > 10000 || sampleRate !== 48000) throw new RangeError('Fixture tone parameters out of range');
  const bytes = new Uint8Array(44 + sampleRate * 2), view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((value, index) => view.setUint8(offset + index, value.charCodeAt(0)));
  ascii(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, sampleRate * 2, true);
  const amplitude = Math.SQRT2 * 10 ** (-24 / 20);
  for (let i = 0; i < sampleRate; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * frequency * i / sampleRate) * amplitude * 32767), true);
  return bytes;
}

export const thresholds: ThresholdManifest = Object.freeze({
  kind: 'threshold-set', schemaVersion: CONTRACT_VERSION, id: 'comparison-thresholds-0.1.0',
  coordinateErrorMeters: 1e-6, staticAnchorErrorMeters: .001, attenuationErrorDb: .1, avOffsetMs: 80,
  p95FramePeriodMultiplier: 1.1, p99FramePeriodMultiplier: 2.1, missedIntervalMultiplier: 1.5,
  maxMissedIntervalFraction: .01, stallMs: 250, cleanupCycles: 10
});
export const deviceTargets: DeviceManifest[] = [
  { kind: 'device-manifest', schemaVersion: CONTRACT_VERSION, id: 'ordinary-laptop', status: 'target', description: 'Actual integrated-graphics laptop; record CPU/GPU/OS/browser/version/power mode. No hardware evidence has been collected.', evidenceRequired: ['real-browser', 'physical-audio'] },
  { kind: 'device-manifest', schemaVersion: CONTRACT_VERSION, id: 'target-headset', status: 'target', description: 'Actual selected headset with model/firmware/runtime, active refresh, per-eye dimensions and tracked input. Emulator evidence cannot qualify this target.', evidenceRequired: ['physical-headset', 'physical-audio'] },
  { kind: 'device-manifest', schemaVersion: CONTRACT_VERSION, id: 'premium-desktop', status: 'target', description: 'Actual discrete-GPU desktop, separately observed from the ordinary-laptop profile.', evidenceRequired: ['real-browser'] }
];

export function foundationScenario(): QualificationScenario {
  const assertions = [
    { id: 'render', feature: 'bve:render', description: 'Render the supplied architecture, coordinate markers, props and skinned creature at their declared scale.', allowedMethods: ['real-browser'] },
    { id: 'traverse', feature: 'bve:physics', description: 'Traverse the courtyard openings while closed walls remain solid.', allowedMethods: ['real-browser'] },
    { id: 'select', feature: 'bve:edit', description: 'Select the named prop through the visible interaction route.', allowedMethods: ['real-browser'] },
    { id: 'grab', feature: 'bve:physics', description: 'Grab the named movable prop.', allowedMethods: ['real-browser', 'physical-headset'] },
    { id: 'release', feature: 'bve:physics', description: 'Release with velocity and observe collision, preserving object identity.', allowedMethods: ['real-browser', 'physical-headset'] },
    { id: 'audio', feature: 'bve:audio', description: 'All four calibrated sources remain mixed; listener motion changes attenuation continuously.', allowedMethods: ['real-browser', 'physical-audio'] },
    { id: 'play', feature: 'bve:media', description: 'Play the supplied video on the wall with exactly one attached audio route.', allowedMethods: ['real-browser'] },
    { id: 'seek', feature: 'bve:media', description: 'Seek picture and sound together and measure timed markers.', allowedMethods: ['real-browser'] },
    { id: 'pause', feature: 'bve:media', description: 'Pause both the visual and audio source.', allowedMethods: ['real-browser'] },
    { id: 'edit', feature: 'bve:edit', description: 'Use the actual browser editor to edit the prop transform.', allowedMethods: ['real-browser'] },
    { id: 'roundtrip', feature: 'bve:export', description: 'Export/reload the edited world, preserving identities, transforms and media bindings.', allowedMethods: ['real-browser'] },
    { id: 'reconnect', feature: 'bve:network', description: 'Reconnect two real clients and compare object identity/state.', allowedMethods: ['real-service'] },
    { id: 'xr', feature: 'bve:xr', description: 'On an actual headset: enter, operate controller UI, recenter, sit, sleep/resume and exit; retain real head motion near a wall.', allowedMethods: ['physical-headset'] }
  ] as QualificationScenario['assertions'];
  return {
    kind: 'scenario', schemaVersion: CONTRACT_VERSION, id: 'foundation-interactions-0.1.0', worldId: 'courtyard-v1', tickRate: 60, assertions,
    steps: [
      { id: 'initial-view', tick: 0, action: 'operator-checkpoint', instruction: 'Observe the supplied fixture model render and named scene parts.', assertions: ['render'] },
      { id: 'walk-through-arch', tick: 120, action: 'move', targetId: 'observer', position: [0, 1.6, -4], assertions: ['traverse'] },
      { id: 'select-prop', tick: 240, action: 'select', targetId: 'prop-0', assertions: ['select'] },
      { id: 'grab-prop', tick: 300, action: 'grab', targetId: 'prop-0', assertions: ['grab'] },
      { id: 'throw-prop', tick: 360, action: 'release', targetId: 'prop-0', velocity: [1, 2, 0], assertions: ['release'] },
      { id: 'audio-center', tick: 480, action: 'move', targetId: 'observer', position: [0, 1.6, 0], assertions: ['audio'] },
      { id: 'play-wall', tick: 600, action: 'play', targetId: 'wall-screen', assertions: ['play'] },
      { id: 'seek-wall', tick: 720, action: 'seek', targetId: 'wall-screen', seconds: 1, assertions: ['seek'] },
      { id: 'pause-wall', tick: 840, action: 'pause', targetId: 'wall-screen', assertions: ['pause'] },
      { id: 'edit-prop', tick: 960, action: 'edit', targetId: 'prop-0', transform: trs([2, 1, 2]), assertions: ['edit'] },
      { id: 'save-reload', tick: 1080, action: 'export-reload', assertions: ['roundtrip'] },
      { id: 'reconnect-client', tick: 1200, action: 'reconnect', assertions: ['reconnect'] },
      { id: 'physical-headset', tick: 1320, action: 'operator-checkpoint', instruction: 'Run the documented real-headset checklist; missing hardware must be recorded blocked, never simulated as passed.', assertions: ['xr'] }
    ]
  };
}
export function workloadProfiles(): WorkloadManifest[] {
  return [1, 2, 20, 50, 100].map(participants => ({
    kind: 'workload', schemaVersion: CONTRACT_VERSION,
    id: participants === 1 ? 'foundation-local-v1' : participants === 2 ? 'foundation-two-client-v1' : `interactive-${participants}-v1`,
    worldId: 'courtyard-v1', scenarioId: 'foundation-interactions-0.1.0', seed: FIXTURE_SEED,
    participants, realBrowserClients: Math.min(participants, 2), protocolClients: Math.max(0, participants - 2),
    microphonePublishers: participants === 1 ? 0 : 2, videoDecodersPerBrowser: 1, audioPannersPerBrowser: 6,
    poseHz: 20, simulationHz: 60, snapshotHz: 20, warmupSeconds: 60, durationSeconds: 180, repetitions: 3,
    viewport: [1280, 720], effectiveDpr: 1, targetHz: 30, qualityPreset: 'reference', thresholdSetId: thresholds.id,
    evidenceRequired: participants === 1 ? ['real-browser'] : ['real-browser', 'real-service']
  }));
}

/** Input video is the checked-in original encoding; no native converter is needed to regenerate. */
export async function generateFixtureSet(video: Uint8Array): Promise<GeneratedFixtureSet> {
  if (video.length < 4 || video.length > 16 * 1024 * 1024 || video[0] !== 0x1a || video[1] !== 0x45 || video[2] !== 0xdf || video[3] !== 0xa3) throw new TypeError('Expected the bounded original WebM fixture');
  const videoCopy = new Uint8Array(video);
  const files = new Map<string, Uint8Array>(), assets: AssetRef[] = [];
  const catalog: FixtureCatalog = { kind: 'fixture-catalog', schemaVersion: CONTRACT_VERSION, id: FIXTURE_SET_ID, generatorVersion: CONTRACT_VERSION, seed: FIXTURE_SEED, resources: [], provenance: [{ id: 'original-synthetic', creator: 'neophilism / Browser-VR-Engine', license: 'UNLICENSED', source: 'Source generators and original encoded video are included in this repository; no third-party model or recording is included.' }] };
  async function addAsset(id: string, path: string, kind: AssetRef['kind'], mediaType: string, bytes: Uint8Array) {
    const digest = await sha256(bytes);
    files.set(path, bytes); assets.push({ id, revision: digest, kind });
    catalog.resources.push({ id, path, mediaType, sizeBytes: bytes.length, sha256: digest, provenanceId: 'original-synthetic' });
  }
  await addAsset('architecture', 'models/courtyard.gltf', 'model', 'model/gltf+json', generateCourtyard());
  await addAsset('coordinate-model', 'models/coordinates.gltf', 'model', 'model/gltf+json', generateCoordinateLab());
  await addAsset('prop-model', 'models/prop.gltf', 'model', 'model/gltf+json', generateProp());
  await addAsset('creature-model', 'models/creature.gltf', 'model', 'model/gltf+json', generateCreature());
  for (let i = 0; i < 4; i++) await addAsset(`corner-audio-${i}`, `audio/corner-${i}.wav`, 'audio', 'audio/wav', generateToneWav([220, 330, 440, 550][i]!));
  await addAsset('calibration-audio', 'audio/calibration.wav', 'audio', 'audio/wav', generateToneWav(1000));
  await addAsset('wall-video', 'media/screen-marker.webm', 'video', 'video/webm', videoCopy);
  const image = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#152039"/><path d="M0 0L1280 720M1280 0L0 720" stroke="#49bbcf" stroke-width="12"/><text x="640" y="335" text-anchor="middle" fill="white" font-size="64" font-family="sans-serif">BVE ORIGINAL FIXTURE</text><text x="640" y="425" text-anchor="middle" fill="white" font-size="40" font-family="sans-serif">1280 x 720 / 16:9</text></svg>\n';
  await addAsset('readability-image', 'media/readability.svg', 'image', 'image/svg+xml', new TextEncoder().encode(image));
  const entities: EntityFixture[] = [
    { id: 'courtyard', name: 'Imported courtyard', transform: trs(), components: [component('bve:mesh', { asset: 'architecture' })] },
    { id: 'coordinate-markers', name: 'One-meter coordinate markers', transform: trs([4, .1, -2]), components: [component('bve:mesh', { asset: 'coordinate-model' })] },
    { id: 'observer', name: 'Reference camera/listener start', transform: trs([0, 1.6, 8]), components: [] }
  ];
  for (const part of courtyardParts()) entities.push({
    id: `collision-${part.id}`, name: part.id, transform: trs(part.center, [1, 1, 1], part.rotation ?? [0, 0, 0, 1]),
    components: [component('bve:collider', { shape: 'box', halfExtents: part.size.map(value => value / 2), body: 'static', massKg: 0 })]
  });
  for (let i = 0; i < 10; i++) entities.push({ id: `prop-${i}`, name: `Movable original prop ${i}`, transform: trs([-4 + i % 5, .6, 2 + Math.floor(i / 5)]), components: [component('bve:mesh', { asset: 'prop-model' }), component('bve:collider', { shape: 'box', halfExtents: [.6, .5, .3], body: 'dynamic', massKg: 2 })] });
  const curve = { model: 'inverse', referenceDistance: 1, rolloff: 1, fadeStart: 10, cutoff: 14 };
  for (let i = 0; i < 4; i++) entities.push({ id: `music-corner-${i}`, name: `Corner track ${i}`, transform: trs([i & 1 ? 6 : -6, 1.6, i & 2 ? 6 : -6]), components: [component('bve:audio-emitter', { sourceAsset: `corner-audio-${i}`, playbackId: `corner-playback-${i}`, bus: 'music', spatial: true, localOffset: [0, 0, 0], gain: 1, curve, channels: 'mono', loop: true })] });
  entities.push({ id: 'bird', name: 'Original animated creature', transform: trs([0, 5, 0]), components: [component('bve:mesh', { asset: 'creature-model' }), component('bve:animation', { asset: 'creature-model', clip: 'flap', loop: true, route: [[-4, 5, -4], [4, 5, -4], [4, 5, 4], [-4, 5, 4]], speedMetersPerSecond: 1 }), component('bve:audio-emitter', { sourceAsset: 'calibration-audio', playbackId: 'bird-playback', bus: 'effects', spatial: true, localOffset: [0, 0, 0], gain: .2, curve, channels: 'mono', loop: true })] });
  entities.push({ id: 'wall-screen', name: 'Timed video screen', transform: trs([0, 2.2, -11.7], [5.333333333333333, 3, 1]), components: [component('bve:media-surface', { sourceAsset: 'wall-video', playbackId: 'wall-playback', aspectRatio: 16 / 9 }), component('bve:audio-emitter', { sourceAsset: 'wall-video', playbackId: 'wall-playback', bus: 'video', spatial: true, localOffset: [0, 0, 0], gain: 1, curve, channels: 'mono', loop: true })] });
  const content = { id: 'courtyard-v1', coordinates: { ...COORDINATES }, assets, entities, requiredFeatures: ['bve:mesh', 'bve:collider', 'bve:audio-emitter', 'bve:media-surface', 'bve:animation'] };
  const world: WorldFixture = { kind: 'world-fixture', schemaVersion: CONTRACT_VERSION, revision: await digestJson(content), ...content };
  const scenario = foundationScenario(), workloads = workloadProfiles();
  files.set('world.json', encode(world)); files.set('scenario.json', encode(scenario)); files.set('thresholds.json', encode(thresholds));
  files.set('workloads.json', encode(workloads)); files.set('devices.json', encode(deviceTargets));
  files.set('catalog.json', encode(catalog));
  files.set('schema-set.json', encode(exportJsonSchemas()));
  files.set('comparison.json', encode({
    schemaVersion: CONTRACT_VERSION, fixtureSetId: FIXTURE_SET_ID,
    worldDigest: await digestJson(world), scenarioDigest: await digestJson(scenario),
    thresholdDigest: await digestJson(thresholds), workloadDigest: await digestJson(workloads),
    deviceTargetDigest: await digestJson(deviceTargets), catalogDigest: await digestJson(catalog),
    schemaDigest: await digestJson(exportJsonSchemas())
  }));
  return { files, catalog, world, scenario, workloads, devices: deviceTargets, thresholds };
}
