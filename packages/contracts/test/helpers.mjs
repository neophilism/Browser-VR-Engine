import { CONTRACT_VERSION, COORDINATES } from '../dist/index.js';

export const digest = '0'.repeat(64);
export const trs = (translation = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0, 1]) => ({ kind: 'trs', translation, scale, rotation });
export const entity = (id = 'object') => ({ id, name: id, transform: trs(), components: [] });
export const world = () => ({
  kind: 'world-fixture', schemaVersion: CONTRACT_VERSION, id: 'test-world', revision: digest,
  coordinates: { ...COORDINATES }, assets: [], entities: [entity()], requiredFeatures: []
});
export const operation = payload => ({
  kind: 'operation', schemaVersion: CONTRACT_VERSION, requestId: 'request-1', payload,
  requirement: { scope: { principalId: 'actor', tenantId: 'tenant', projectId: 'project', worldId: 'test-world' }, operation: 'bve:edit', targetId: 'object' }
});
export const scenario = (methods = ['real-browser']) => ({
  kind: 'scenario', schemaVersion: CONTRACT_VERSION, id: 'scenario-1', worldId: 'test-world', tickRate: 60,
  assertions: [{ id: 'position', feature: 'bve:edit', description: 'Observe edited object position.', allowedMethods: methods }],
  steps: [{ id: 'edit-1', action: 'edit', targetId: 'object', tick: 12, transform: trs([1, 2, 3]), assertions: ['position'] }]
});
export const assets = { async resolve() { throw new Error('This scenario has no assets'); } };
