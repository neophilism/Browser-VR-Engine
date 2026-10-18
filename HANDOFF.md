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

F03 is accepted after PR #4, current-candidate review/checks, merge and main verification; see `docs/evidence/F03.md`. Its tests and both standalone hosts are included in the canonical CI sequence, and its tarballs are checked outside the workspace. PR #5 integrated the isolated F04/F05 candidate evaluation tools; continue their complete comparison against the frozen F03 inputs. The released VRSpace server/client pair has separate real two-client presence/pose/reconnect evidence; full shared-world/media/ownership, target-device and physical-headset qualification remain incomplete for the candidates. The generated-object/NPC and funding extension adds G01–G16 and C27–C41; every added unit remains planned. The extension itself was merged in [PR #3](https://github.com/neophilism/Browser-VR-Engine/pull/3) at `2102c28685b781902230a33be184f1d63a5baad1`, with main Engine CI run `39073384307` passing. That records the design, not those features being implemented. F04 and F05 may run in parallel after F03. XLR8 remains untouched until R12. Pending scope additions must enter the plan explicitly; a fixed historical card count does not control readiness.

Run `npm run check` before updating status. Do not infer acceptance from a passing unrelated job, a documentation-only PR, a mock provider, or an unavailable hardware test. Record blockers precisely and continue independent ready work.

## Accepted evaluation integration

PR #5 merged as `bec6cb1f36256c9bafd8504bb6111733c8e6f858` after final-head review, all required jobs and independent verification of both downloaded artifacts. Main run `39148025401` passed all three applicable jobs. The complete receipt is in `docs/evidence/F04-F05-integration.md`. It includes the first failed run and the repaired 19-check browser result. F04/F05 remain incomplete and F06 is not selected.

## Current service and immersive VR work

PR #6 merged at `315b0283f598b1bef7f2c6c38c90c01d562fe6c5` after all four PR jobs and all three downloaded artifacts passed. The released-service job actually executed all nine automation methods, 14 launcher cases, 15 finalization cases, the service dependency audit, nine two-browser checks and clean owned shutdown. Its main service job also passed. However, main run `39149232337` failed the separate desktop bird-animation check (18/19); the aggregate correctly failed. PR6 is merged with a pending main-verification repair. Original passed and failed reports are retained in `docs/evidence/service-evaluation-ci-39148921581/` and `docs/evidence/main-evaluation-failure-39149232337/`.

This follow-up implements user-activated immersive WebXR entry, tracked rendering/listener pose, controller movement through Rapier, ray-based exit and session lifecycle/disposal. Test-only IWER exercises ten emulated XR checks; physical headset/audio qualification remains false. Desktop and XR finalizers now await fingerprinting and cleanup before calculating status. The repaired bird check waits within a ten-second deadline for observed frame/physics/clip progress, retains both samples, and preserves the original assertions. Its fresh desktop run passed 19/19. Earlier source-bound XR captures remain historical; the required new hosted XR run must bind the current 23 source files, 12 build inputs and three outputs.

The integrated local foundation sequence passed all six stages, 39 package tests and 198 tooling tests. Separate source reviews found no remaining blocker. See `docs/evidence/F05-XR.md` and `docs/security/F05-XR.md`. Next: publish the reviewed candidate, pass all required jobs, verify all three downloaded artifacts against the exact tested commit, merge safely and verify a successful subsequent main run. The old main failure is not resolved by a local pass or a workflow rerun.

Full shared-world/media/ownership, sustained resource lifecycle, target-device and physical-headset/audio qualification remain incomplete. F04's legacy Hubs graph has a known failing 106-entry audit, and its real backend/runtime evaluation still needs work. Neither an emulated headset nor merged evaluation tooling accepts F04/F05 or selects F06. Complete the engine through R12 before implementing XLR8.

## Audit authorization and credentials

On 2026-10-18 the owner explicitly authorized engine dependency audits to send package names and versions from evolving lockfiles to `https://registry.npmjs.org`, locally and in reviewed GitHub Actions CI. The earlier automatic approval-review rejection is resolved; its history and payload record remain in `docs/security/evaluation-audit-egress.md`. Keep every required audit stage and treat registry errors or high/critical advisories as failures requiring resolution. Earlier captures retain their original outcomes.

`MESHY_API_KEY` is the owner-configured GitHub Actions repository secret, not an environment secret. No key value, credential validity or paid provider call has been checked. Ordinary PR/main workflows do not reference provider secrets. No additional generation credentials are needed at this foundation stage; request them when the corresponding implemented provider integration is ready for live verification.
