import { canonicalJson, requireDocument, sha256, type AssetPort, type AuthorizationPort, type CapabilityRequirement, type FixtureCatalog } from '@browser-vr-engine/contracts';

/** Explicit local fixture resources; never falls back to a network URL or filesystem path. */
export function createFixtureAssetPort(catalogValue: FixtureCatalog, fileValues: ReadonlyMap<string, Uint8Array>): AssetPort {
  const catalog = structuredClone(requireDocument('catalog', catalogValue));
  const resources = new Map(catalog.resources.map(resource => [resource.id, resource]));
  const files = new Map([...fileValues].map(([path, bytes]) => [path, new Uint8Array(bytes)]));
  return { async resolve(reference, signal) {
    signal?.throwIfAborted();
    const resource = resources.get(reference.id);
    if (!resource || resource.sha256 !== reference.revision) throw new Error('Fixture asset reference is not authorized by this catalog');
    const bytes = files.get(resource.path);
    if (!bytes || bytes.length !== resource.sizeBytes || await sha256(bytes) !== resource.sha256) throw new Error('Fixture asset integrity check failed');
    signal?.throwIfAborted();
    return { reference: { ...reference }, mediaType: resource.mediaType, bytes: new Uint8Array(bytes) };
  } };
}
/** Testing authorization only. Absence of a matching explicit fixture grant denies access. */
export function createFixtureAuthorizer(requirements: readonly CapabilityRequirement[]): AuthorizationPort {
  const allowed = new Set(requirements.map(value => canonicalJson(value)));
  return { async authorize(requirement, signal) {
    signal?.throwIfAborted();
    const granted = allowed.has(canonicalJson(requirement));
    return { allowed: granted, reason: granted ? 'Explicit local fixture grant.' : 'No matching local fixture grant.' };
  } };
}
