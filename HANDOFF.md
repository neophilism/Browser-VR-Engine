# Handoff

## Goal and sequencing

Complete the reusable Browser-VR-Engine first, then the separate XLR8 conference application. The complete approved PR plan is embedded here so another developer can resume without conversation history.

## Source of truth

- `DEVELOPMENT_PLAN.md`: readable complete PR specification.
- `docs/plan/pr-plan.json`: all 145 units, dependencies, deliverables and gates.
- `docs/progress.json`: implementation/verification/merge/deployment state and blockers.
- `ARCHITECTURE.md` and `docs/architecture/approved-architecture.md`: boundaries and full design.
- `ACCEPTANCE.md`, `docs/security/`, and `docs/evidence/`: evidence and review.

## Current implementation

F01 creates the package workspace and durable project record. `packages/core` currently exports package metadata. The SDK consumer imports the built package without browser or conference services. Rendering and all other functional capabilities remain planned.

## Next dependency

After F01 is accepted and its merged evidence recorded, implement F02 CI/evidence safeguards, then F03 shared contracts and qualification fixtures. F04 and F05 may run in parallel after F03. XLR8 remains untouched until R12.

Run `npm run check` before updating status. Do not infer acceptance from a passing unrelated job, a documentation-only PR, a mock provider, or an unavailable hardware test. Record blockers precisely and continue independent ready work.
