# Portable-world media readiness repair

## Actual PR9 outcome

[PR9](https://github.com/neophilism/Browser-VR-Engine/pull/9) passed all four jobs and all three artifact verifiers in candidate run `39166203932`. Separate assistant self review `5564939297` bound head `36588399e28f0e8bb6c28d07ca105639355d4ff1`. Fresh head/base, rules, reviews, checks, mergeability and tree/parents were checked before the expected-head squash merge at `5979457d6f2f69b710bd08af745ef9f1b048d4ca`. The tested merge was `6fc08aa80a676e0ff869415f86b6fef8b0d54782`; both tested and merged trees are `6bb11652bc32b194c50da91007421484e8c8fbbf`.

Main run `39166555145` then **failed**. Foundation and real-service jobs passed, as did desktop 19/19 and emulated XR 10/10. The portable media/animation readiness check timed out: portable 8/9 and the aggregate failed. All three main archives were downloaded and their exact sizes and SHA-256 digests checked. The verifiers run from clean main correctly passed foundation/service and rejected evaluation with exit 1.

The [complete PR9 receipt](portable-integration-ci-39166203932/index.json) retains all 172 original candidate/main files, all eighteen verifier output/command files and the archive/job/merge identities. The real main service sequence ran all nine automation methods, fourteen launcher cases, fifteen finalization cases, six service stages and nine browser checks. Owned shutdown used SIGTERM, no forced kill, and reported stopped. No later pass changes this original failed main result.

## Correction

The old check required independent clocks, native movement and a brief wall-video audio pulse to meet their thresholds in one sample. It also compared a looping video time directly with its pre-activation time. The failed historical report did not retain every operand, so the exact operand that timed out cannot be asserted after the fact.

The new observer retains bounded native samples and records each actual progress milestone during the original twelve-second wait. It recognizes a loop boundary, requires advancing decoded frames, keeps the original clock/movement/RMS thresholds, and captures an actual fresh positive paired audio window even when a later window is silent. Before/last observations remain available on timeout. This is a readiness check; it does not measure audiovisual synchronization or physical audio quality.

## Actual local execution

The canonical run from `2026-10-18T21:19:55.334Z` to `21:21:22.728Z` passed all twelve executable stages. Its separate browser-install stage is explicitly `skipped_local`. The manifest remains `mode: local`, `dirty: true`, `complete: false`, with no collection failures.

| Check | Actual result |
| --- | --- |
| F04 toolkit/source/history/audit | Passed; modern toolkit audit has zero advisories |
| F05 unit/server/import/XR/portable/observer | 94/94 passed, including fourteen observer cases |
| Desktop | 19/19, `run-4n7CVm` |
| Emulated XR | 10/10, `run-YeHpjW`; physical headset/audio false |
| Portable world | 9/9, `run-9nKI4U`; physical headset/audio false |
| F05 toolkit audit | Passed, zero advisories |
| Independent portable verifier regressions | 54/54 passed |

The [original local receipt](portable-readiness-local-2026-10-18/index.json) binds thirty source files, fifteen renderer inputs, eight workspace inputs and four outputs. The portable report SHA-256 is `9526347f8a694dbda007869762757080a3d072a04ddd5bd4db1eb48264a5a704`. Five native progress samples span 286.1 ms after the baseline. The final latest audio window is silent; a previously captured fresh window has input RMS `0.010449478104435288`, above the unchanged `0.01` threshold. The video advances about 0.2216 seconds and decoded frames increase from four to nine. These raw observations exercise the corrected sampling behavior.

The integrated foundation run from `21:24:01.365Z` to `21:24:18.878Z` passed all six stages, including 39 package tests, 350 tooling tests, standalone examples, the packed consumer, sharding and the actual root audit. Its original eight files are retained in the same local receipt.

## Integration gate and remaining work

The [separate self security review](../security/F05-portable-readiness.md) found no remaining blocker in this repair after the actual changed-path checks. Current-head hosted foundation/evaluation/service checks, all artifact verifiers, fresh review/rule/head/base/mergeability checks, safe merge and main verification are still required. Local success does not resolve the failed main gate by itself.

Continue the ten-cycle native-resource check, native coordinate/audio measurements and the other [F05 gaps](../qualification/f05-gap-map.md). The manual Hubs runtime still needs signed-in workflow dispatch. F04/F05 remain blocked, F06 is unselected, and XLR8 remains behind R12. No additional generation provider credential is needed at this stage.
