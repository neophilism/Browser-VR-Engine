# Reuse assessment: Hubs and Spoke

**Decision state: incomplete qualification.** The evidence supports retaining Hubs/Spoke as a serious reuse candidate. It does not support selecting it yet or replacing its demonstrated editor functionality merely because another renderer has a successful prototype. F06 owns the foundation decision after the blocked evidence is resolved or an explicit, reviewable decision records the tradeoff.

## What the local evidence establishes

| Subsystem | Observed result | Practical implication |
| --- | --- | --- |
| Hubs client source/build | Exact pinned source passes typecheck, the one registered upstream unit test, and production webpack build. | The pinned client is buildable under the tested Node 24 environment. Runtime/service behavior remains unverified. |
| Spoke model ingestion | Original F03 glTF courtyard, coordinate markers, ten props and skinned creature load in a real browser; the video decodes at 1280 by 720. | Reuse of the native browser builder is concrete, not a screenshot or mock editor. Large purchased content and broader formats are untested. |
| Spoke object editing | Actual numeric Position controls move prop-0 to [2,1,2]; the corrected proxy follows. | A general browser editor can retain its existing selection/transform workflow behind an engine mapping layer. Dynamic collisions/ownership require runtime work. |
| Spoke export and native reload | GLB retains one skin and two animation clips. Native `.spoke` reload preserves the mapped edit, collision hierarchy, screen dimensions and panner selection. | Preserve native exporter/serializer when possible. Canonical semantic roundtrip and Hubs GLB reimport still need evidence. |
| Spatial-media authoring | Six native panner selections, source references and configured gains load; positional video setting survives native reload. | Existing authoring controls are reusable candidates. This does not verify audible placement, occlusion, independent per-source mix, explicit cutoff, synchronized playback or headset output. |
| Compose deployment | Missing mutagen-compose prevents pinned `bin/init` from reaching service setup. | No Reticulum/Dialog stack was deployed; service and security assumptions remain untested. |
| Dependency security | The original Hubs audit timed out. The separate 2026-10-18 pinned-lock report has 106 package/metavulnerability entries, including 14 critical and 64 high. | Known failed upstream graph; modern toolkit audits remain a separate scope. Remediation is unresolved. |

No frame-time or capacity estimate is inferred from shared-machine SwiftShader captures. The fixture is small synthetic geometry, not either referenced Acropolis, Giiman architecture, or a production detailed animal.

## Source boundaries worth preserving

These are candidate seams in the pinned source, not already-extracted engine packages:

- **Spoke editor and node model:** `src/editor/Editor.js`, `src/editor/nodes/SceneNode.js`, `EditorNodeMixin.js`, `ModelNode.js`, `VideoNode.js`, `AudioNode.js`, `BoxColliderNode.js`, and native serializer/export paths. Keep proven property panels and transform actions; map canonical entities, stable asset revisions, permissions, and world transactions at their boundaries. The current wrapper only covers the frozen fixture and cannot be treated as a general importer.
- **Hubs runtime integration:** `src/gltf-component-mappings.js`, `src/systems/hubs-systems.ts`, media loaders/inflators, `src/systems/userinput`, and avatar components. Preserve functioning interactions after exercising them through the common scenarios; test mobile and physical XR mappings before claiming compatibility.
- **Session/state and media coupling:** `src/utils/hub-channel.js`, `src/naf-dialog-adapter.js`, and networked transform/media schemas connect the runtime to its existing services. Replacing these with Colyseus/LiveKit while retaining unrelated Hubs features is a substantial integration choice, not a free adapter swap. F06 should first compare the whole fork's service path with selective component reuse.
- **Asset export metadata:** Spoke emits `MOZ_hubs_components`. A chosen fork needs a documented canonical extension mapping and compatibility strategy. A generic glTF viewer displaying the geometry does not prove preservation of collisions, media, scripts, permissions or scene behavior.

The general engine must still load offline without a conferencing account, conference roles or an SFU. Event registration, agenda/stage policy and application billing remain outside these packages. Source reuse is not permission to carry conference product policy into the engine API.

## Concrete next qualification work

The following are bounded engineering estimates for obtaining evidence, **not measured completion times or a production delivery promise**. They assume one engineer familiar with the chosen source, available public dependencies, no major upstream security regression, and timely access to the necessary devices/services. Re-estimate after each gate; ranges are not additive where work can run in parallel.

| Work package | Concrete result required | Initial effort estimate / uncertainty |
| --- | --- | --- |
| Reproduce the isolated source/dependency setup on a clean host | Exact pins/patch apply; install/build logs; no unknown local env or old dependency cache relied upon. | 1–2 engineer days if historical dependencies remain available; transport/dependency failures may extend it. |
| Stand up a pinned local Hubs service stack | Pin Reticulum/Dialog and service/container images; replace development credentials; document endpoint/port/TLS configuration; create an authenticated test room. | 3–7 engineer days as an investigation budget. No service bring-up has completed, so a firm integration estimate is premature. |
| Run the common desktop/two-client scenario | Both clients load the same F03 assets, avatars and screen; manipulate ownership; shared media timing; disconnect/rejoin; persist/export/reload observed semantics. | 3–6 engineer days after the service stack works. Use the F03 QualificationAdapter contract; this editor-only wrapper is not that adapter. |
| Prove native export/runtime roundtrip | Load the exported GLB through Hubs; compare transform, collider, media, skin/clip and extension semantics; implement explicit asset-reference packaging and unsupported-component reports. | 3–6 engineer days for the frozen fixture and mapping report; general production conversion is separate plan work. |
| Complete device and workload evidence | Physical headset/controller checks, mobile fallback, comfort/accessibility tasks, four-source audio listening, restart/reconnect and pinned workload frame timings. | 2–5 engineer days of execution after rigs/devices are ready, plus access lead time and any resulting fixes. |
| Extraction and dependency/security decision | Identify actual engine API seams, retained services/editor modules, unsupported general-game behavior, transitive licenses/audit results and patch maintenance scope. | 2–4 engineer days after working runtime evidence; discovered security or architectural issues require separately scoped remediation. |

These estimates describe the next qualification tasks. They do not include the full approved asset compiler, authoritative room server, general behavior sandbox, browser builder transaction model, NPC generation/provider budgets, inventory, release matrix, or conference application.

## Required evidence before F04 can close

The F03 world/scenario/threshold/workload/device digests must stay frozen for comparative runs. Record actual methods and identities; unknown assertions remain unverified. The remaining record must include:

1. A runnable Hubs runtime adapter that executes the common scenario and reports unsupported actions honestly; an editor subset alone cannot substitute.
2. Actual two-client operation with independent sessions, shared-object ownership and media behavior, plus reconnect convergence. Two browser tabs that only render the same static scene are insufficient.
3. A working, pinned and reviewed service deployment with authorization/default-access boundaries, asset endpoints and operational dependency limits documented.
4. Physical headset/controller checks and spatial-audio listening/calibration. Emulator, SwiftShader and offline gain-math results do not count as hardware evidence.
5. The defined frame-time routes on recorded target hardware and qualification of retained avatar/media/collision features. No event-scale or detailed-marketplace-asset claim follows from this courtyard.
6. Resolve the current dependency-security findings and retain fresh results. The 2026-10-18 report replaces the active unknown with a known failed graph; it is not a waiver or a passing audit.

Until then, a Hubs/Spoke fork remains a credible but incompletely qualified option. The demonstrated builder functionality should inform the eventual reuse decision regardless of which runtime wins.
