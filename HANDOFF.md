# Handoff

## Goal and sequencing

Complete the reusable Browser-VR-Engine first, then the separate XLR8 conference application. The complete approved PR plan is embedded here so another developer can resume without conversation history.

## Source of truth

- `DEVELOPMENT_PLAN.md`: readable complete PR specification.
- `docs/plan/pr-plan.json`: approved units, dependencies, deliverables and gates.
- `docs/progress.json`: implementation/verification/merge/deployment state and blockers.
- `ARCHITECTURE.md` and `docs/architecture/approved-architecture.md`: boundaries and full design.
- `ACCEPTANCE.md`, `docs/security/`, and `docs/evidence/`: evidence and review.

## Current implementation

F01 created the package workspace and durable project record. `packages/core` currently exports package metadata. The SDK consumer imports the built package without browser or conference services. F02 adds the actual foundation CI workflow, adversarial plan/evidence/policy tests, an independent packed-package consumer, sharding checks and retained command reports. Rendering and all other functional capabilities remain planned.

The F02 hosted failure demonstration, current-candidate review, merge and applicable main checks must be observed before acceptance. See [CI documentation](docs/ci/README.md); the presence of workflow files is not evidence that a hosted run or server-side protection happened.

## Next dependency

Finish F02's current-candidate and merge evidence, then follow the latest approved plan for F03 shared contracts and qualification fixtures. F04 and F05 may run in parallel after F03. XLR8 remains untouched until R12. Pending scope additions must enter the plan explicitly; a fixed historical card count does not control readiness.

Run `npm run check` before updating status. Do not infer acceptance from a passing unrelated job, a documentation-only PR, a mock provider, or an unavailable hardware test. Record blockers precisely and continue independent ready work.
