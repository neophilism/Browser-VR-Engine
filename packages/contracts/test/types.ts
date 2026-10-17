import type { AssetRef, EvidenceMethod, ScenarioStep, WorldFixture } from '@browser-vr-engine/contracts';

const method: EvidenceMethod = 'physical-headset';
const kind: AssetRef['kind'] = 'model';
const units: WorldFixture['coordinates']['units'] = 'meters';
const step: ScenarioStep = { id: 'grab', action: 'grab', tick: 0, assertions: ['held'], targetId: 'object' };
void [method, kind, units, step];

// @ts-expect-error Methods cannot widen into arbitrary strings.
const wrongMethod: EvidenceMethod = 'pretend-hardware';
// @ts-expect-error Asset kinds remain a closed union.
const wrongKind: AssetRef['kind'] = 'plugin-code';
// @ts-expect-error Canonical units remain the literal meters convention.
const wrongUnits: WorldFixture['coordinates']['units'] = 'feet';
// @ts-expect-error Grabs require an explicit target; another action cannot supply it implicitly.
const missingTarget: ScenarioStep = { id: 'grab', action: 'grab', tick: 0, assertions: ['held'] };
void [wrongMethod, wrongKind, wrongUnits, missingTarget];
