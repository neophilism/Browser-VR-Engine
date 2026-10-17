import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { bundleRoot, fixtureRoot, sources, origin } from './config.mjs';
import { canonicalJson, readJson, sha256, writeJson } from './lib.mjs';

export const fixturePins = await readJson(join(bundleRoot, 'fixture-pins.json'));
export const adaptationVersion = 'f04-spoke-wrapper-2';
const jsonInputs = {
  'world.json': 'worldDigest', 'scenario.json': 'scenarioDigest', 'thresholds.json': 'thresholdDigest',
  'workloads.json': 'workloadDigest', 'devices.json': 'deviceTargetDigest',
  'catalog.json': 'catalogDigest', 'schema-set.json': 'schemaDigest',
};
export async function verifyFixtures(root = fixtureRoot) {
  const verifiedRoot = await realpath(root);
  const comparison = await readJson(join(verifiedRoot, 'comparison.json'));
  if (canonicalJson(comparison) !== canonicalJson(fixturePins)) throw new Error('F03 comparison manifest differs from the frozen comparison inputs.');
  const inputs = {}, files = new Map();
  for (const [file, digestKey] of Object.entries(jsonInputs)) {
    const bytes = await readFile(join(verifiedRoot, file));
    const value = JSON.parse(bytes.toString());
    if (sha256(canonicalJson(value)) !== fixturePins[digestKey]) throw new Error(`F03 ${file} content digest mismatch.`);
    inputs[file] = value; files.set(file, bytes);
  }
  files.set('comparison.json', await readFile(join(verifiedRoot, 'comparison.json')));
  for (const resource of inputs['catalog.json'].resources) {
    const target = resolve(verifiedRoot, resource.path);
    const resolved = await realpath(target);
    const rel = relative(verifiedRoot, resolved);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`Fixture asset escapes its root: ${resource.path}`);
    const bytes = await readFile(resolved);
    if (bytes.length !== resource.sizeBytes || sha256(bytes) !== resource.sha256) throw new Error(`Fixture bytes changed: ${resource.path}`);
    files.set(resource.path, bytes);
  }
  return { world: inputs['world.json'], catalog: inputs['catalog.json'], comparison, files };
}
const vector = values => Object.fromEntries(['x', 'y', 'z'].map((key, i) => [key, values[i]]));
export function xyzEuler(q) {
  const [x, y, z, w] = q;
  if (Math.abs(q.reduce((sum, n) => sum + n * n, 0) - 1) > 1e-6) throw new Error('Fixture quaternion is not normalized.');
  const m11 = 1 - 2 * (y*y + z*z), m12 = 2 * (x*y - z*w), m13 = 2 * (x*z + y*w);
  const m22 = 1 - 2 * (x*x + z*z), m23 = 2 * (y*z - x*w);
  const m32 = 2 * (y*z + x*w), m33 = 1 - 2 * (x*x + y*y);
  const ey = Math.asin(Math.max(-1, Math.min(1, m13)));
  return Math.abs(m13) < 0.9999999 ? [Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11)] : [Math.atan2(m32, m22), ey, 0];
}
export function makeSpokeProject(world, catalog, template, assetOrigin) {
  const parsedOrigin = new URL(assetOrigin);
  if (parsedOrigin.protocol !== 'https:' || parsedOrigin.hostname !== '127.0.0.1' || parsedOrigin.username || parsedOrigin.password) throw new Error('The evaluator serves fixtures only on loopback HTTPS.');
  const project = structuredClone(template), root = project.root;
  project.metadata.name = 'F03 synthetic courtyard';
  project.entities = Object.fromEntries(Object.entries(project.entities).filter(([key, value]) => key === root || ['Skybox', 'Directional Light', 'Spawn Point'].includes(value.name)));
  project.entities[root].name = 'F03 synthetic courtyard';
  const paths = Object.fromEntries(catalog.resources.map(resource => [resource.id, new URL(`fixtures/${resource.path}`, `${assetOrigin}/`).href]));
  const add = (entity, suffix, components, options = {}) => {
    project.entities[entity.id + suffix] = {
      name: entity.id + suffix, parent: options.parent || root, index: Object.keys(project.entities).length,
      components: [
        { name: 'transform', props: {
          position: vector(options.translation || entity.transform.translation),
          rotation: vector(xyzEuler(options.rotation || entity.transform.rotation)),
          scale: vector(options.scale || entity.transform.scale),
        } },
        { name: 'visible', props: { visible: true } }, ...components,
      ],
    };
  };
  const audioParams = audio => ({ name: 'audio-params', props: {
    overrideAudioSettings: true, audioType: 'pannernode', gain: audio.gain,
    distanceModel: audio.curve.model, rolloffFactor: audio.curve.rolloff,
    refDistance: audio.curve.referenceDistance, maxDistance: audio.curve.cutoff,
    coneInnerAngle: 360, coneOuterAngle: 360, coneOuterGain: 1,
  } });
  for (const entity of world.entities) {
    const components = Object.fromEntries(entity.components.map(c => [c.type, c.data]));
    const mesh = components['bve:mesh'], collider = components['bve:collider'];
    const audio = components['bve:audio-emitter'], media = components['bve:media-surface'];
    if (mesh) add(entity, '', [
      { name: 'gltf-model', props: { src: paths[mesh.asset], attribution: null } },
      { name: 'shadow', props: { cast: true, receive: true } },
    ]);
    if (collider?.shape === 'box') {
      const localScale = collider.halfExtents.map(n => 2 * n);
      // Keep collision proxies attached to edited model nodes. The older capture
      // used root siblings, which did not follow prop edits.
      add(entity, '-collision', [{ name: 'box-collider', props: {} }], mesh ? {
        parent: entity.id, translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: localScale,
      } : { scale: localScale.map((n, i) => n * entity.transform.scale[i]) });
    }
    if (media) {
      if (!audio) throw new Error('The frozen screen fixture must retain its positional audio component.');
      // Spoke's Video internally scales its unit plane to fit the source aspect.
      // F03 already defines the final size by unit-quad world scale: compensate
      // for that internal scale exactly once, preserving a 5.333 m by 3 m screen.
      const width = Math.min(1, media.aspectRatio), height = Math.min(1, 1 / media.aspectRatio);
      add(entity, '', [
        { name: 'video', props: { src: paths[media.sourceAsset], controls: true, autoPlay: true, loop: audio.loop, projection: 'flat' } },
        audioParams(audio),
      ], { scale: [entity.transform.scale[0] / width, entity.transform.scale[1] / height, entity.transform.scale[2]] });
    } else if (audio) {
      add(entity, '-audio', [
        { name: 'audio', props: { src: paths[audio.sourceAsset], controls: true, autoPlay: true, loop: audio.loop } },
        audioParams(audio),
      ], mesh ? { parent: entity.id, translation: audio.localOffset, rotation: [0, 0, 0, 1], scale: [1, 1, 1] } : {});
    }
  }
  return project;
}
export async function prepareFixture(run) {
  const verified = await verifyFixtures();
  const template = await readJson(join(sources.spoke, 'src/assets/templates/crater.spoke'));
  const servedRoot = join(run.dir, 'served');
  const project = makeSpokeProject(verified.world, verified.catalog, template, origin);
  for (const [file, bytes] of verified.files) {
    const target = join(servedRoot, 'fixtures', file);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
  const projectName = `${run.id}.spoke`;
  await writeJson(join(servedRoot, projectName), project);
  const adaptation = {
    adaptationVersion, worldRevision: verified.world.revision, comparison: verified.comparison,
    projectEntities: Object.keys(project.entities).length, fixtureFiles: verified.files.size,
    mappings: [
      'Byte-identical F03 glTF, audio, and video assets wrapped in a native Spoke project.',
      'Right-handed meters, +Y up, XYZW rotation converted to the pinned Three.js XYZ Euler convention.',
      'Box collider children follow the edited model; collider-only architectural proxies keep their world transforms.',
      'Video aspect compensation preserves the F03 unit-quad physical size.',
      'All six positional emitters retain source, gain, reference distance, rolloff and native panner selection.',
    ],
    unmapped: [
      'Dynamic mass, collisions during play, grabbing, throwing and authoritative ownership are not simulated by this editor wrapper.',
      'Native maxDistance is not the F03 fadeStart-to-cutoff envelope; audio buses and synchronized playback IDs need a runtime adapter.',
      'Bird motion route and requested animation playback are not executed by this wrapper; skin/clip presence is inspected on export.',
      'The editor camera/Spawn Point from the template does not implement the F03 observer locomotion scenario.',
      'Native project serialization is tested for selected mapped fields; complete canonical-world semantic roundtrip is not implemented.',
    ],
  };
  await writeJson(join(run.dir, 'spoke-fixture-adaptation.json'), adaptation);
  return { servedRoot, projectName, project, adaptation };
}
