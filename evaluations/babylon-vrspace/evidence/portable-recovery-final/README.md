# Current recovered-source local evidence

This directory preserves the original output of `node scripts/ci/evaluate.mjs --local` on 2026-10-18, 20:53:07.178–20:54:33.727 UTC. `evaluation/manifest.json` is copied unchanged. `inventory.json` hashes all 31 collected report files, that manifest and the full collector stdout. No report field or original payload was rewritten.

The 13-stage graph exited0: all twelve executable stages passed, with only the explicitly local browser-install stage marked `skipped_local`. The checked-out commit was `fe9a0af1db58ea87ce702f9a0a85cb51d561adf1` plus the staged recovered implementation; the manifest truthfully records `dirty: true`, `mode: local`, `complete: false`, and no collector failures. Its detailed source/build fingerprints bind the actual code that ran. It is a local diagnostic, not a fabricated hosted or clean-commit receipt.

| Check | Actual result |
| --- | --- |
| F04 toolkit tests | 15 named Node cases and 20 Python cases passed |
| F04 retained history | 68 captured files passed integrity verification; no fresh Hubs runtime claim |
| F05 unit tests | 80 named cases passed, zero skipped |
| Desktop browser | `run-yrunNw`, 19/19 |
| Emulated XR | `run-cAb3oT`, 10/10; IWER remains test-only |
| Portable authored world | `run-lBXHkM`, 9/9 |
| Dependency audits | Both actual current F04/F05 reports have zero reported advisories |
| Collector binding | Actual command times, unique new run directories, source/build/fixture closure and artifact hashes accepted |

All three browser reports have zero recorded page errors, failed requests, diagnostic overflow and finalization failures. The build binds 15 evaluation inputs, 8 workspace inputs and 4 outputs; each report binds 28 evaluation sources. The portable export and re-export contain identical bytes. All eleven declared frozen originals plus the actual derived imported GLB are physically present; the affine variant adds the exact two checked entities.

The independent CI parser regenerated the imported model from the pinned original and checked the full authored content, component/normalization associations and carrier hashes. It did not rely on an artifact-supplied list of expected sources or trust only the report's own assertions. Shared validation rejects non-null fatal errors, missing checks, stale sources, changed outputs, malformed screenshots, unexpected files and rehashed content substitutions.

This run does not supply physical-headset/audio, target-device performance, ten-cycle memory, production publication, service persistence or live shared-media evidence. The existing service job and fresh hosted current-head checks remain required for integration. The separately preserved `portable-recovery-development/ci-development` directory contains the actual175 Node/7 Python verifier test logs and their explicitly limited development receipt.
