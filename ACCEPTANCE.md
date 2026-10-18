# Acceptance and release evidence

The complete criteria are in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md). `docs/progress.json` is the machine-readable current record. Every accepted unit must identify its PR, merged commit, verification evidence and security review; deployment and hardware qualification remain separate evidence.

## Current scope

F01 establishes a buildable package workspace, a standalone consumer, the full plan and progress records. It does not establish rendering, VR, physics, media or conference functionality.

Reproduce foundation checks with `npm ci --ignore-scripts`, `npm run check`, `npm run example:all`, `npm run test:consumer`, and `npm run test:sharding` on the pinned Node 24 version. `npm run check:dependencies` requires a real registry response. `npm run ci:local` writes a local preview with actual command outcomes; local or dirty evidence cannot establish hosted acceptance.

F02 provides current-commit CI retention, package-install verification and adversarial gate tests. Acceptance additionally records an actual failed required check blocking procedural acceptance, a repaired current candidate with passing required checks, a separate head-bound security review, the observed merge and applicable main checks. These facts must not be inferred from the workflow source or fabricated from a local fixture. Preserve actual repository protections without claiming settings were configured by YAML. See [CI evidence and merge procedure](docs/ci/README.md).

F03 adds versioned contracts, reference math and reproducible original assets. Its frozen scenario and measurements protocol supplies common inputs to both foundation candidates; the fixture-only trace host explicitly leaves runtime and physical-device qualification incomplete. See [F03 evidence](docs/evidence/F03.md) and [protocol](docs/qualification/f03.md).

F04/F05 provide isolated runnable foundation evaluations. The required `engine-evaluations` job checks the current toolkits and a real Chromium subset, with its own command, source, fixture and artifact identity. The final aggregate requires both `engine-foundation` and `engine-evaluations`. Passing that subset or merging its tools does not accept F04/F05: their complete common-world, service and actual-headset requirements remain separate blockers. See [F04](docs/evidence/F04.md), [F05](docs/evidence/F05.md) and the [evaluation reproduction guide](evaluations/README.md).

## Complete release

R09 is a core beta. R12 requires every engine unit, including expanded/native capabilities and actual required hardware, asset and provider evidence. C26 follows completion of the application and the engine. Missing mandatory evidence keeps the relevant gate incomplete.

Store non-sensitive evidence under `docs/evidence/`; use external protected artifact storage for private source assets, recordings and large traces. Never commit credentials or content from private participants.
