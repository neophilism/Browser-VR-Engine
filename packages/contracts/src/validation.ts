import { Value } from '@sinclair/typebox/value';
import type { Static, TSchema } from '@sinclair/typebox';
import { CONTRACT_VERSION, SCHEMAS, BUILTIN_COMPONENT_SCHEMAS, type Transform, type WorldFixture, type QualificationScenario, type FixtureCatalog, type WorkloadManifest, type QualificationResult } from './schemas.js';
import type { Diagnostic } from './ports.js';

export type DocumentKind = keyof typeof SCHEMAS;
export type DocumentValue<K extends DocumentKind> = Static<(typeof SCHEMAS)[K]>;
export type ValidationResult<T> = { ok: true; value: T; diagnostics: [] } | { ok: false; diagnostics: Diagnostic[] };
export interface ValidationOptions { knownComponents?: readonly string[]; world?: WorldFixture; }
export const VALIDATION_LIMITS = Object.freeze({ maxJsonBytes: 2 * 1024 * 1024, maxDepth: 48, maxValues: 100000, maxStringLength: 65536, maxErrors: 32 });
const escapePointer = (value: string) => value.replaceAll('~', '~0').replaceAll('/', '~1');

/** Inspect descriptors first: untrusted plain data must not execute getters while validating. */
function inspectJson(value: unknown): Diagnostic[] {
  const active = new Set<object>(); let count = 0;
  const errors: Diagnostic[] = [];
  function error(code: string, path: string, message: string) { if (errors.length < VALIDATION_LIMITS.maxErrors) errors.push({ code, path, message }); }
  function walk(item: unknown, path: string, depth: number): void {
    if (errors.length >= VALIDATION_LIMITS.maxErrors) return;
    if (++count > VALIDATION_LIMITS.maxValues) { error('LIMIT_VALUES', path, 'JSON value budget exceeded'); return; }
    if (depth > VALIDATION_LIMITS.maxDepth) { error('LIMIT_DEPTH', path, 'JSON depth budget exceeded'); return; }
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') { if (item.length > VALIDATION_LIMITS.maxStringLength) error('LIMIT_STRING', path, 'String budget exceeded'); return; }
    if (typeof item === 'number') { if (!Number.isFinite(item)) error('NONFINITE', path, 'Numbers must be finite'); return; }
    if (typeof item !== 'object') { error('NOT_JSON', path, 'Only JSON data is accepted'); return; }
    if (active.has(item)) { error('JSON_CYCLE', path, 'Cyclic data is not JSON'); return; }
    const prototype = Object.getPrototypeOf(item);
    if (Array.isArray(item) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) { error('NOT_PLAIN_JSON', path, 'Only ordinary JSON arrays and objects are accepted'); return; }
    active.add(item);
    if (Array.isArray(item) && item.length > VALIDATION_LIMITS.maxValues) { error('LIMIT_VALUES', path, 'Array budget exceeded'); active.delete(item); return; }
    const keys = Object.getOwnPropertyNames(item).filter(key => !(Array.isArray(item) && key === 'length'));
    if (keys.length > VALIDATION_LIMITS.maxValues) { error('LIMIT_VALUES', path, 'Object budget exceeded'); active.delete(item); return; }
    if (Object.getOwnPropertySymbols(item).length) error('NOT_JSON', path, 'Symbols are not JSON data');
    if (Array.isArray(item) && (keys.length !== item.length || keys.some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))) error('NOT_JSON', path, 'Sparse or extended arrays are not JSON data');
    for (const key of keys) {
      if (count >= VALIDATION_LIMITS.maxValues) { error('LIMIT_VALUES', path, 'JSON value budget exceeded'); break; }
      const childPath = `${path}/${escapePointer(key)}`;
      if (key.length > VALIDATION_LIMITS.maxStringLength) { error('LIMIT_STRING', path, 'Property-name budget exceeded'); continue; }
      if (['__proto__', 'prototype', 'constructor'].includes(key)) { error('UNSAFE_KEY', childPath, 'Reserved property key'); continue; }
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!descriptor.enumerable) { error('NOT_JSON', childPath, 'Non-enumerable properties are not JSON data'); continue; }
      if (!('value' in descriptor)) { error('NOT_JSON', childPath, 'Accessors are not JSON data'); continue; }
      walk(descriptor.value, childPath, depth + 1);
    }
    active.delete(item);
  }
  walk(value, '', 0); return errors;
}
function schemaErrors(schema: TSchema, value: unknown, prefix = ''): Diagnostic[] {
  const errors: Diagnostic[] = [];
  for (const error of Value.Errors(schema, value)) {
    errors.push({ code: 'SCHEMA', path: prefix + error.path, message: error.message });
    if (errors.length === VALIDATION_LIMITS.maxErrors) break;
  }
  return errors;
}
function transformErrors(transform: Transform, path: string): Diagnostic[] {
  if (transform.kind === 'trs') {
    const norm = Math.hypot(...transform.rotation);
    if (Math.abs(norm - 1) > 1e-5) return [{ code: 'QUATERNION', path: `${path}/rotation`, message: 'Canonical quaternion must be normalized and nonzero' }];
    if (transform.scale.some(value => value === 0)) return [{ code: 'SINGULAR_TRANSFORM', path: `${path}/scale`, message: 'Zero scale is not a usable canonical transform' }];
  } else {
    const m = transform.elements;
    if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) return [{ code: 'AFFINE_TRANSFORM', path, message: 'Expected a column-major affine matrix' }];
    const determinant = m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) + m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);
    if (determinant === 0 || !Number.isFinite(determinant)) return [{ code: 'SINGULAR_TRANSFORM', path, message: 'Canonical matrix must have a finite, nonzero determinant' }];
  }
  return [];
}
function uniqueIds(values: { id: string }[], path: string): Diagnostic[] {
  const seen = new Set<string>(), errors: Diagnostic[] = [];
  values.forEach((value, index) => { if (seen.has(value.id)) errors.push({ code: 'DUPLICATE_ID', path: `${path}/${index}/id`, message: 'Identifier must be unique' }); seen.add(value.id); });
  return errors;
}
function validateWorld(world: WorldFixture, options: ValidationOptions): Diagnostic[] {
  const errors = [...uniqueIds(world.assets, '/assets'), ...uniqueIds(world.entities, '/entities')];
  const assets = new Map(world.assets.map(asset => [asset.id, asset])), entities = new Map(world.entities.map(entity => [entity.id, entity]));
  const playback = new Map<string, string>();
  const known = new Set(options.knownComponents ?? Object.keys(BUILTIN_COMPONENT_SCHEMAS));
  for (const [index, feature] of world.requiredFeatures.entries()) if (!known.has(feature)) errors.push({ code: 'UNSUPPORTED_REQUIRED', path: `/requiredFeatures/${index}`, message: `Unsupported required feature ${feature}` });
  world.entities.forEach((entity, index) => {
    const path = `/entities/${index}`;
    errors.push(...transformErrors(entity.transform, `${path}/transform`));
    if (entity.parentId && !entities.has(entity.parentId)) errors.push({ code: 'MISSING_PARENT', path: `${path}/parentId`, message: 'Parent entity does not exist' });
    const chain = new Set<string>(); let current: typeof entity | undefined = entity;
    while (current) {
      if (chain.has(current.id)) { errors.push({ code: 'PARENT_CYCLE', path, message: 'Entity parent cycle' }); break; }
      chain.add(current.id);
      if (chain.size > VALIDATION_LIMITS.maxDepth) { errors.push({ code: 'LIMIT_DEPTH', path, message: 'Entity hierarchy depth exceeded' }); break; }
      current = current.parentId ? entities.get(current.parentId) : undefined;
    }
    const componentTypes = new Set<string>();
    entity.components.forEach((component, componentIndex) => {
      const componentPath = `${path}/components/${componentIndex}`;
      if (componentTypes.has(component.type)) errors.push({ code: 'DUPLICATE_COMPONENT', path: componentPath, message: 'One component of each type per fixture entity' });
      componentTypes.add(component.type);
      if (component.required && !known.has(component.type)) errors.push({ code: 'UNSUPPORTED_REQUIRED', path: componentPath, message: `Unsupported required component ${component.type}` });
      const schema = BUILTIN_COMPONENT_SCHEMAS[component.type as keyof typeof BUILTIN_COMPONENT_SCHEMAS];
      if (!schema) return;
      if (component.version !== CONTRACT_VERSION) {
        if (component.required) errors.push({ code: 'UNSUPPORTED_COMPONENT_VERSION', path: `${componentPath}/version`, message: 'Required built-in component version is unsupported' });
        return;
      }
      const problems = schemaErrors(schema, component.data, `${componentPath}/data`);
      errors.push(...problems); if (problems.length) return;
      const data = component.data as Record<string, unknown>;
      const assetId = data.asset ?? data.sourceAsset;
      if (typeof assetId === 'string' && !assets.has(assetId)) errors.push({ code: 'MISSING_ASSET', path: componentPath, message: 'Referenced asset does not exist' });
      if (component.type === 'bve:mesh' || component.type === 'bve:animation') {
        if (typeof assetId === 'string' && assets.has(assetId) && assets.get(assetId)!.kind !== 'model') errors.push({ code: 'ASSET_KIND', path: componentPath, message: 'Mesh/animation requires a model asset' });
      }
      if (component.type === 'bve:media-surface' && typeof assetId === 'string' && assets.has(assetId) && !['image', 'video'].includes(assets.get(assetId)!.kind)) errors.push({ code: 'ASSET_KIND', path: componentPath, message: 'Media surface requires an image or video source' });
      if (component.type === 'bve:collider') {
        if ((data.halfExtents as number[]).some(value => value <= 0)) errors.push({ code: 'COLLIDER_EXTENTS', path: componentPath, message: 'Collider half extents must be positive' });
        if (data.body === 'dynamic' && data.massKg === 0) errors.push({ code: 'COLLIDER_MASS', path: componentPath, message: 'Dynamic fixture bodies require positive mass' });
      }
      if (component.type === 'bve:audio-emitter') {
        const curve = data.curve as { referenceDistance: number; fadeStart: number; cutoff: number };
        if (curve.referenceDistance > curve.fadeStart || curve.fadeStart >= curve.cutoff) errors.push({ code: 'AUDIO_CURVE', path: componentPath, message: 'Expected referenceDistance <= fadeStart < cutoff' });
        if (typeof assetId === 'string' && assets.has(assetId) && !['audio', 'video'].includes(assets.get(assetId)!.kind)) errors.push({ code: 'ASSET_KIND', path: componentPath, message: 'Emitter requires an audio or video source' });
      }
      if (typeof data.playbackId === 'string' && typeof data.sourceAsset === 'string') {
        if (playback.has(data.playbackId) && playback.get(data.playbackId) !== data.sourceAsset) errors.push({ code: 'PLAYBACK_SOURCE', path: componentPath, message: 'One playback identity cannot bind different sources' });
        playback.set(data.playbackId, data.sourceAsset);
      }
    });
  });
  return errors;
}
function validateScenario(scenario: QualificationScenario, options: ValidationOptions): Diagnostic[] {
  const errors = [...uniqueIds(scenario.assertions, '/assertions'), ...uniqueIds(scenario.steps, '/steps')];
  const assertions = new Set(scenario.assertions.map(value => value.id)), used = new Set<string>();
  const entities = options.world ? new Set(options.world.entities.map(value => value.id)) : undefined;
  let previous = -1;
  for (const [index, step] of scenario.steps.entries()) {
    if (step.tick < previous) errors.push({ code: 'TICK_ORDER', path: `/steps/${index}/tick`, message: 'Steps must use nondecreasing ticks' });
    previous = step.tick;
    for (const id of step.assertions) {
      if (!assertions.has(id)) errors.push({ code: 'MISSING_ASSERTION', path: `/steps/${index}/assertions`, message: 'Unknown assertion reference' });
      if (used.has(id)) errors.push({ code: 'REPEATED_ASSERTION', path: `/steps/${index}/assertions`, message: 'Give each observation checkpoint its own assertion ID' });
      used.add(id);
    }
    if (entities && 'targetId' in step && !entities.has(step.targetId)) errors.push({ code: 'MISSING_ENTITY', path: `/steps/${index}/targetId`, message: 'Unknown target entity' });
    if ('transform' in step) errors.push(...transformErrors(step.transform, `/steps/${index}/transform`));
    if ('orientation' in step && Math.abs(Math.hypot(...step.orientation) - 1) > 1e-5) errors.push({ code: 'QUATERNION', path: `/steps/${index}/orientation`, message: 'Look quaternion must be normalized' });
  }
  for (const id of assertions) if (!used.has(id)) errors.push({ code: 'UNUSED_ASSERTION', path: '/assertions', message: `Assertion ${id} has no step` });
  if (options.world && scenario.worldId !== options.world.id) errors.push({ code: 'WORLD_ID', path: '/worldId', message: 'Scenario names a different world' });
  return errors;
}
function validateCatalog(catalog: FixtureCatalog): Diagnostic[] {
  const errors = [...uniqueIds(catalog.resources, '/resources'), ...uniqueIds(catalog.provenance, '/provenance')];
  const provenance = new Set(catalog.provenance.map(value => value.id)), paths = new Set<string>();
  for (const [index, resource] of catalog.resources.entries()) {
    if (resource.path.split('/').some(part => !part || part === '.' || part === '..')) errors.push({ code: 'RESOURCE_PATH', path: `/resources/${index}/path`, message: 'Resource path must be a contained relative POSIX path' });
    if (paths.has(resource.path)) errors.push({ code: 'DUPLICATE_PATH', path: `/resources/${index}/path`, message: 'Resource paths must be unique' });
    paths.add(resource.path);
    if (!provenance.has(resource.provenanceId)) errors.push({ code: 'MISSING_PROVENANCE', path: `/resources/${index}/provenanceId`, message: 'Resource provenance does not exist' });
  }
  return errors;
}
export function validateDocument<K extends DocumentKind>(kind: K, data: unknown, options: ValidationOptions = {}): ValidationResult<DocumentValue<K>> {
  if (!Object.hasOwn(SCHEMAS, kind)) return { ok: false, diagnostics: [{ code: 'SCHEMA_KIND', path: '', message: 'Unknown contract kind' }] };
  const schema = SCHEMAS[kind];
  let errors = inspectJson(data);
  if (!errors.length) errors = schemaErrors(schema, data);
  if (errors.length) return { ok: false, diagnostics: errors.slice(0, VALIDATION_LIMITS.maxErrors) };
  if (kind === 'world') errors.push(...validateWorld(data as WorldFixture, options));
  if (kind === 'scenario') errors.push(...validateScenario(data as QualificationScenario, options));
  if (kind === 'catalog') errors.push(...validateCatalog(data as FixtureCatalog));
  if (kind === 'listener' && Math.abs(Math.hypot(...(data as DocumentValue<'listener'>).orientation) - 1) > 1e-5) errors.push({ code: 'QUATERNION', path: '/orientation', message: 'Listener quaternion must be normalized' });
  if (kind === 'workload') {
    const workload = data as WorkloadManifest;
    if (workload.realBrowserClients + workload.protocolClients !== workload.participants) errors.push({ code: 'PARTICIPANT_COUNT', path: '/participants', message: 'Real plus protocol clients must equal participants' });
    if (workload.microphonePublishers > workload.participants) errors.push({ code: 'PUBLISHER_COUNT', path: '/microphonePublishers', message: 'Publisher count exceeds participants' });
  }
  if (kind === 'result') errors.push(...uniqueIds((data as QualificationResult).observations.map(value => ({ id: value.assertionId })), '/observations'));
  return errors.length ? { ok: false, diagnostics: errors.slice(0, VALIDATION_LIMITS.maxErrors) } : { ok: true, value: data as DocumentValue<K>, diagnostics: [] };
}
export function parseDocument<K extends DocumentKind>(kind: K, text: string, options: ValidationOptions = {}): ValidationResult<DocumentValue<K>> {
  if (typeof text !== 'string' || text.length > VALIDATION_LIMITS.maxJsonBytes || new TextEncoder().encode(text).length > VALIDATION_LIMITS.maxJsonBytes) return { ok: false, diagnostics: [{ code: 'LIMIT_BYTES', path: '', message: 'JSON document budget exceeded' }] };
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, diagnostics: [{ code: 'JSON_SYNTAX', path: '', message: 'Invalid JSON text' }] }; }
  return validateDocument(kind, data, options);
}
export function requireDocument<K extends DocumentKind>(kind: K, data: unknown, options: ValidationOptions = {}): DocumentValue<K> {
  const result = validateDocument(kind, data, options);
  if (!result.ok) throw new TypeError(result.diagnostics.map(error => `${error.code} ${error.path}: ${error.message}`).join('\n'));
  return result.value;
}
/** JSON export strips TypeBox-only symbols; the emitted JSON Schema is the same authored source. */
export function exportJsonSchemas(): Record<DocumentKind, Record<string, unknown>> { return JSON.parse(JSON.stringify(SCHEMAS)) as Record<DocumentKind, Record<string, unknown>>; }
