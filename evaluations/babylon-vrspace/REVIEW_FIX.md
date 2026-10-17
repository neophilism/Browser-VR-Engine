# F05 import and cleanup review fixes

This revision addresses the blocking findings in the original portable evaluation. It is an assistant implementation and self review, followed by local automated verification. It is not human approval, GitHub acceptance, foundation selection, or completion of F05.

## Changes and evidence

| Finding | Resolution | Verification |
| --- | --- | --- |
| The 32 MiB limit ran after reading the file; tiny declarations could request excessive allocations. | Check File size before `arrayBuffer`; bound JSON, actual embedded buffers and spans, accessor and sparse allocations, graph size/depth, repeated draw references, animation keys, and image/texture pixels. Reject unsupported decoder, URI-bearing and audio extensions before loading. | Eighteen named import-policy tests exercise valid glTF/GLB plus the rejection paths without making the dangerous allocations. |
| Loader or collider failure left partially published assets, objects, bodies and URLs. | Serialize imports; retain partial resources in the scene so they can be tracked; publish asset/entity state only after loading, finite normalization and collider creation succeed. Roll back new resources, bodies and maps and revoke the temporary URL on rejection. Report cleanup errors rather than silently claiming recovery. | Real Chromium first loads an invalid material after allocating meshes/materials, then injects a failure after creating a real Rapier body. Both restore pre-import resource/body/map/world counts and revoke one URL. |
| Disposal left callbacks attached to freed rendering and physics state. | Abort window/canvas listeners, release pointer capture, clear and disable control callbacks, await any active import rollback, close audio and dispose physics/render resources. | The browser dispatches keyboard, pointer, resize, drop and button events after disposal and repeats disposal. State stays disposed, controls stay inert, caches/maps are cleared and no browser errors occur. |
| Off-center oversized models need geometry and collider origins to agree. | Normalize root translation and scale together; retain a full SHA-256 asset identity and original bytes. | Actual DataTransfer imports an off-center, oversized derivative of the frozen prop. Its geometry center in collider-local coordinates differs by approximately 0.0000013 metres; node/body positions agree within 0.00001 metres. |

The launcher omits HOME and USERPROFILE; it does not rewrite the parent's variables. npm receives explicit empty temporary user/global configurations and the public registry. Tools and Chromium receive a named environment allowlist. No provider credentials, provider calls or new browser/native device installation were needed for this run.

## Prototype limits

The policy currently caps one file at 32 MiB, its JSON at 4 MiB, declared decoded buffers at 64 MiB and accessor allocations at 64 MiB. Separate caps cover 2,048 nodes/primitives, 512 meshes, two million referenced vertices, four million referenced draw elements and 100,000 animation keys. PNG/JPEG image dimensions are at most 4,096 pixels; aggregate source-image and texture-reference budgets are each 16,777,216 pixels. One local session retains at most 32 imported objects and 128 MiB of original files.

Only `KHR_materials_unlit`, `KHR_materials_emissive_strength` and `KHR_texture_transform` are enabled by this preview's import policy. These declared-work limits reduce known allocation paths; they are not a hard process/GPU memory quota or the production sandboxed conversion service. The final engine's broader formats and native conversion goals remain in the approved plan.

## Import and cleanup result retained unchanged

The earlier review-fix run is `evidence/review-fix`, completed at **2026-10-17T22:19:53.219Z**. Its bytes are retained for those sources; the later audio measurement revision has separate evidence below.

- **23/23 named server and import-policy tests passed.** The runner uses explicit test files with `--test-isolation=none`.
- **19/19 real Chromium checks passed**, with zero browser errors and zero failed requests.
- The separate dependency audit reported **zero advisories** against the unchanged evaluation lockfile.
- All **18 source fingerprints**, all **10 build-input fingerprints**, both built output hashes, and the frozen fixture identities were checked against this revision. The image was visually inspected.
- The two original dated evidence directories remain byte-for-byte unchanged and apply to their original sources. Their results are not reused as verification of the fixes.

## Current-source audio measurement result

The integrated run exposed two measurement problems and an invalid calibration pose. Independent analyser reads could compare different audio render blocks: a controlled fixed-listener diagnostic measured up to **0.129297 dB** of apparent imbalance even though all four gain parameters were identical. Reading equal `AudioContext.currentTime` values did not fix that race, and that provisional approach was rejected. Separately, the video fixture emits a 100 ms pulse once per second, so a 600 ms observation could miss the entire pulse.

The revised graph adds an analysis-only AudioWorklet per source, with **two inputs and zero outputs**. It reads the original and post-distance-gain signal in the same processing block. Windows span at most 20 ms. The processor allows one unacknowledged message and at most 128 pending windows; the receiver retains at most 128 windows per source. Explicit acknowledgments prevent an unbounded MessagePort backlog. The receiver rejects malformed or replayed windows; invalid-message and dropped-window counters are capped, and the browser checks require both to be zero. Per-sample gain extrema are checked along with paired RMS, so a wrong gain cannot disappear into a window average. All existing audible routes remain unchanged, including the single wall-video element/source route. The video check now requires more than 1.3 seconds of contiguous actual audio windows. Settling waits use the audio clock with bounded wall-time deadlines. Neither the **0.1 dB** gain threshold nor the **0.01 RMS** pulse threshold was relaxed.

The paired meter then exposed a separate setup error: the requested 1.6 m eye pose could start the capsule without controller clearance and leave the listener off center after collision correction. `setPlayer` now propagates changed body positions to colliders before controller queries. Calibration uses the fixture's valid 1.65 m starting eye height and verifies that the actual listener remains within 1 mm of horizontal center. There is no global floor or height clamp. General safe-spawn placement and recovery from already penetrating poses remain outside this prototype; the caller must supply a valid initial pose. A minimal real Rapier floor regression retains the stale-collider negative control and checks 120 subsequent grounded steps.

The final run is **`evidence/audio-measurement-fix`**, completed at **2026-10-17T22:43:15.469Z**:

- **30/30 named local tests** and **19/19 Chromium checks passed**, with zero browser errors and zero failed requests. The tests include malformed channel/frame/numeric windows, a deliberate wrong-gain measurement, and a stalled receiver that must bound its pending messages and clear them on disposal.
- A separate 4,000-inspection diagnostic covered 640 distinct paired source windows and 465 crossed audio-clock boundaries. The paired meter's maximum imbalance was approximately **0.000000030 dB**, with no invalid or dropped windows or failures. Independent analyser reads reached **0.099766 dB** in that final diagnostic; their earlier reproduced **0.129297 dB** failure remains in the historical diagnostic file.
- The actual listener was approximately `[0.000007637, 1.615090, 0.000007637]`. The video peak measured **0.0107427 RMS** across 75 contiguous windows covering **1.306122 seconds**.
- All **19 source fingerprints**, **11 build-input fingerprints** and **three output fingerprints** matched the final source and build. The image was visually inspected.
- The failed baseline, rejected timestamp-only diagnostic and failed noncentered-pose run are retained with clear filenames. The three earlier evidence directories remain unchanged. Historical passes do not verify this revision.
- A requested fresh public-registry dependency audit was rejected by automatic approval review because it would disclose repository-derived dependency metadata without the required end-user approval. The rejected request did not execute, and no passing audit is claimed for this revision. The lockfile is unchanged; its previous audit remains historical evidence. A fresh audit is pending that approval.

The current source still uses one native audio context and one shared listener. This is assistant implementation and self review with local automated evidence, not human approval or hosted candidate acceptance.

## Integration gate

The evaluation has its own lockfile outside the production workspaces. Candidate CI must explicitly run `node run.mjs install`, `browser-install`, `build`, `test-server`, `test` and `audit`; retain that run's reports and screenshot; verify the exact expected check IDs and source/build/fixture keys; and attach current-commit CI provenance. A local Chrome override is recorded as such and is not a hardware qualification claim. Historical reports or a subset of source fingerprints cannot replace a fresh candidate run.

Real immersive-session entry is still unimplemented: the Check VR button reports capability detection only. Physical headset and actual audio-device checks, multi-client/SFU service integration, AV-marker offset, the full timed workload and ten-cycle memory trend also remain unqualified. The separate upstream-service evaluation must retain its own scope and evidence.
