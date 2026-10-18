# F05 remaining qualification work

This map was read from PR7 candidate `18418567ea1edeb4758c5e1ec845499f9acea4e3` on 2026-10-18. It describes the isolated Babylon/VRSpace evaluation, not an accepted production engine. That candidate's first hosted run passed foundation and the desktop/emulated-XR subsets but failed service startup. See [the retained failed run](../evidence/xr-integration-failure-39152832852/index.json). Later corrections and runs retain their own identities.

The [F03 protocol](f03.md), [frozen scenario](../../packages/qualification-fixtures/fixtures/scenario.json), thresholds and workload definitions remain unchanged. The dedicated candidate checks do not yet produce a complete `QualificationResult` accepted by `assessQualification()`. F06 remains unselected; XLR8 remains blocked until R12.

## Common scenario

| Assertion | Exercised subset | Remaining evidence |
| --- | --- | --- |
| Render | Real WebGL2, original asset digests, 55 declared entities, five-bone creature, advancing animation | Read back declared static reference anchors and scale against the 1 mm threshold. Counts and visibility alone do not establish coordinate fidelity. |
| Traverse | Rapier wall, arch and 5 cm barrier probes; actual desktop keyboard movement | Bind the prescribed local operations to the common assertion. Shared authority is separate. |
| Select | Actual pointer selection and visible feedback | Shared selection and permissions are separate. |
| Grab/release | Actual keyboard grab/throw, body-state transition, nonzero velocity and floor interaction | XR object grabbing and shared authoritative ownership/physics remain absent. |
| Audio | Four music sources, equal-distance balance, approach gain, turn panning, moving bird/emitter agreement | Continuous approach/fade/cutoff through 10–14 m; actual output localization and conversation plus video. |
| Play/pause | Native wall video with one attached audio source; advancing/stopped time and measured silence | Shared playback, pause and state reconciliation across clients. |
| Seek | Actual native seek and retained picture/audio-element ownership | Timed-marker audiovisual offset against the 80 ms threshold is unmeasured. |
| Edit | Actual position fields and Apply control update the prop and body | General component/material editing and shared authorization are separate. |
| Round trip | In-memory transform restoration and separate GLB geometry/material/animation export | Portable edited-world reload into a fresh instance with original bytes, components, media and import normalization. |
| Reconnect | Real released service, two independent sessions, presence and bidirectional poses, rejoin and controlled socket reconnect | Shared F03 object-state comparison, missed edits, durable identity, ownership and server-restart persistence. |
| XR | Native immersive-session implementation with explicitly emulated lifecycle, stereo, head/listener, controller movement and exit checks | The frozen common assertion requires a physical headset. Emulation cannot satisfy it. |

Source: [candidate runtime](../../evaluations/babylon-vrspace/src/main.js), [desktop checks](../../evaluations/babylon-vrspace/browser-checks.mjs), [XR checks](../../evaluations/babylon-vrspace/test/xr-browser-checks.mjs), and [released-service checks](../../evaluations/vrspace-service/browser-checks.mjs).

## Next bounded implementation: portable world reload

Reuse `Evaluation.load(world, context)` and the existing contracts/asset port. The candidate already reconstructs mesh, collider, animation, media-surface and audio-emitter components. Its export must enumerate all eleven `world.assets` references, including declared assets that were never decoded; exporting only the loaded cache would omit data.

`restoreWorld()` currently requires existing nodes and applies transforms. It does not create a new scene or reconstruct components. The portable path needs a fresh factory/host and validated input, with no dependence on the old instance, fixture server or caches. Contracts-package reuse must have an explicit reproducible build/package path in the standalone evaluation rather than rely on incidental root dependencies.

Dropped models currently keep exact original bytes but store centering/scaling in ephemeral `imports[]` metadata. That normalization must become part of the portable representation and be reapplied so visual geometry and colliders remain aligned. Preserve authored canonical matrix/TRS and hierarchy semantics; the current snapshot's conversion of everything to TRS is not generally lossless for shear. Edited data also needs a derived content identity rather than retaining an unchanged revision.

The importer must validate bounded bytes, manifest structure, identities, references, hashes, supported required semantics and safe model resource declarations before decoding or publishing the new scene. Hash equality establishes identity, not safe content. Preserve uninterpreted optional data where the contract allows it; reject unsupported required semantics explicitly. This should be an isolated evaluation carrier, not a premature production file-format commitment.

The meaningful browser demonstration is to make the prescribed visible edit, include a dropped off-center/scaled model, export, then import in a fresh browser context while blocking fixture fallback requests. Compare canonical identities/transforms/components and original asset digests, exercise reconstructed collision and animation configuration, and activate wall-video audio with a real user gesture to establish one positional route. Re-export and compare required authored data. Reject tampered, missing, duplicate, oversized or unsafe inputs before scene publication.

An authored-world reload can restart animation/media according to documented startup semantics. It must not claim live-session resumption: current world documents do not encode rigid-body velocities, route segment, video playhead or paused state.

## Subsequent independent gaps

**Ten-cycle lifecycle:** current desktop/XR suites exercise a disposal cycle, not the frozen ten load/unload cycles and baseline comparison. The fresh-instance seam can support counts of candidate-owned scenes, listeners, timers, object URLs, audio contexts, videos, worklets, physics objects and asset maps across ten cycles. Unavailable memory counters must remain unavailable rather than become zero. Physical-device behavior remains separate.

**One shared prop:** the service adapter currently renders only `User` objects. Props, colliders, edits, bird motion and wall media are independently local. A bounded next transport demonstration can create one identified F03 prop through the real SDK, observe server-issued identity and Add events in both clients, edit its transform, compare visual/collider projections, reconnect, compare received state, and remove it. That establishes transport; denied-edit, conflicting revision and server-restart tests are still needed for authorization, authority and persistence.

**A/V timing:** decoded video, actual seek and attached audio ownership are implemented, but the timed-marker offset remains unmeasured. Measure the frozen synthetic marker before making an audiovisual synchronization claim.

**Workload and devices:** the frozen profiles require a 60-second warm-up and three 180-second samples, deterministic observer/actions, 1280×720 at effective DPR1, 60 Hz simulation, 20 Hz poses/snapshots and the declared browser/microphone workload. Current short functional runs do not execute this protocol. The released-service adapter deliberately renders at hardware scaling 2 and sends poses every 100 ms; it makes no frame-rate claim. The 20/50/100 participant profiles, actual microphone/SFU path and hardware profiles remain unexecuted. Protocol clients cannot substitute for real decoders or microphone publishers.

Long-run collectors and deterministic routes can be implemented without physical hardware, but software-renderer results must remain environment-specific diagnostics. Ordinary-laptop, premium-desktop and selected-headset records are still target templates, not observed devices.
