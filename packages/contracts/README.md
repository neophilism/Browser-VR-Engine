# Shared contracts

Renderer-neutral `0.1.0` contracts for fixture worlds, entities, asset revisions, spatial audio, media surfaces, scoped operations, device/workload manifests and foundation qualification. TypeScript types and exported JSON Schema come from the same TypeBox definitions. TypeBox is the only runtime dependency; this package imports no renderer, application, service SDK or asset payload.

```js
import { parseDocument, exportJsonSchemas } from '@browser-vr-engine/contracts';

const result = parseDocument('world', receivedJsonText);
if (!result.ok) {
  console.error(result.diagnostics); // Stable code, JSON pointer and readable message.
} else {
  const world = result.value;
  // Resolve the declared asset IDs through the host-supplied AssetPort.
}
const schemas = exportJsonSchemas();
```

`parseDocument` bounds UTF-8 JSON bytes before parsing. `validateDocument` accepts ordinary JSON data and checks property descriptors before validation. `requireDocument` throws on diagnostics. Structural JSON Schema alone does not perform reference, component-version, hierarchy or playback-identity checks; use the validation API at ingestion boundaries.

## Compatibility and coordinates

Document schema version `0.1.0` is explicit and provisional. Unsupported document versions fail. Namespaced optional component payloads are preserved as bounded data; unsupported required components fail. A built-in component with an unsupported version is only preserved when optional. Adapters must skip unsupported optional component versions instead of interpreting them using another version's schema. `knownComponents` permits a host to declare additional names it supports; the host owns the extension's version and data validation. It is not an authorization grant.

World coordinates use meters, a right-handed basis, +Y up, XYZW quaternions and column-major matrices. The identity camera/listener faces -Z. Asset front metadata is separate. A local matrix composes as `parentWorld * local`. Tagged affine matrices preserve signed scale and shear; the qualification schema rejects singular or nonfinite transforms. Production import/baking behavior belongs to the asset pipeline, not these reference helpers.

The analytic math API supplies matrix composition, point conversion, listener axes and attenuation with an explicit smooth fade to zero at cutoff. It does not instantiate physics or an audio graph. The validation limits are a small fixture profile, not a maximum supported venue or model size for the future product.

## Ports and qualification

`RuntimePort`, `AssetPort`, `AuthorizationPort`, `PersistencePort`, `ClockPort` and `TransportPort` describe injection boundaries. They do not implement services or make a client-provided actor scope trustworthy. A production authorizer must establish identity and scope independently. Do not store signed delivery URLs or credentials in fixture documents.

`runScenario` passes immutable cloned world/scenario inputs to the candidate `QualificationAdapter`, dispatches the declared steps, validates returned observations and disposes the adapter after load/action failures or cancellation. A browser harness supplies `waitForTick`; omission means logical replay only. Candidate adapters own their mutable scene state. `assessQualification` binds records to input hashes, requires every named assertion and rejects evidence methods that are not allowed by the scenario. It checks record consistency; it cannot attest that an adapter's claimed hardware observation really occurred. Actual evidence artifacts and review remain required.

`createTraceAdapter` emits only `simulation` observations. Its successful action replay cannot satisfy the supplied browser, service or physical-device scenario. `canonicalJson` is stable JSON encoding for fixture hashing, not a digital-signature standard or a sandbox for executable JavaScript proxies.

From the workspace root, run `npm run build`, then `npm test --workspace @browser-vr-engine/contracts`. Tests include compile-time negative type checks and independent analytic/runtime assertions.
