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

## Reviewable branch sequence

The foundation evaluation candidate is saved on `feat/foundation-evaluations`, commit `64f095d6b65530ca57a97de26f7929593032a51d`, based on accepted F03 main `64c3dbfc8818c4ebaac64f94103f26815e539c96`. Its source-bound local compilation/tests/browser evidence is retained in `docs/evidence/foundation-evaluations-local-2026-10-17/`. Required audits, PR-triggered hosted checks and merging remain blocked as described below.

The separate `feat/vrspace-service-evaluation` follow-up starts from that candidate. It adds released-server evaluation source and manual evidence, plus an explicitly unqualified automation proposal. See `docs/evidence/F05-service.md` and `docs/security/F05-service.md`. Do not treat the existing two-toolkit CI job as coverage for this third package. After audit authorization, complete all supervisor lifecycle test methods on Linux with the required procfs/pidfd/subreaper interfaces, execute the full service automation, add and exercise a required service CI path, and retain current head/base/tested/tree/run evidence before merging the service follow-up. Keep the manual and automation results distinct. Neither branch accepts F04/F05 or selects F06.

`MESHY_API_KEY` is recorded as an owner-configured GitHub Actions repository secret, not an environment secret. No key value, credential validity or paid provider call has been checked. The current ordinary PR/main workflows do not reference provider secrets. No additional generation provider credentials are required at this foundation stage; request them when the corresponding implemented provider integration is ready for live verification.

## Current audit approval blocker

A fresh dependency audit was rejected by automatic approval review, then rejected again after offline verification of the exact public-dependency payload. The stated requirement is explicit end-user authorization to send repository-derived package names and versions to the npm registry. See `docs/security/evaluation-audit-egress.md` and its payload record. Do not retry the audit indirectly through the evaluation runner, service automation or GitHub Actions. Complete unaffected local checks and prepare the reviewable branch; creating a PR triggers the rejected audit and therefore waits for this approval. Retain existing audit results as historical only. No additional NPC credentials are needed for this gate.
