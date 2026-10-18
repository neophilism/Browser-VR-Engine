# Babylon / VRSpace foundation evaluation

This is a runnable, isolated **F05 evaluation** using Babylon 9.30.0, Rapier 0.21.0, browser-native spatial audio, and one unmodified VRSpace module. It demonstrates a real browser courtyard, solid movable props, an animated skinned creature, four simultaneous corner sources and a positional wall video. It does not complete F05 or select the production engine foundation.

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
```

`install` runs `npm ci --ignore-scripts` against the exact evaluation lockfile. The explicit browser install uses the pinned Playwright CLI; it does not install operating-system packages. The build verifies the frozen F03 bytes and the vendored VRSpace module before bundling. The browser test starts its own loopback server on an available port and closes it afterward. A separately running server is unnecessary.

To explore the scene interactively:

```sh
node run.mjs serve
```

Open the printed `http://127.0.0.1:4173` address in a local browser. Click **Enter courtyard & enable audio**, use WASD to walk, drag to look, click a prop to select it, press E to hold/release it, and press Space to throw it. Position fields edit the selected prop. The corner tracks, creature and wall video all use the same listener.

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

The review fixes and their source-bound results are documented in `REVIEW_FIX.md`. The latest revision is `evidence/audio-measurement-fix`: paired zero-output AudioWorklet measurements, complete marker-period sampling and synchronized teleported colliders. The earlier `evidence/review-fix` result remains unchanged and applies to its earlier sources. Fresh candidate CI must exercise the latest sources.

The adapter exposes `descriptor`, `probe`, `load`, `perform` and `dispose` with the F03 testing-port shape. `load` clones its world before making edits. The general `perform` route executes supported actions but returns `not-run` for assertions that lack a dedicated measurement, and `unsupported` for unimplemented actions. It does not invent passing qualification observations from successful action dispatch.

## Export and import scope

Drag/drop is a bounded local GLB2/self-contained glTF2 evaluation path. The 32 MiB File limit is checked before reading bytes; embedded JSON has a separate 4 MiB limit. Preflight checks safe integer declarations, actual buffer spans, sparse/accessor allocations, graph depth and cycles, repeated draw references, animation keys and image/texture pixels. PNG and JPEG headers must fit the preview's 4096-pixel dimension and aggregate pixel limits. The preview accepts only the material extensions `KHR_materials_unlit`, `KHR_materials_emissive_strength` and `KHR_texture_transform`; optional compression, external resource and imported-audio extensions are rejected before loading. These are deliberately narrow prototype limits, not the engine's final import-format policy. No source files are deleted or replaced during import.

One import runs at a time. Assets, original bytes and world entities are published after loading, finite geometry normalization and collider creation succeed. Failed loads dispose their partial scene resources and bodies, revoke the temporary URL and restore asset/entity/map state. Geometry and conservative box colliders use the same normalized local origin, including for oversized models whose geometry is far from the source origin. Session limits bound retained original bytes and the number of local imports. These declared-work budgets do not establish a hard browser/GPU memory ceiling or production hostile-file isolation; that belongs to the planned import service.

Disposal aborts window/canvas listeners, releases pointer capture, disables and clears control callbacks, awaits any active import rollback, then closes audio and disposes physics/rendering resources. Fresh browser checks dispatch input after disposal and call disposal twice. The planned ten-cycle memory trend is still unmeasured.

**Export GLB** writes the geometry/material/animation subset. **Save world** writes descriptor/transform JSON. **Reload world** restores an in-session snapshot using already loaded assets. These do not implement the planned portable world bundle containing original bytes, media, revisions, scripts and component bindings. Native-format conversion, broader import/export and durable asset storage remain planned engine work.

## Evidence boundaries and remaining work

All recorded browser execution so far uses Chrome for Testing 151.0.7922.34 through ANGLE/Vulkan SwiftShader in a container without a physical GPU, headset or audio listening setup. The original short run had approximately 145 ms p95 frame periods; it did not meet the 30 Hz reference and is not a capacity benchmark. The bundle is approximately 21.6 MiB unminified because it deliberately exposes the Babylon namespace at the compatibility boundary for the old global module.

F05 remains incomplete. The following have no successful evidence in this package:

- Physical headset/controller input, recenter, seated operation, wall-adjacent head motion, sleep/resume, physical audio and target-device thermal behavior.
- Two connected clients, microphones, SFU voice, reconnect, shared authority or service-stack operation.
- Timed-marker audio/video offset against the 80 ms requirement; native pause/seek/loop routing alone does not establish this.
- The complete 60-second warmup, 180-second workload and three repetitions, or the ten-cycle cleanup/memory trend.
- A complete production RuntimePort, general editor, full portable world round trip, upload/conversion service, tenancy, caching or production performance budgets.

The VRSpace result applies only to `AssetLoader`. No compatibility claim is made for WorldManager, avatar IK, editor, XR helpers, Java services or OpenVidu. The Check VR control reports session-support detection; it is not an implemented or tested immersive session.

## Provenance and integration

`source-pins.json` identifies exact npm versions/integrities, the upstream module commit and the historical browser archive. `vendor/vrspace/provenance.json` records the module's exact byte digest and absence of changes. Upstream license/notice files are preserved in `vendor/vrspace` and `licenses`; see `THIRD_PARTY_NOTICES.md`. F03 originals remain in their owning package.

This package does not edit the progress ledger, mark F05 accepted, add a required GitHub job, deploy an application, call a provider, or select the foundation. Integration still needs the candidate's explicit evaluation CI commands, artifact retention, separate security review and current-commit checks. Physical and multi-client qualification remain separate acceptance gates.

Primary sources:

- [Babylon 9.30.0](https://github.com/BabylonJS/Babylon.js/tree/9.30.0)
- [Rapier JavaScript package 0.21.0](https://www.npmjs.com/package/@dimforge/rapier3d-compat/v/0.21.0)
- [VRSpace pinned source](https://github.com/jalmasi/vrspace/tree/61f840a3dd0133fc9d357891f37eb1670b147539)
- [Evaluated VRSpace AssetLoader](https://github.com/jalmasi/vrspace/blob/61f840a3dd0133fc9d357891f37eb1670b147539/babylon/js/core/asset-loader.js)
- [Playwright](https://github.com/microsoft/playwright)
- [Recorded Chrome for Testing archive](https://storage.googleapis.com/chrome-for-testing-public/151.0.7922.34/linux64/chrome-headless-shell-linux64.zip)

