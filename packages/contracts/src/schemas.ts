import { Type, type Static } from '@sinclair/typebox';

export const CONTRACT_VERSION = '0.1.0' as const;
export const COORDINATES = Object.freeze({
  units: 'meters', handedness: 'right', up: '+Y', cameraForward: '-Z',
  quaternionOrder: 'xyzw', matrixOrder: 'column-major'
} as const);

const closed = { additionalProperties: false } as const;
export const IdSchema = Type.String({ minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' });
export const DigestSchema = Type.String({ pattern: '^[a-f0-9]{64}$' });
export const Vec3Schema = Type.Tuple([Type.Number(), Type.Number(), Type.Number()]);
export const QuaternionSchema = Type.Tuple([Type.Number(), Type.Number(), Type.Number(), Type.Number()]);
export const MatrixSchema = Type.Array(Type.Number(), { minItems: 16, maxItems: 16 });
export const CoordinatesSchema = Type.Object({
  units: Type.Literal(COORDINATES.units), handedness: Type.Literal(COORDINATES.handedness),
  up: Type.Literal(COORDINATES.up), cameraForward: Type.Literal(COORDINATES.cameraForward),
  quaternionOrder: Type.Literal(COORDINATES.quaternionOrder), matrixOrder: Type.Literal(COORDINATES.matrixOrder)
}, closed);
export type Vec3 = Static<typeof Vec3Schema>;
export type Quaternion = Static<typeof QuaternionSchema>;
export const TransformSchema = Type.Union([
  Type.Object({ kind: Type.Literal('trs'), translation: Vec3Schema, rotation: QuaternionSchema, scale: Vec3Schema }, closed),
  Type.Object({ kind: Type.Literal('matrix'), elements: MatrixSchema }, closed)
]);
export type Transform = Static<typeof TransformSchema>;
const FeatureSchema = Type.String({ minLength: 1, maxLength: 128, pattern: '^[a-z][a-z0-9_-]*:[a-z][a-z0-9_.-]*$' });
const SourceCoordinatesSchema = Type.Object({
  unitsPerMeter: Type.Number({ exclusiveMinimum: 0 }),
  handedness: Type.Union([Type.Literal('right'), Type.Literal('left')]),
  up: Type.Union([Type.Literal('+Y'), Type.Literal('+Z')]),
  authoredForward: Type.Union([Type.Literal('+Z'), Type.Literal('-Z'), Type.Literal('+Y'), Type.Literal('-Y')]),
  sourceToWorld: MatrixSchema
}, closed);

export const AssetRefSchema = Type.Object({
  id: IdSchema, revision: DigestSchema,
  kind: Type.Union((['model', 'image', 'audio', 'video', 'attachment'] as const).map(value => Type.Literal(value))),
  sourceCoordinates: Type.Optional(SourceCoordinatesSchema)
}, closed);
export type AssetRef = Static<typeof AssetRefSchema>;
export const ComponentSchema = Type.Object({
  type: FeatureSchema,
  version: Type.String({ minLength: 5, maxLength: 64, pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$' }),
  required: Type.Boolean(), data: Type.Unknown()
}, closed);
export const EntitySchema = Type.Object({
  id: IdSchema, name: Type.String({ maxLength: 256 }), parentId: Type.Optional(IdSchema),
  transform: TransformSchema, components: Type.Array(ComponentSchema, { maxItems: 64 })
}, closed);
export const WorldSchema = Type.Object({
  kind: Type.Literal('world-fixture'), schemaVersion: Type.Literal(CONTRACT_VERSION),
  id: IdSchema, revision: DigestSchema,
  coordinates: CoordinatesSchema,
  assets: Type.Array(AssetRefSchema, { maxItems: 1024 }),
  entities: Type.Array(EntitySchema, { maxItems: 4096 }),
  requiredFeatures: Type.Array(FeatureSchema, { maxItems: 128, uniqueItems: true })
}, { ...closed, $id: `urn:browser-vr-engine:schema:world-fixture:${CONTRACT_VERSION}` });
export type WorldFixture = Static<typeof WorldSchema>;
export type EntityFixture = Static<typeof EntitySchema>;

export const DistanceCurveSchema = Type.Object({
  model: Type.Union([Type.Literal('inverse'), Type.Literal('linear'), Type.Literal('exponential')]),
  referenceDistance: Type.Number({ exclusiveMinimum: 0 }), rolloff: Type.Number({ minimum: 0 }),
  fadeStart: Type.Number({ minimum: 0 }), cutoff: Type.Number({ exclusiveMinimum: 0 })
}, closed);
export type DistanceCurve = Static<typeof DistanceCurveSchema>;
export const AudioEmitterSchema = Type.Object({
  sourceAsset: IdSchema, playbackId: IdSchema,
  bus: Type.Union((['voice', 'video', 'music', 'ambience', 'effects'] as const).map(value => Type.Literal(value))),
  spatial: Type.Boolean(), localOffset: Vec3Schema, gain: Type.Number({ minimum: 0, maximum: 4 }),
  curve: DistanceCurveSchema, channels: Type.Union([Type.Literal('mono'), Type.Literal('stereo')]),
  loop: Type.Boolean()
}, closed);
export type AudioEmitterDescriptor = Static<typeof AudioEmitterSchema>;
export const MediaSurfaceSchema = Type.Object({ sourceAsset: IdSchema, playbackId: IdSchema, aspectRatio: Type.Number({ exclusiveMinimum: 0, maximum: 64 }) }, closed);
export type MediaSurfaceDescriptor = Static<typeof MediaSurfaceSchema>;
export const ListenerSchema = Type.Object({
  position: Vec3Schema, orientation: QuaternionSchema, clockDomain: IdSchema,
  origin: Type.Union((['desktop', 'xr-head', 'accessible-view'] as const).map(value => Type.Literal(value))),
  tracking: Type.Union((['tracked', 'estimated', 'unavailable'] as const).map(value => Type.Literal(value)))
}, { ...closed, $id: `urn:browser-vr-engine:schema:listener:${CONTRACT_VERSION}` });
export type ListenerDescriptor = Static<typeof ListenerSchema>;
export const MeshSchema = Type.Object({ asset: IdSchema }, closed);
export const ColliderSchema = Type.Object({
  shape: Type.Literal('box'), halfExtents: Vec3Schema,
  body: Type.Union([Type.Literal('static'), Type.Literal('dynamic'), Type.Literal('kinematic')]),
  massKg: Type.Number({ minimum: 0, maximum: 10000 })
}, closed);
export const AnimationSchema = Type.Object({
  asset: IdSchema, clip: Type.String({ minLength: 1, maxLength: 128 }), loop: Type.Boolean(),
  route: Type.Array(Vec3Schema, { minItems: 2, maxItems: 128 }), speedMetersPerSecond: Type.Number({ exclusiveMinimum: 0, maximum: 100 })
}, closed);
export const BUILTIN_COMPONENT_SCHEMAS = {
  'bve:mesh': MeshSchema,
  'bve:collider': ColliderSchema,
  'bve:audio-emitter': AudioEmitterSchema,
  'bve:media-surface': MediaSurfaceSchema,
  'bve:animation': AnimationSchema
} as const;

export const ActorScopeSchema = Type.Object({ principalId: IdSchema, tenantId: IdSchema, projectId: IdSchema, worldId: IdSchema }, closed);
export type ActorScope = Static<typeof ActorScopeSchema>;
export const CapabilityRequirementSchema = Type.Object({ scope: ActorScopeSchema, operation: FeatureSchema, targetId: IdSchema }, closed);
export type CapabilityRequirement = Static<typeof CapabilityRequirementSchema>;
export const OperationSchema = Type.Object({
  kind: Type.Literal('operation'), schemaVersion: Type.Literal(CONTRACT_VERSION), requestId: IdSchema,
  requirement: CapabilityRequirementSchema, expectedRevision: Type.Optional(DigestSchema), payload: Type.Unknown()
}, { ...closed, $id: `urn:browser-vr-engine:schema:operation:${CONTRACT_VERSION}` });
export type OperationEnvelope = Static<typeof OperationSchema>;

export const EvidenceMethodSchema = Type.Union((['schema-test', 'reference-math', 'real-browser', 'real-service', 'physical-headset', 'physical-audio', 'simulation'] as const).map(value => Type.Literal(value)));
export type EvidenceMethod = Static<typeof EvidenceMethodSchema>;
const AssertionSchema = Type.Object({
  id: IdSchema, feature: FeatureSchema, description: Type.String({ minLength: 1, maxLength: 2048 }),
  allowedMethods: Type.Array(EvidenceMethodSchema, { minItems: 1, maxItems: 7, uniqueItems: true })
}, closed);
export type QualificationAssertion = Static<typeof AssertionSchema>;
const stepBase = { id: IdSchema, tick: Type.Integer({ minimum: 0, maximum: 1000000 }), assertions: Type.Array(IdSchema, { minItems: 1, maxItems: 32, uniqueItems: true }) };
export const ScenarioStepSchema = Type.Union([
  Type.Object({ ...stepBase, action: Type.Literal('move'), targetId: IdSchema, position: Vec3Schema }, closed),
  Type.Object({ ...stepBase, action: Type.Literal('look'), orientation: QuaternionSchema }, closed),
  Type.Object({ ...stepBase, action: Type.Union((['select', 'grab', 'play', 'pause', 'teleport'] as const).map(v => Type.Literal(v))), targetId: IdSchema }, closed),
  Type.Object({ ...stepBase, action: Type.Literal('release'), targetId: IdSchema, velocity: Vec3Schema }, closed),
  Type.Object({ ...stepBase, action: Type.Literal('seek'), targetId: IdSchema, seconds: Type.Number({ minimum: 0, maximum: 86400 }) }, closed),
  Type.Object({ ...stepBase, action: Type.Literal('edit'), targetId: IdSchema, transform: TransformSchema }, closed),
  Type.Object({ ...stepBase, action: Type.Union((['export-reload', 'disconnect', 'reconnect'] as const).map(v => Type.Literal(v))) }, closed),
  Type.Object({ ...stepBase, action: Type.Literal('operator-checkpoint'), instruction: Type.String({ minLength: 1, maxLength: 2048 }) }, closed)
]);
export type ScenarioStep = Static<typeof ScenarioStepSchema>;
export const ScenarioSchema = Type.Object({
  kind: Type.Literal('scenario'), schemaVersion: Type.Literal(CONTRACT_VERSION), id: IdSchema, worldId: IdSchema,
  tickRate: Type.Integer({ minimum: 1, maximum: 240 }),
  assertions: Type.Array(AssertionSchema, { minItems: 1, maxItems: 512 }),
  steps: Type.Array(ScenarioStepSchema, { minItems: 1, maxItems: 2048 })
}, { ...closed, $id: `urn:browser-vr-engine:schema:scenario:${CONTRACT_VERSION}` });
export type QualificationScenario = Static<typeof ScenarioSchema>;

export const ObservationSchema = Type.Object({
  assertionId: IdSchema,
  status: Type.Union((['passed', 'failed', 'unsupported', 'blocked', 'not-run'] as const).map(v => Type.Literal(v))),
  method: EvidenceMethodSchema, detail: Type.String({ minLength: 1, maxLength: 4096 }),
  value: Type.Optional(Type.Union([Type.Number(), Type.String({ maxLength: 4096 }), Type.Boolean()]))
}, closed);
export type AssertionObservation = Static<typeof ObservationSchema>;
export const QualificationResultSchema = Type.Object({
  kind: Type.Literal('qualification-result'), schemaVersion: Type.Literal(CONTRACT_VERSION),
  scenarioId: IdSchema, candidateId: IdSchema, candidateVersion: Type.String({ minLength: 1, maxLength: 128 }),
  scenarioDigest: DigestSchema, worldDigest: DigestSchema,
  observations: Type.Array(ObservationSchema, { maxItems: 512 })
}, { ...closed, $id: `urn:browser-vr-engine:schema:qualification-result:${CONTRACT_VERSION}` });
export type QualificationResult = Static<typeof QualificationResultSchema>;

export const WorkloadSchema = Type.Object({
  kind: Type.Literal('workload'), schemaVersion: Type.Literal(CONTRACT_VERSION), id: IdSchema,
  worldId: IdSchema, scenarioId: IdSchema, seed: Type.Integer({ minimum: 0, maximum: 4294967295 }),
  participants: Type.Integer({ minimum: 1, maximum: 100000 }),
  realBrowserClients: Type.Integer({ minimum: 1, maximum: 100000 }), protocolClients: Type.Integer({ minimum: 0, maximum: 100000 }),
  microphonePublishers: Type.Integer({ minimum: 0, maximum: 100000 }), videoDecodersPerBrowser: Type.Integer({ minimum: 0, maximum: 64 }),
  audioPannersPerBrowser: Type.Integer({ minimum: 0, maximum: 128 }), poseHz: Type.Integer({ minimum: 1, maximum: 120 }),
  simulationHz: Type.Integer({ minimum: 1, maximum: 240 }), snapshotHz: Type.Integer({ minimum: 1, maximum: 120 }),
  warmupSeconds: Type.Integer({ minimum: 0, maximum: 3600 }), durationSeconds: Type.Integer({ minimum: 1, maximum: 86400 }),
  repetitions: Type.Integer({ minimum: 1, maximum: 100 }),
  viewport: Type.Tuple([Type.Integer({ minimum: 1, maximum: 16384 }), Type.Integer({ minimum: 1, maximum: 16384 })]),
  effectiveDpr: Type.Number({ exclusiveMinimum: 0, maximum: 4 }), targetHz: Type.Number({ exclusiveMinimum: 0, maximum: 240 }),
  qualityPreset: IdSchema, thresholdSetId: IdSchema, evidenceRequired: Type.Array(EvidenceMethodSchema, { minItems: 1, uniqueItems: true })
}, { ...closed, $id: `urn:browser-vr-engine:schema:workload:${CONTRACT_VERSION}` });
export type WorkloadManifest = Static<typeof WorkloadSchema>;
const deviceBase = { kind: Type.Literal('device-manifest'), schemaVersion: Type.Literal(CONTRACT_VERSION), id: IdSchema };
export const DeviceSchema = Type.Union([
  Type.Object({ ...deviceBase, status: Type.Literal('target'), description: Type.String({ minLength: 1, maxLength: 2048 }), evidenceRequired: Type.Array(EvidenceMethodSchema, { minItems: 1, uniqueItems: true }) }, closed),
  Type.Object({ ...deviceBase, status: Type.Literal('observed'), cpu: IdSchema, gpu: Type.String({ minLength: 1, maxLength: 256 }),
    ramGiB: Type.Number({ exclusiveMinimum: 0 }), os: Type.String({ minLength: 1, maxLength: 256 }),
    browser: Type.String({ minLength: 1, maxLength: 256 }), backend: Type.Union((['webgl2', 'webgpu'] as const).map(v => Type.Literal(v))),
    audioInput: Type.String({ minLength: 1, maxLength: 256 }), audioOutput: Type.String({ minLength: 1, maxLength: 256 }),
    headset: Type.Optional(Type.Object({ model: IdSchema, firmware: Type.String({ minLength: 1, maxLength: 256 }), runtime: Type.String({ minLength: 1, maxLength: 256 }), refreshHz: Type.Number({ exclusiveMinimum: 0 }), physical: Type.Literal(true) }, closed))
  }, closed)
], { $id: `urn:browser-vr-engine:schema:device-manifest:${CONTRACT_VERSION}` });
export type DeviceManifest = Static<typeof DeviceSchema>;

export const FixtureResourceSchema = Type.Object({
  id: IdSchema, path: Type.String({ minLength: 1, maxLength: 256, pattern: '^[a-zA-Z0-9][a-zA-Z0-9._/-]*$' }),
  mediaType: Type.String({ minLength: 1, maxLength: 128 }), sizeBytes: Type.Integer({ minimum: 1, maximum: 67108864 }),
  sha256: DigestSchema, provenanceId: IdSchema
}, closed);
export type FixtureResource = Static<typeof FixtureResourceSchema>;
export const CatalogSchema = Type.Object({
  kind: Type.Literal('fixture-catalog'), schemaVersion: Type.Literal(CONTRACT_VERSION), id: IdSchema,
  generatorVersion: Type.Literal(CONTRACT_VERSION), seed: Type.Integer({ minimum: 0, maximum: 4294967295 }),
  resources: Type.Array(FixtureResourceSchema, { maxItems: 1024 }),
  provenance: Type.Array(Type.Object({ id: IdSchema, creator: Type.String({ minLength: 1, maxLength: 256 }), license: Type.String({ minLength: 1, maxLength: 128 }), source: Type.String({ minLength: 1, maxLength: 512 }) }, closed), { minItems: 1, maxItems: 32 })
}, { ...closed, $id: `urn:browser-vr-engine:schema:fixture-catalog:${CONTRACT_VERSION}` });
export type FixtureCatalog = Static<typeof CatalogSchema>;

export const ThresholdSchema = Type.Object({
  kind: Type.Literal('threshold-set'), schemaVersion: Type.Literal(CONTRACT_VERSION), id: IdSchema,
  coordinateErrorMeters: Type.Number({ exclusiveMinimum: 0 }), staticAnchorErrorMeters: Type.Number({ exclusiveMinimum: 0 }),
  attenuationErrorDb: Type.Number({ exclusiveMinimum: 0 }), avOffsetMs: Type.Number({ exclusiveMinimum: 0 }),
  p95FramePeriodMultiplier: Type.Number({ minimum: 1 }), p99FramePeriodMultiplier: Type.Number({ minimum: 1 }),
  missedIntervalMultiplier: Type.Number({ minimum: 1 }), maxMissedIntervalFraction: Type.Number({ minimum: 0, maximum: 1 }),
  stallMs: Type.Number({ exclusiveMinimum: 0 }), cleanupCycles: Type.Integer({ minimum: 1, maximum: 100 })
}, { ...closed, $id: `urn:browser-vr-engine:schema:threshold-set:${CONTRACT_VERSION}` });
export type ThresholdManifest = Static<typeof ThresholdSchema>;
export const SCHEMAS = {
  world: WorldSchema, operation: OperationSchema, listener: ListenerSchema, scenario: ScenarioSchema,
  result: QualificationResultSchema, workload: WorkloadSchema, device: DeviceSchema, catalog: CatalogSchema, thresholds: ThresholdSchema
} as const;
