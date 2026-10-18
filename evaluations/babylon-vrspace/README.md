# Babylon / VRSpace foundation evaluation

This is a runnable, isolated **F05 evaluation** using Babylon 9.30.0, Rapier 0.21.0, browser-native spatial audio, and one unmodified VRSpace module. It demonstrates a real browser courtyard, solid movable props, an animated skinned creature, four simultaneous corner sources and a positional wall video. Its user-activated **Enter VR** path requests an immersive session, uses Babylon XR rendering and tracked head pose, and retains Rapier collision for thumbstick locomotion. **Export world** and **Open world** now carry the complete bounded authored document and every original file into a fresh browser context. It does not complete F05 or select the production engine foundation.

The dependency graph has its own exact lockfile so evaluating a candidate does not add it to the production workspace. The package is private and is not included in the repository's `packages/*` or `examples/*` workspaces. Keep this boundary until the foundation decision and subsequent production adapters are reviewed.

## Run from an engine checkout

F03 must already supply `packages/qualification-fixtures/fixtures`. No fixture assets are copied into this package. Node 24 is required.

```sh
cd evaluations/babylon-vrspace
node run.mjs install
node run.mjs browser-install
node run.mjs build
node run.mjs test-server
node run.mjs test
node run.mjs test-xr
node run.mjs test-world
```

`install` runs `npm ci --ignore-scripts` against the exact evaluation lockfile. The explicit browser install uses the pinned Playwright CLI; it does not install operating-system packages. The build verifies the frozen F03 bytes and the vendored VRSpace module before bundling. It compiles the checked contracts source directly with the evaluation's pinned TypeBox dependency; a root workspace build or incidental root `node_modules` cannot supply that dependency. Desktop, test-only IWER XR, and portable-world tests each start their own loopback server on an available port and close it afterward. A separately running server is unnecessary.

To explore the scene interactively:

```sh
node run.mjs serve
```

Open the printed `http://127.0.0.1:4173` address in a local browser. Click **Enter courtyard & enable audio**, use WASD to walk, drag to look, click a prop to select it, press E to hold/release it, and press Space to throw it. Position fields edit the selected prop. The corner tracks, creature and wall video all use the same listener. On a supported browser, **Enter VR** requests an immersive session from a direct click. The standard left thumbstick moves through the collision controller; the controller ray can select the in-world **EXIT VR** panel. See [XR_SESSION.md](XR_SESSION.md) for exact lifecycle behavior, the test-only emulator adapter, and the remaining headset checks.

Configuration is limited to explicit environment entries:

| Setting | Behavior |
| --- | --- |
| `F03_FIXTURE_ROOT` | Optional fixture directory. The default is the repository's `../../packages/qualification-fixtures/fixtures`, resolved from this package. The same frozen hashes must match. |
| `CHROME_EXECUTABLE` | Optional local Chromium executable. Without it, Playwright uses its installed browser. No workspace-specific runtime path is embedded. |
| `PLAYWRIGHT_BROWSERS_PATH` | Optional browser cache location. The default launcher cache is this package's ignored `artifacts/browsers`. |
| `EVAL_PORT` | Interactive server port, default 4173. Automated browser tests always obtain their own available port. |
| `EVAL_SOFTWARE_RENDERING` | Default uses SwiftShader for reproducible headless diagnostics. Set to `0` to use the browser's default graphics selection; this does not create hardware qualification evidence. |

The launcher gives tools and browser processes a named environment allowlist, empty explicit npm configuration, separate npm/browser caches and temporary files, normal system certificate trust, and necessary proxy/certificate entries. It excludes unrelated credentials, inherited Node flags and arbitrary npm settings. The first isolated dependency attempt failed because the network required the provided proxy and certificate trust; these settings are now retained without disabling TLS verification. It omits HOME and USERPROFILE without changing either parent variable; npm uses explicit empty user/global configuration files and the public registry. No credential or provider access is required.

`node run.mjs audit` audits this evaluation's separate lockfile. Its outcome must be retained alongside the candidate's own CI evidence when the evaluation is integrated. The engine root's dependency audit does not automatically cover a separate evaluation lockfile.

## What the browser checks measure

The harness exercises real Chromium canvas, pointer, keyboard, DataTransfer, WebAudio and Rapier behavior. The historical run in `evidence/2026-10-17-initial` passed 17 checks with zero browser errors; it predates the portable packaging. Fresh runs write distinct `artifacts/runs/run-*` directories and never reuse an earlier result. A failed startup writes a failed-run report in its own directory. The process fails for failed checks, browser errors or failed requests.

The original portable-source rerun is retained in `evidence/2026-10-17-portable`: **17/17 browser checks passed, zero browser errors, zero failed requests, 5/5 server/integrity checks passed, and zero dependency advisories**. Its 15 recorded source fingerprints matched the original portable files at capture. Those original result bytes are preserved; they do not verify this revised source. The captured image was visually inspected. This rerun used the default repository-relative fixture layout in a separate test copy and supplied the existing Chromium through `CHROME_EXECUTABLE`. Its short SwiftShader diagnostic recorded approximately 152 ms p95 frame periods; it is not target-device or capacity evidence.

| Area | Measured behavior |
| --- | --- |
| Rendering and fixtures | 55 declared entities, imported courtyard/props, five-bone creature skin, advancing flap animation, moving creature and attached emitter. |
| Desktop movement and physics | Actual keyboard movement; capsule blocked by a wall and 5 cm barrier; open arch traversable; pointer selection, grab and throw preserve prop identity and solid-floor interaction. |
| Spatial audio | Four corner tracks are simultaneously active. Per-source input and pre-panning analysers measure their calibrated distance gain. Listener rotation changes left/right output emphasis while source coordinates remain fixed. |
| Video | One unmuted native video element supplies both decoded video frames and samples to exactly one MediaElementAudioSourceNode. Pause stops its clock and samples; seek and loop retain the same source identity. |
| Browser graph | Chrome DevTools observes one AudioContext, one listener, five buffer sources, one media-element source and six panners, all connected through the shared output graph. |
| Editing and export | Visible position edits change the prop; an in-session JSON snapshot restores descriptors/transforms; a geometry/material/animation GLB export can be reimported. |
| Drag/drop | A GLB derived from the common prop fixture goes through an actual DataTransfer drop, retains its original bytes and digest, and acquires a visible mesh and conservative dynamic box collider. |
| Real upstream reuse | The unmodified VRSpace AssetLoader loads the shared prop, creates another instance using the same container, and disposes both without leaving cached containers. |
| Cleanup | One cycle closes audio, removes video elements and disposes the scene/render engine. |

The four music sources are measured before HRTF panning, separately from the bird and video. There is no nearest-track switching. The graph is source → distance gain → HRTF panner → source volume → common master → destination; native panner rolloff is zero to avoid applying attenuation twice. No second audio element, duplicate video soundtrack or independent soundtrack clock exists. The Start click records actual activation, but the application deliberately suspends audio first, so this is not proof of normal-device autoplay enforcement.

The fixture reader checks all eight frozen metadata files, including the schema set and comparison tuple, and every catalog resource. It serves only validated bytes. The build records input/output fingerprints; the server refuses stale build records. The local server test also exercises private-path rejection, media ranges, Host/Origin handling, modified fixture bytes, symlink escape rejection and subprocess environment isolation.

The review fixes and their source-bound results are documented in `REVIEW_FIX.md`. The previous audio revision is `evidence/audio-measurement-fix`: paired zero-output AudioWorklet measurements, complete marker-period sampling and synchronized teleported colliders. The earlier `evidence/review-fix`, `evidence/xr-session-lifecycle` and `evidence/xr-finalization-ci` results remain unchanged and apply to their earlier sources.

The current recovered-source capture is [portable-recovery-final](evidence/portable-recovery-final/README.md). The real 13-stage local collector passed all twelve executable stages, including 80 evaluation unit cases, 19 desktop checks, 10 explicitly emulated XR checks and 9 portable-world checks. Both current dependency audits reported zero advisories. The explicit local browser makes the hosted browser-install stage `skipped_local`, and the manifest remains `complete: false`; this is not a hosted acceptance receipt. Separate CI verifier tests passed 175 Node cases and 7 Python methods. Recovery history and earlier development captures are described in [RECOVERY.md](RECOVERY.md).

The adapter exposes `descriptor`, `probe`, `load`, `perform` and `dispose` with the F03 testing-port shape. `load` clones its world before making edits. The general `perform` route executes supported actions but returns `not-run` for assertions that lack a dedicated measurement, and `unsupported` for unimplemented actions. It does not invent passing qualification observations from successful action dispatch.

## Export and import scope

Drag/drop is a bounded local GLB2/self-contained glTF2 evaluation path. The 32 MiB File limit is checked before reading bytes; embedded JSON has a separate 4 MiB limit. Preflight checks safe integer declarations, actual buffer spans, sparse/accessor allocations, graph depth and cycles, repeated draw references, animation keys and image/texture pixels. PNG and JPEG headers must fit the preview's 4096-pixel dimension and aggregate pixel limits. The preview accepts only the material extensions `KHR_materials_unlit`, `KHR_materials_emissive_strength` and `KHR_texture_transform`; optional compression, external resource and imported-audio extensions are rejected before loading. These are deliberately narrow prototype limits, not the engine's final import-format policy. No source files are deleted or replaced during import.

One import runs at a time. Local imports and immersive entry are mutually exclusive in this evaluation so an asynchronous import rollback cannot collect newly created XR resources; leave VR before importing. Assets, original bytes and world entities are published after loading, finite geometry normalization and collider creation succeed. Failed loads dispose their partial scene resources and bodies, revoke the temporary URL and restore asset/entity/map state. Geometry and conservative box colliders use the same normalized local origin, including for oversized models whose geometry is far from the source origin. Session limits bound retained original bytes and the number of local imports. These declared-work budgets do not establish a hard browser/GPU memory ceiling or production hostile-file isolation; that belongs to the planned import service.

Disposal first awaits confirmed native XR session end, including a late permission grant. An end failure remains visible and retryable while the renderer remains owned by that session. Successful disposal then aborts window/canvas listeners, releases pointer capture, disables and clears control callbacks, awaits any active import rollback, closes audio and disposes physics/rendering resources. Fresh browser checks dispatch input after disposal and call disposal twice. The planned ten-cycle memory trend is still unmeasured.

**Export GLB** writes the geometry/material/animation subset. **Export world** writes the bounded canonical authored document, component/media bindings and all original bytes to `.bveworld`. **Open world** validates that carrier before replacing the current instance. Opening `/?world=empty` does not fetch fixture originals. The legacy `snapshotWorld` / `restoreWorld` helper remains a separate in-session transform operation. See [PORTABLE_WORLD.md](PORTABLE_WORLD.md) for exact carrier limits, hierarchy normalization, affine/static collider semantics and retryable cleanup ownership. Physics, animation and media clocks restart when opening authored state. Native-format conversion, general media import, production publication and durable storage remain planned engine work.

## Evidence boundaries and remaining work

All recorded browser execution so far uses Chrome for Testing 151.0.7922.34 through ANGLE/Vulkan SwiftShader in a container without a physical GPU, headset or audio listening setup. The original short run had approximately 145 ms p95 frame periods; it did not meet the 30 Hz reference and is not a capacity benchmark. The recovered bundle is approximately 21.9 MiB unminified because it deliberately exposes the Babylon namespace at the compatibility boundary for the old global module.

F05 remains incomplete. The following have no successful evidence in this package:

- Physical headset/controller input, recenter, seated operation, wall-adjacent head motion, sleep/resume, physical audio and target-device thermal behavior.
- Two connected clients, microphones, SFU voice, reconnect, shared authority or service-stack operation.
- Timed-marker audio/video offset against the 80 ms requirement; native pause/seek/loop routing alone does not establish this.
- The complete 60-second warmup, 180-second workload and three repetitions, or the ten-cycle cleanup/memory trend.
- A complete production RuntimePort, general editor, production world publication or live-session resume, upload/conversion service, tenancy, caching or production performance budgets.

The VRSpace result applies only to `AssetLoader`. No compatibility claim is made for WorldManager, avatar IK, editor, XR helpers, Java services or OpenVidu. The immersive path uses Babylon's own XR helper and camera, with narrow strict-floor and confirmed-end adapters. IWER tests exercise this software path in a real Chromium renderer; they do not qualify physical hardware or VRSpace's XR helper.

## Provenance and integration

`source-pins.json` identifies exact npm versions/integrities, the upstream module commit and the historical browser archive. `vendor/vrspace/provenance.json` records the module's exact byte digest and absence of changes. Upstream license/notice files are preserved in `vendor/vrspace` and `licenses`; see `THIRD_PARTY_NOTICES.md`. F03 originals remain in their owning package.

The root evaluation runner requires separate desktop, emulated XR and portable-world commands and retains their source-bound results; see [CI evidence](../../docs/ci/README.md). It binds fifteen local build inputs, eight checked workspace inputs, four outputs and twenty-eight evaluation sources. This package does not mark F05 accepted or select the foundation. Integration still requires separate security review and current-commit hosted checks. Physical and multi-client qualification remain separate acceptance gates.

Primary sources:

- [Babylon 9.30.0](https://github.com/BabylonJS/Babylon.js/tree/9.30.0)
- [Rapier JavaScript package 0.21.0](https://www.npmjs.com/package/@dimforge/rapier3d-compat/v/0.21.0)
- [VRSpace pinned source](https://github.com/jalmasi/vrspace/tree/61f840a3dd0133fc9d357891f37eb1670b147539)
- [Evaluated VRSpace AssetLoader](https://github.com/jalmasi/vrspace/blob/61f840a3dd0133fc9d357891f37eb1670b147539/babylon/js/core/asset-loader.js)
- [Playwright](https://github.com/microsoft/playwright)
- [Recorded Chrome for Testing archive](https://storage.googleapis.com/chrome-for-testing-public/151.0.7922.34/linux64/chrome-headless-shell-linux64.zip)

