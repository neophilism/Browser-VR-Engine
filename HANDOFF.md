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

F01 created the package workspace and durable project record. `packages/core` currently exports package metadata. The SDK consumer imports the built package without browser or conference services. F02 adds the actual foundation CI workflow, adversarial plan/evidence/policy tests, an independent packed-package consumer, sharding checks and retained command reports. F03 adds `@browser-vr-engine/contracts`, `@browser-vr-engine/qualification-fixtures` and an independent public-export host. They implement bounded document validation, canonical transforms/audio reference math, capability-scoped ports, reproducible original assets and immutable scenario/evidence handling. Production rendering and the remaining engine capabilities are still planned.

F02 passed the deliberate hosted failure demonstration, repaired-candidate review/checks, merge and applicable main checks; its accepted receipt is in docs/evidence/F02.md. See [CI documentation](docs/ci/README.md); the presence of workflow files is not evidence that a hosted run or server-side protection happened.

## Next dependency

F03 is accepted after PR #4, current-candidate review/checks, merge and main verification; see `docs/evidence/F03.md`. Its tests and both standalone hosts are included in the canonical CI sequence, and its tarballs are checked outside the workspace. After acceptance, integrate the isolated F04/F05 candidate evaluation work and compare the frozen F03 inputs. The released VRSpace server/client pair has separate real two-client presence/pose/reconnect evidence; full shared-world/media/ownership, target-device and physical-headset qualification remain incomplete for the candidates. The generated-object/NPC and funding extension adds G01–G16 and C27–C41; every added unit remains planned. The extension itself was merged in [PR #3](https://github.com/neophilism/Browser-VR-Engine/pull/3) at `2102c28685b781902230a33be184f1d63a5baad1`, with main Engine CI run `39073384307` passing. That records the design, not those features being implemented. F04 and F05 may run in parallel after F03. XLR8 remains untouched until R12. Pending scope additions must enter the plan explicitly; a fixed historical card count does not control readiness.

Run `npm run check` before updating status. Do not infer acceptance from a passing unrelated job, a documentation-only PR, a mock provider, or an unavailable hardware test. Record blockers precisely and continue independent ready work.

## Audit authorization and current execution

On 2026-10-18 the owner explicitly authorized the engine's dependency audits to send package names and versions from evolving lockfiles to `https://registry.npmjs.org`, locally and in reviewed GitHub Actions CI. This resolves the earlier automatic approval-review rejection. See `docs/security/evaluation-audit-egress.md` for the scope and unchanged historical payload record.

Resume fresh audits, current-candidate PR checks, separate head-bound review, safe merge and applicable main verification. Keep every required audit stage and treat registry errors or high/critical advisories as failures requiring resolution. Earlier blocked/successful captures remain historical. The foundation comparisons and the separate released-service proposal still have their documented runtime, automation and physical-device qualification requirements. No additional NPC credentials are needed at this stage; `MESHY_API_KEY` remains the owner-configured repository Actions secret for a future implemented provider integration.
