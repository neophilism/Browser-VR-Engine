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

## Reviewed source identities

| Source | SHA-256 |
| --- | --- |
| `src/main.js` | `6477331950d33d2574d4672ca7dced7f1ebfcaabecf399aa42828f4812c9f01c` |
| `src/xr-session.js` | `234a4f478a8f984b2dd4b02450604193c54d58a3554e96cc23d7ee0e768d182f` |
| `test/browser-finalize.mjs` | `0c48a4c12bbf0fa425ccebd89fc5267c099acce2c4091e25e2e62e0ecaf0e3a3` |
| `scripts/ci/evaluate.mjs` | `e75fac3f4caf94979441966e268e9f9d1fcdc0708be9425574bfd90dd2c5ca29` |
| `scripts/ci/evaluation-evidence.mjs` | `038dd622cc8ead442028115a2b61efd0f18679cf5b7b45397eb716f3c21a3b66` |
| `scripts/ci/verify-evaluation-evidence.mjs` | `073ac2569de3164577c7eb4e105d20c96ddb1571d26dfbdf3e3d5aeb46a2befe` |

The full foundation remains incomplete. This review does not qualify user authentication, shared authority, media authorization, hostile production content, real headset/audio behavior or conference capacity.
