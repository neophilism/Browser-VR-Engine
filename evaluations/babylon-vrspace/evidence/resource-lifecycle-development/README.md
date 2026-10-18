# Local resource-lifecycle development evidence

This directory preserves actual local observations for the F05 same-page lifecycle slice. It does not mark the foundation selected, physical devices qualified, or the required hosted checks accepted. The final integrated candidate still needs the complete fourteen-stage evaluation graph, including the separate desktop19, emulated XR10, portable9 and lifecycle6 browser runs.

## Original browser run

`run-hH5Mir` contains byte-for-byte copies of the four browser outputs, the original outer command receipt and its stdout/stderr log. The command was `node run.mjs test-lifecycle` in the evaluation directory, from **2026-10-18 21:22:24.911 UTC to 21:22:57.778 UTC**, and exited zero. The outer runner observed an empty run-directory set before execution and exactly `run-hH5Mir` afterward. The original files remain in the ignored artifact directory as well; they were not rewritten to describe a later run.

The browser was Chromium **151.0.7922.34**, driven by the pinned Playwright **1.62.1**, using SwiftShader at 1280 × 720 and DPR 1. All physical-GPU, headset and audio-device qualification flags are false. The launcher used its existing credential-free environment and local loopback server. No provider call or external asset request was part of this run.

All **six checks passed**. Exactly **ten** instances loaded, activated and unloaded in the same document and browser context. Each used the unchanged 55-entity courtyard and all eleven original asset payloads from the same 645,112-byte portable carrier. Browser fixture fallback attempts were zero. Physics, native animation, decoded video and all six spatial-audio sources had observed activity before each unload. Each of the 32 runtime counters, 15 scene collection counters and 17 independently observed native live-resource counters returned to the declared empty baseline after every cycle. The stable-target listener census returned to its original single `world-file` change listener, and actual unloaded keyboard, pointer, resize and disabled-start input did not allocate another instance.

The journal contains 6,792 native events and 3,547 CDP WebAudio events. It observes ten successful native AudioContext closures and sixty worklet-port closures. CDP separately observes ten created contexts, ten closed contexts and **zero wrapper-destruction events**; destruction is not required to occur on a fabricated garbage-collection deadline. Native WebGL calls observe 1,080 buffer allocations, 140 texture allocations and 100 program allocations with no remaining live handles at the end. These are API-resource observations, not GPU-memory byte measurements. Raw heap and DOM diagnostics remain in the report; they do not have an invented acceptance tolerance. No video wrap occurred during this short run; wrap-aware progress has deterministic test coverage.

The intentionally allocated negative-control Blob URL was visible to the native observer while runtime asset maps remained empty. Its live count caused baseline comparison to reject the snapshot; revoking it restored the baseline. No extra world instance was created for this control.

## Frozen identity and review scope

The profile was frozen before the first browser run with SHA-256 `1af428fe913003657f4b8d4ec55cf275f78780cc9fec6123ba4b60514b5c527c`. The report binds 34 evaluation source files, 15 local build inputs, eight transitive workspace inputs and four build outputs. Those source and output hashes matched the checked files after the run. The manifest, candidate metadata, original carrier identity and raw event/profile hashes are retained in the report, rather than inferred from a success label.

The author's separate post-run source review covered host operation ownership, failed-cleanup retention, readonly snapshots, bounded observer data, weak native identities, wrong-context GL deletion, actual port/context closure, input teardown, browser cancellation, released CDP handles and finalization order. No remaining blocker was identified in this bounded slice. Another agent separately reviewed the runtime/observer/harness source and the CI replay implementation. Those reviews are agent reviews, not human approval or hosted execution evidence.

Export/download actions and their temporary URL/timer path are outside these ten cycles. Physical devices, long-duration memory trends, complete shared-state/media behavior and the overall F05 comparison remain separate qualification work.

## Deterministic verification and retained history

`current-unit-stage` retains the actual `node run.mjs test-server` invocation at **21:26:20.542–21:26:22.158 UTC**. All **111 named cases passed**, with zero skipped or cancelled cases. That stage includes the current lifecycle observer and the exact copied media-progress helper tests, plus the existing server, parser, carrier, audio and XR lifecycle boundaries. It used scoped loopback access and made no external request.

`unit-history` keeps earlier genuine development runs with their original exit statuses. The initial sandbox run registered 96 cases and failed one loopback-listen case with `EPERM`; the corresponding scoped-loopback run passed 96. Those earlier runs predate the final observer/media test inventory. The later focused observer/media run passed 31 cases. They are historical observations, not replacements for the current 111-case result.

`ci-development` retains the independent collector/replay receipts and verifier-test logs at their recorded source scope. The final combined verifier suite passed **333 named cases**, with zero skips; the pure service-binding suite passed **seven methods**. Its rehashed negative cases reject changed source/build identities, incomplete cycles, retained resources, contradictory native/CDP events, foreign carrier data, invalid media traces, an activation beyond the frozen 20-second deadline and audio windows beyond their sampled native clock. The final independent replay of the original browser run reports no errors. The longest observed activation was 1,948.6 milliseconds, and all 2,029 retained endpoint/trace windows ended at or before their sampled clock.

Earlier CI test and replay logs are kept as history, including sandbox process restrictions and a test-fixture assertion-order correction. A local receipt remains `complete: false`, even when its current-data, command, directory and event replay checks pass. It does not synthesize the other thirteen stages or a hosted-current-commit result.
