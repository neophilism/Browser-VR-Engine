# Acceptance and release evidence

The complete criteria are in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md). `docs/progress.json` is the machine-readable current record. Every accepted unit must identify its PR, merged commit, verification evidence and security review; deployment and hardware qualification remain separate evidence.

## Current scope

F01 establishes a buildable package workspace, a standalone consumer, the full plan and progress records. It does not establish rendering, VR, physics, media or conference functionality.

Reproduce the initial checks with `npm ci`, `npm run check`, and `npm run example:sdk` on Node 24. F02 adds current-commit CI retention, package-install verification and adversarial gate tests.

## Complete release

R09 is a core beta. R12 requires every engine unit, including expanded/native capabilities and actual required hardware, asset and provider evidence. C26 follows completion of the application and the engine. Missing mandatory evidence keeps the relevant gate incomplete.

Store non-sensitive evidence under `docs/evidence/`; use external protected artifact storage for private source assets, recordings and large traces. Never commit credentials or content from private participants.
