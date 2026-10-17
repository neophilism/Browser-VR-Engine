import type { ActorScope, AssetRef, AssertionObservation, CapabilityRequirement, EvidenceMethod, ListenerDescriptor, OperationEnvelope, QualificationScenario, ScenarioStep, WorldFixture } from './schemas.js';

export interface Diagnostic { code: string; path: string; message: string; }
export interface ResolvedAsset { reference: AssetRef; mediaType: string; bytes: Uint8Array; }
export interface AssetPort { resolve(reference: AssetRef, signal?: AbortSignal): Promise<ResolvedAsset>; }
export interface AuthorizationPort { authorize(requirement: CapabilityRequirement, signal?: AbortSignal): Promise<{ allowed: boolean; reason: string }>; }
export interface PersistencePort {
  read(worldId: string, scope: ActorScope, signal?: AbortSignal): Promise<WorldFixture>;
  commit(operation: OperationEnvelope, signal?: AbortSignal): Promise<{ revision: string }>;
}
export interface ClockPort { readonly domain: string; nowSeconds(): number; }
export interface TransportPort {
  connect(supportedVersions: readonly string[], signal?: AbortSignal): Promise<{ selectedVersion: string }>;
  send(operation: OperationEnvelope, signal?: AbortSignal): Promise<{ requestId: string; acknowledged: boolean }>;
  dispose(): Promise<void>;
}
export type RuntimeState = 'created' | 'loading' | 'ready' | 'running' | 'suspended' | 'disposed' | 'faulted';
/** A future runtime implements these ports. F03 does not instantiate a renderer or service. */
export interface RuntimePort {
  readonly state: RuntimeState;
  load(world: WorldFixture, signal?: AbortSignal): Promise<void>;
  start(): Promise<void>; suspend(): Promise<void>; resume(): Promise<void>;
  unload(): Promise<void>; dispose(): Promise<void>;
  setListener(listener: ListenerDescriptor): void;
}
export interface CapabilityObservation {
  feature: string; status: 'available' | 'unavailable' | 'unverified'; method: EvidenceMethod; detail: string;
}
export interface QualificationContext {
  readonly world: WorldFixture;
  readonly scenario: QualificationScenario;
  readonly assets: AssetPort;
  readonly signal?: AbortSignal;
}
/** Shared testing port, deliberately independent of both production candidate stacks. */
export interface QualificationAdapter {
  readonly descriptor: { readonly id: string; readonly version: string };
  probe(): Promise<readonly CapabilityObservation[]>;
  load(world: WorldFixture, context: QualificationContext): Promise<void>;
  perform(step: ScenarioStep, context: QualificationContext): Promise<readonly AssertionObservation[]>;
  dispose(): Promise<void>;
}
