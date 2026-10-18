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

PR #6 merged at `315b0283f598b1bef7f2c6c38c90c01d562fe6c5` after all four PR jobs and all three downloaded artifacts passed. The released-service job actually executed all nine automation methods, 14 launcher cases, 15 finalization cases, the service dependency audit, nine two-browser checks and clean owned shutdown. Its main service job also passed. However, main run `39149232337` failed the separate desktop bird-animation check (18/19); the aggregate correctly failed. At that point, PR6 was merged with a pending main-verification repair; the subsequent PR7 resolution is recorded below. Original passed and failed reports are retained in `docs/evidence/service-evaluation-ci-39148921581/` and `docs/evidence/main-evaluation-failure-39149232337/`.

This follow-up implements user-activated immersive WebXR entry, tracked rendering/listener pose, controller movement through Rapier, ray-based exit and session lifecycle/disposal. Test-only IWER exercises ten emulated XR checks; physical headset/audio qualification remains false. Desktop and XR finalizers now await fingerprinting and cleanup before calculating status. The repaired bird check waits within a ten-second deadline for observed frame/physics/clip progress, retains both samples, and preserves the original assertions. Its fresh desktop run passed 19/19. Earlier source-bound XR captures remain historical; the subsequent PR7 hosted runs supplied the required fresh 23-source, 12-input and three-output bindings.

The integrated local foundation sequence passed all six stages, 39 package tests and 198 tooling tests. PR7's first hosted run `39152832852` passed foundation and all 19 desktop / 10 emulated-XR checks; those downloaded artifacts passed independent exact-tested verification. Its actual service startup failed when Alpha tried to place its avatar during pending XR preparation. The aggregate correctly failed. All 78 original files are retained in `docs/evidence/xr-integration-failure-39152832852/`.

The corrected PR7 head `b3bb098d2be04d7c848378e710c01426aac9004e` passed all four jobs and three uploads in run `39154237536`. All three downloaded archives passed digest checks and the checked-in verifiers from clean tested commit `0d8fefc38c6acbc5c792b387f15dd9afcf80a480`. Separate self-review `5564279753` is bound to that head. Fresh head/base, tree/parents, rules, checks, review and mergeability were confirmed before the expected-head squash merge.

PR7 merged as `647240bd5493940f60caaec246970a86a2a4238f`, tree `dc7fbb0b7f8a573ce6556e97d845ff3bc9998be5`. Main run `39154772861` passed all four jobs and three uploads; all three main archives also passed digest checks and exact-clean-main verification. Both runs passed desktop 19/19, emulated XR 10/10, all nine service automation methods, 14 launcher cases, 15 finalization cases, six service stages and nine two-browser checks. Owned service shutdown used SIGTERM without forced kill. The [complete receipt](docs/evidence/xr-integration-ci-39154237536/index.json) retains all 156 original candidate/main files. This subsequent main pass resolves the repair verification; it does not relabel either earlier failed run. See `docs/evidence/F05-XR.md` and `docs/security/F05-XR.md` for implementation and review.

Continue the Hubs runtime diagnostic and remaining engine-only qualification map in `docs/qualification/f05-gap-map.md`; the recovered portable authored-world implementation and its new evidence are recorded below.

Full shared-world/media/ownership, sustained resource lifecycle, target-device and physical-headset/audio qualification remain incomplete. F04's legacy Hubs graph has a known failing 106-entry audit, and its real backend/runtime evaluation still needs work. Neither an emulated headset nor merged evaluation tooling accepts F04/F05 or selects F06. Complete the engine through R12 before implementing XLR8.

## Accepted Hubs runtime tooling and pending dispatch

The [F04 runtime proposal](docs/evidence/F04-runtime.md) now has a pinned four-service launcher, native two-browser harness and separate reviewed-main manual workflow. Its complete 83-file source proposal was integrated without conflicts; the existing `engine-ci.yml` is unchanged. Local pure/policy/history checks and [separate source review](docs/security/F04-runtime.md) are recorded. The integrated local foundation sequence passed all six stages, 39 package tests and 269 tooling tests with zero skips. The original 43-file preparation, historical editor index and the count-parser failure remain preserved with their original meanings.

PR8 passed all four jobs and three uploads in `39156160278`; all three downloaded archives passed digest and exact-tested verification. Self-review `5564391735` binds head `d94b4ecb5a5484591bc87c05db8e2ade78f2790b`. Fresh head/base/review/rules/checks/mergeability preceded the expected-head merge at `9088586c9f46f0e740cfe67b3d8b00614ed446eb`, with the same tree `6ce2aa09bd6e3dc9b55d94cb4f719a2dc550c115`. Main `39156404932` passed all four jobs and three uploads, and all main archives passed exact-clean-main verification. The [receipt](docs/evidence/hubs-runtime-integration-ci-39156160278/index.json) retains all 156 original files and main-verifier records.

Next: use a signed-in GitHub session to perform one explicit manual `diagnose` dispatch and verify its actual success or failure evidence. The connector lacks workflow dispatch; the browser workflow page was reachable but signed out. No backend, new watchdog-process or browser execution is implied by the merged runner. A mandatory audit failure keeps the runtime workflow failed even if useful service observations succeed. Continue portable-world and other ready F05 evaluation work in parallel. F06 remains unselected and XLR8 remains untouched.

A browser-tool timeout on 2026-10-18 was followed by a transient filesystem rollback. Published commits and Actions archives survived; PR8's exact archives were restored, not regenerated. The earlier uncommitted portable-world handoff and its reports were unavailable in the recovered filesystem. A bounded search found no copy. Reconstructed portable work receives new source identities, reviews and actual verification; missing historical report bytes cannot support current acceptance. The first incomplete source checkpoint was preserved on `feat/f05-portable-world-recovered` at `fe9a0af1db58ea87ce702f9a0a85cb51d561adf1` before longer testing. It does not qualify F05.

## Recovered portable authored-world integration

The recovered implementation is preserved by checkpoints `fe9a0af1db58ea87ce702f9a0a85cb51d561adf1` and `a017afcfcf10eb1ae188fc883cdd040c1518566d`. It validates and packages all declared original bytes, preserves authored hierarchy and imported normalization, reconstructs solid colliders, animation and positional media in a fresh context, and rejects unsupported required semantics before publication. Async load/import/dispose and cleanup-retry ownership were repaired during review. The carrier is an isolated evaluation format; it restarts live clocks rather than saving a live session.

The fresh canonical local run on 2026-10-18 passed twelve executable stages: F04 toolkit/source/tests/history/audit, F05 install/build/80 tests, desktop 19, emulated XR 10, portable 9 and F05 audit. Its thirteenth browser-install stage is explicitly skipped locally because a verified existing Chrome was used. The manifest remains local, dirty and incomplete for hosted acceptance. All 31 collected report files and source/build/workspace bindings were checked. Earlier development reports, the final collector and the failed/repaired CI-development cases are preserved separately. See [portable evidence](docs/evidence/F05-portable.md), [implementation](evaluations/babylon-vrspace/PORTABLE_WORLD.md) and [separate assistant self review](docs/security/F05-portable.md).

The integrated local foundation sequence also passed all six stages, 39 package tests and 350 tooling tests with no skips; its eight original files are retained in `docs/evidence/portable-integration-local-2026-10-18/`.

PR9 passed all four candidate jobs and all three artifact verifiers in run `39166203932`, then merged as `5979457d6f2f69b710bd08af745ef9f1b048d4ca` after exact-head self review and fresh merge gates. Main run `39166555145` failed the portable media-readiness check (8/9); foundation, desktop 19, emulated XR 10 and the real service passed. The [receipt](docs/evidence/portable-integration-ci-39166203932/index.json) retains all 172 original candidate/main report files and the correct failed evaluation-verifier result.

The [readiness repair](docs/evidence/F05-portable-readiness.md) records independent native progress milestones within the original twelve-second bound, handles video wrap, retains a fresh positive audio pulse and preserves timeout operands. Its new actual local sequence passed all twelve executable stages, 94 units, desktop 19, emulated XR 10 and portable 9; the separate browser installer is explicitly omitted locally. Thirty source files are bound. The [separate post-verification self review](docs/security/F05-portable-readiness.md) found no blocker. Next: publish the exact repair candidate, verify all four hosted jobs and all three artifacts, check fresh merge gates, merge safely and verify main. Local success does not resolve the failed main gate. The repair's integrated local foundation sequence passed all six stages, 39 package tests and 350 tooling tests, with original reports retained alongside the browser evidence. The next ready F05 gaps include ten-cycle ownership/resource evidence, static anchors, audio cutoff and measured A/V timing, plus shared state and required physical/workload evidence. F04/F05 remain blocked; F06 and all XLR8 implementation remain pending.

## Audit authorization and credentials

On 2026-10-18 the owner explicitly authorized engine dependency audits to send package names and versions from evolving lockfiles to `https://registry.npmjs.org`, locally and in reviewed GitHub Actions CI. The earlier automatic approval-review rejection is resolved; its history and payload record remain in `docs/security/evaluation-audit-egress.md`. Keep every required audit stage and treat registry errors or high/critical advisories as failures requiring resolution. Earlier captures retain their original outcomes.

`MESHY_API_KEY` is the owner-configured GitHub Actions repository secret, not an environment secret. No key value, credential validity or paid provider call has been checked. Ordinary PR/main workflows do not reference provider secrets. No additional generation credentials are needed at this foundation stage; request them when the corresponding implemented provider integration is ready for live verification.
