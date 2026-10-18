# F05 immersive-session implementation and animation observation repair

This follow-up implements the candidate's immersive WebXR path and makes its desktop and emulated-XR evidence required in CI. It remains an isolated foundation evaluation. F05, physical headset/audio behavior and the production engine are not accepted by these results.

## Implemented behavior

The user-activated Enter VR path requests `immersive-vr` with `local-floor`, uses Babylon's XR rendering and tracked head pose, and updates the same spatial-audio listener used on desktop. Standard left-thumbstick movement uses the existing Rapier controller. Controller rays can activate the in-world exit control. Lifecycle handling covers denial, cancellation followed by a late grant, initialization errors, visibility changes, native session end, return to desktop and disposal. An unsuccessful native end retains resource ownership and an explicit retryable error.

Concurrent disposal now waits for the same pending task. Late audio-activation completion or rejection cannot update disposed UI. Both browser harnesses finish fingerprint collection and attempt browser/server closure before calculating their final status; late errors, failed requests, overflow and cleanup errors fail the result. See [the session implementation and reproduction guide](../../evaluations/babylon-vrspace/XR_SESSION.md) and [separate review](../security/F05-XR.md).

The canonical evaluation has twelve stages, including a separate `f05-xr-browser` command. Collection and downloaded verification require the exact 19 desktop and 10 emulated XR checks, distinct fresh run directories, actual command/stdout/time bindings, all 23 source fingerprints, 12 build inputs, three outputs and complete bounded screenshot data. Physical headset/audio flags remain false. The required service verifier also now requires the twelfth renderer input, `src/xr-session.js`; mutations cover omitting or changing it and omitting the shared finalizer.

## PR6 service result and main failure

[PR6](https://github.com/neophilism/Browser-VR-Engine/pull/6) passed all four jobs in run `39148921581`. All three archives were downloaded, digest-checked and verified from the exact tested commit `9fd972c0426973588f143fc5856cf5255ff2595b`, tree `c6cea257e15291b3f67fed9eabcea99b1749f0ca`. The service result includes all nine automation methods, 14 launcher cases, 15 finalization cases, six actual service stages, nine two-browser checks and clean owned shutdown. [The complete retained record](service-evaluation-ci-39148921581/index.json) identifies the artifacts, review, merge and subsequent main result.

PR6 merged as `315b0283f598b1bef7f2c6c38c90c01d562fe6c5`. Its main push `39149232337` passed foundation and service, but the desktop job passed 18 of 19 checks: the bird position was identical across the check's fixed 300 ms wait. The aggregate correctly failed. The [unchanged failed artifact](main-evaluation-failure-39149232337/index.json) is retained. This is merged work with a pending main-verification repair, not a completed acceptance record.

The old report's overall frame periods were 681.7 ms p95 and 962.6 ms p99, but it retained no frame counters for that interval. An observation before another rendered update is plausible; the exact cause is unproven. The repair waits at most ten seconds for observed scene-frame, physics-step and animation-clip progress. It retains both samples even on a responsive-page timeout. It does not move the bird, advance its clock or step physics. The original position-change, clip-change and `1e-5` meter source-follow assertions are unchanged.

## Local verification and retained identities

The frozen XR implementation passed 50 F05 unit cases, 94 targeted CI/verifier cases, desktop run `run-10daOn` (19/19), emulated XR run `run-SbVbXB` (10/10), and the actual XR command collector. Those [original captures](../../evaluations/babylon-vrspace/evidence/xr-finalization-ci/verification.json) remain tied to their earlier browser-harness source. The older 22-source [session captures](../../evaluations/babylon-vrspace/evidence/xr-session-lifecycle/verification.json) are also unchanged.

After the bird observation repair, [fresh desktop run `run-PZDmUP`](../../evaluations/babylon-vrspace/evidence/bird-observation-fix/verification.json) passed 19/19 with zero errors, failed requests, overflow or finalization errors. All 23 source hashes match that repaired source. The observation records scene frame 61→62, physics steps 123→128, clip frame 8.802→13.248 and bird x −1.9338→−1.8596. Emitter distance was about `5.207e-8` meters. The XR runtime and build inputs did not change in that repair; the next hosted run must still collect a fresh XR report bound to the current full source set.

The integrated local foundation sequence passed all six stages, including 39 package tests, 198 tooling tests, both examples, the packed consumer, sharding and the actual root dependency audit. This dirty-worktree preview is not hosted acceptance. The changed F05 lockfile's earlier actual zero-advisory audit remains recorded with its original command; required hosted root, F04, F05 and service audits still run for the new candidate.

Separate read-only reviews found no remaining blocker in the XR runtime, finalization, new CI contracts or narrow bird-observation repair. Current-head hosted checks, all three downloaded artifacts, the final head-bound review, safe merge and a successful subsequent main run are still required. No provider secret or paid API was used. Full world roundtrip, authoritative shared physics/editing, SFU media, measured audiovisual synchronization, real hardware and target-device performance remain outstanding.
