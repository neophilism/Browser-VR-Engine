# Immersive session evaluation

This revision implements actual user-activated `immersive-vr` entry through Babylon 9.30.0. It is still the isolated F05 candidate evaluation. It does not complete F05, select the production foundation, or establish physical headset compatibility.

## Operator flow

The scene prepares the Babylon XR helper after loading the frozen F03 courtyard. Preparation only checks support and allocates the helper; it does not request an immersive session. In a secure browser with immersive VR support, **Enter VR** makes the browser request directly from the user's click and activates the existing audio context. The browser still controls permission and device selection.

The session uses a required `local-floor` reference space, the existing WebGL renderer and canvas, Babylon's XR camera and per-eye render targets, and the world's right-handed meter coordinates. A standard left `xr-standard` thumbstick requests up to 1.8 meters per second of horizontal movement. The existing Rapier character controller resolves that requested movement against the same solids used on desktop. A radial dead zone suppresses small stick drift. Unsupported layouts, lost positional tracking and hidden/blurred sessions request no artificial horizontal movement.

Tracked head movement drives the XR camera and the **same one spatial audio listener** already used by the four corner tracks, moving bird and wall video. The listener takes the current rendered frame's pose before artificial movement queues a reference-space offset for the next frame. A small head-overlap query shows a visible warning when a tracked head approaches virtual geometry. It does not clamp real head motion. That warning and stopping thumbstick movement while overlapping are software behaviors; user comfort and wall-adjacent headset operation require real-device testing.

Up to four connected input sources receive simple locally generated rays. Point a ray at the head-relative **EXIT VR** panel and select it to leave. Escape and the browser/device's own session-ending control also return to desktop. The collision body's valid position becomes the desktop camera position; a physical lean through a virtual object is not reused as a desktop teleport. The next entry can reuse the helper after the previous session has ended.

**Cancel VR** marks an outstanding permission request cancelled. WebXR does not expose an AbortSignal for `requestSession`, so this cannot dismiss the browser's permission prompt. If the browser grants that cancelled request later, the evaluation ends the new session before starting its XR renderer. A visible denial or startup error can be dismissed and retried. Disposal waits for outstanding preparation and late permission results, then requires confirmed session end before freeing the renderer, scene or audio graph. If native session end rejects, the error remains visible and disposal remains retryable.

Local imports and immersive entry are mutually exclusive in this evaluation. That prevents an asynchronous import rollback from treating newly created XR cameras, controller lines or labels as partially loaded asset resources. Leave VR before importing. The existing desktop import, edit, grab, throw and export controls retain their own scope.

## Narrow Babylon adaptations

`src/xr-session.js` owns the lifecycle and wraps two public session-manager methods. Babylon remains responsible for the XR render loop, camera/rig updates and restoration of the desktop framebuffer.

1. The pinned manager normally substitutes viewer space and an estimated 1.7 meter height if floor space fails. This evaluation requires real floor space and surfaces failure instead. The initial virtual floor is derived from the collision capsule's current base and controller clearance. No world-wide height clamp or invented tracked-user height is introduced.
2. The pinned manager's exit wrapper can suppress a native `session.end()` failure and still run cleanup. The adapter uses confirmed native end for both explicit exit and Babylon's initialization-error path. An unconfirmed or rejected end cannot free resources still owned by a live session.

All temporary session listeners, HUD textures/materials/meshes and controller lines are removed on end. The cached helper and its observers are disposed when the evaluation closes. The normal scene GLB export excludes all cameras and presentation-only XR controls.

## Software evidence and its limits

`node run.mjs test-server` includes the lifecycle tests in `test/xr-session.test.mjs`. They test permission denial, missing activation, duplicate entry, late grants after cancellation, missing poses, visibility, native end/retry, disposal while entry is pending, and strict floor behavior. Synchronous exceptions are included so a settled rejected promise cannot leave the controller permanently busy.

`node run.mjs test-xr` runs a separate **emulated-browser** scenario in real Chromium using exact-pinned, test-only IWER 2.6.0. The application bundle does not import IWER, and the loopback server does not expose its modules. The harness injects the runtime before the application starts. It records user activation at the request, actual Babylon stereo render targets, camera/body/listener coordinate agreement, head translation/rotation, collision-controller movement against the frozen thin barrier, head-overlap feedback, a controller select event, desktop return and active-session disposal. Reports explicitly keep `physicalHeadset:false`, `physicalAudio:false` and `qualificationStatus:incomplete`.

The published IWER 2.6.0 `getOffsetReferenceSpace` implementation forwards a transform object to an internal constructor that expects a matrix. A negative control reproduces 16 non-finite matrix entries. The test injection forwards `originOffset.matrix` instead and verifies the expected translation. This small compatibility adapter exists only in the harness; installed upstream bytes and native browser APIs are unchanged. If the pinned defect changes, the negative control fails so the adapter must be reviewed. IWER also emits its `select` event on trigger press; the test observes that event's result and does not claim real controller timing. Synthetic permission denial and delayed grants do not reproduce a physical browser's permission UI.

Fresh XR reports use separate `artifacts/xr-runs/run-*` directories. The 19-check desktop scenario continues to use `artifacts/runs/run-*`. Both record the exact build, all 23 executable-source fingerprints and frozen fixture digests. Build records contain 12 input paths and the same three output files: main bundle, source map and audio worklet. A stale bundle is rejected before serving.

Both harnesses fingerprint their sources and attempt browser and server shutdown before taking the final diagnostic snapshot. A late browser error, failed request, fingerprint failure or cleanup failure produces a failed report and nonzero exit. The shared finalizer has deterministic negative controls for those cases. The final XR browser check also holds real audio cleanup open to verify that concurrent disposal callers wait, then resolves a delayed activation to verify that it cannot restore disposed state or UI.

The root evaluation runner includes a separate required `f05-xr-browser` stage after the desktop stage. It requires one freshly created XR run directory, the exact ten emulated check IDs, the actual command/time/stdout binding, a complete bounded stereo PNG, current source/build fingerprints and frozen fixtures. Downloaded evidence is checked again against the reviewed source. Neither a historical report nor a desktop pass satisfies this stage. The report continues to state that physical qualification is incomplete; emulated execution does not waive any physical-device gate.

`evidence/xr-session-lifecycle` retains the earlier 22-source capture unchanged. The follow-up in `evidence/xr-finalization-ci` contains fresh 23-source desktop and XR captures after the disposal/finalization corrections, plus the actual local XR collector result. Local collection does not establish hosted CI acceptance. The previously observed dependency audit remains identified with its original command and unchanged lockfile; it is not relabeled as a new registry request.

Physical headset/controller/browser combinations, recenter, seated use, actual output audio, sleep/resume, user comfort, long sessions, memory trends and target-device frame budgets remain unqualified. XR object grabbing/throwing, teleportation, snap turn, richer UI and multiuser state are not implemented by this change. Their approved engine work remains required; this session path is not a substitute for it.

## Primary references

- [Babylon XR experience helper](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/webXR/webXRExperienceHelpers.md)
- [Babylon XR camera](https://doc.babylonjs.com/features/featuresDeepDive/webXR/webXRCamera)
- [Pinned Babylon source](https://github.com/BabylonJS/Babylon.js/tree/9.30.0); the installed `@babylonjs/core` source was inspected for both adaptations.
- [WebXR Device API](https://www.w3.org/TR/webxr/)
- [IWER source and MIT license](https://github.com/meta-quest/immersive-web-emulation-runtime)
- [IWER runtime installation](https://meta-quest.github.io/immersive-web-emulation-runtime/getting-started.html)
- [IWER 2.6.0 exact package](https://www.npmjs.com/package/iwer/v/2.6.0); the separate lockfile and `source-pins.json` retain its integrity and test dependencies.
