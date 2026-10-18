# Separate self security review: F05 immersive sessions and evidence

This is an assistant self-review of the isolated evaluation changes, not an independent human approval or a production-security certification. It supplements [the foundation review](F04-F05.md) and [released-service review](F05-service.md). The exact published head and review identity belong in the PR's commit-bound review and later acceptance receipt.

## Runtime and disposal

The normal runtime uses native WebXR and Babylon's rendering integration. IWER and its additional dependencies are confined to the test injection; the observed normal bundle/source map excludes the emulator. Third-party notices and complete license texts accompany the pinned test dependencies. No provider credentials are required or forwarded.

The session owner handles cancellation, delayed grants, initialization failure, native end and teardown. A failed native end is not presented as successful release. Disposal callers share the outstanding task, and asynchronous audio activation/rejection checks lifecycle state before updating UI. The listener follows the same tracked pose as the rendered head; the tests do not establish physical output localization, tracking comfort or device compatibility.

Review found that the desktop/XR runners previously calculated success before all asynchronous fingerprint/cleanup work settled. The shared finalizer now attempts all cleanup, retains errors, then reads final diagnostics and determines status. Deterministic late-event and cleanup-failure cases exercise those exact failures. The new required collector and independent verifier also reject nonempty finalization errors and diagnostic overflow.

## Required evidence

The XR command is a separate mandatory stage, with a distinct fresh directory and actual stdout/time/process result. Its ten checks explicitly use emulation. Collection checks current built bytes; downloaded verification recomputes source and fixture identities and validates retained report/build/screenshot bytes. The inventory is exact and bounded. Missing, extra, altered, stale or substituted XR evidence cannot complete the evaluation. No emulator result sets physical-headset/audio qualification to true.

The released-service build contract now includes `src/xr-session.js`, matching the twelve actual build inputs. The existing synthetic verification suite rejects its removal/hash substitution and removal of the finalizer source. These synthetic cases establish verifier behavior only. The actual service job remains required with its real audit, ownership checks and cleanup.

## Main animation-check correction

The first main run after PR6 really failed the bird check; its unchanged artifact is retained. The narrow correction replaces the fixed 300 ms observation window with a bounded wait for actual scene/simulation/clip progress. It retains the original position-change, clip-change and source-follow assertions and does not control or advance the bird. Before/after diagnostics remain available on timeout. The failed report lacks interval counters, so its exact scheduling cause remains unproven.

Fresh desktop evidence and source hashes were inspected separately from the author. The repaired runner hash is `ffe27331ea779a2b8e81ca17cbce34359c8dc52b12541c89e67c5699b1c45850`. No remaining source blocker was found in this correction. Current hosted results and subsequent main verification remain necessary; the local pass does not erase the failed main run.

## Service-startup correction

The first PR7 run passed the desktop/XR subsets but exposed a real service-startup race: general `busy` status included a pending native capability query and blocked Alpha's initial placement. The complete failed run remains in `docs/evidence/xr-integration-failure-39152832852/`. The correction separates desktop-pose ownership from preparation rather than changing the service's checks or timing.

Review verified that entry sets ownership synchronously before hooks and the native request, and keeps it through pending/cancelled grants, active rendering, failed/unconfirmed native end and disposal. A separately found synchronous pre-request hook failure now clears ownership before publishing an error, so no nonexistent session can permanently lock desktop placement. Deterministic cases assert zero requests after that failure and successful retry. The native-support hold in the browser is test instrumentation; it does not substitute a device or count as headset evidence.

The old-runtime negative control rejected both Alpha/Beta placements during preparation. Final local evidence is 55/55 cases, 19/19 desktop and 10/10 emulated XR with unchanged required check counts, complete source inventories and zero late diagnostics. Separate source reviews found no remaining blocker in the five-file correction. The real released-service run, current-head review, artifact verification and subsequent main checks remain required.

## Reviewed source identities

| Source | SHA-256 |
| --- | --- |
| `src/main.js` | `e6bbf4e37463959a687810ff0a713c524a40815188dbe5a9a050ea37a1fdbc9b` |
| `src/xr-session.js` | `fefeae1a64899d6552a7420e09b388c88d2b59dfbd75e05fc5f2ffb126972c64` |
| `browser-checks.mjs` | `db8caa0a2773af74f6c5b32c42c3f49c60c9980e9b5bcc0ce78c9d10f6bfbd5c` |
| `test/xr-browser-checks.mjs` | `352baf7b329a11429821e15a67dd9b88876fcba93b05d31c87e6cc124ec10305` |
| `test/xr-session.test.mjs` | `fdf726cf251d04c09030805f3214f35652187f43629d6586a9312c7409ec3d55` |
| `test/browser-finalize.mjs` | `0c48a4c12bbf0fa425ccebd89fc5267c099acce2c4091e25e2e62e0ecaf0e3a3` |
| `scripts/ci/evaluate.mjs` | `e75fac3f4caf94979441966e268e9f9d1fcdc0708be9425574bfd90dd2c5ca29` |
| `scripts/ci/evaluation-evidence.mjs` | `038dd622cc8ead442028115a2b61efd0f18679cf5b7b45397eb716f3c21a3b66` |
| `scripts/ci/verify-evaluation-evidence.mjs` | `073ac2569de3164577c7eb4e105d20c96ddb1571d26dfbdf3e3d5aeb46a2befe` |

The full foundation remains incomplete. This review does not qualify user authentication, shared authority, media authorization, hostile production content, real headset/audio behavior or conference capacity.
