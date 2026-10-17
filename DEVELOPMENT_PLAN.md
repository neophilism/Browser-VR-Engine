# Complete development plan

This is the approved 145-unit baseline: 119 engine units and 26 XLR8 application units. Every deliverable and acceptance criterion is retained. The owner subsequently directed engine completion first; C01 now additionally depends on R12.

## Execution contract

Implement ready engine units, verify changed behavior, record a separate self security review, resolve blocking findings, pass required current-commit checks, confirm safe mergeability, merge, verify main, and update the progress record. Continue ready work autonomously. XLR8 starts after R12.

Core and expanded are delivery stages. Both are required for complete release. Actual hardware/provider/native-tool evidence cannot be replaced by a mock. Original imports, edits, conversion and exports remain full product capabilities.

See [HANDOFF.md](HANDOFF.md), [ACCEPTANCE.md](ACCEPTANCE.md), [progress](docs/progress.json) and [machine-readable plan](docs/plan/pr-plan.json).

## Work lanes

- **Foundations:** 8 units, F01 through F08.
- **Runtime:** 23 units, W01 through W23.
- **Assets:** 25 units, A01 through A25.
- **Networking:** 14 units, N01 through N14.
- **Audio and media:** 26 units, M01 through M26.
- **Authoring:** 10 units, B01 through B10.
- **Operations and release:** 13 units, R01 through R13.
- **Conference application:** 26 units, C01 through C26.

## Foundations

### F01 — Bootstrap the engine repository and durable project record

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: repository initialization.

**Deliverable:** Create the engine workspace, package/service boundaries, local commands, architecture decision directory, development plan, handoff record and machine-readable progress ledger. Reserve interface packages for consumers and examples without conference imports.

**Acceptance:** A fresh checkout builds the minimal SDK and example with documented commands. Every planned card has an ID, owner lane, dependency and truthful planned status; repository ownership and distribution policy are recorded.

**Verification:** Run the clean-checkout build and package import smoke check; validate progress schema and reject application imports in engine packages.

**Security review:** Exclude credentials and source assets from accidental publication. Record dependency trust boundaries and repository protection settings.

### F02 — Establish CI evidence and the merge procedure

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: F01.

**Deliverable:** Add scoped build, unit, integration, browser, migration and security jobs, shared fixtures, artifact retention and a reproducible acceptance record keyed to commit and environment. Document separate self security review followed by required checks and merge verification.

**Acceptance:** A deliberately failing required check blocks acceptance. A changed commit invalidates prior review/check evidence. Progress distinguishes implemented, verified, merged, deployed and release-qualified work.

**Verification:** Exercise passing and failing workflow fixtures, stale-evidence rejection, test sharding and deterministic artifact naming.

**Security review:** Use minimal workflow permissions, pinned actions and secret redaction; untrusted pull-request code cannot receive deployment credentials.

### F03 — Define shared contracts and qualification fixtures

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: F02.

**Deliverable:** Define versioned runtime, asset, world, media, identity and service interface contracts. Select canonical meters/axes and prepare test architecture, animated creature, screens, movable props and four audio corners. Establish reference device and workload manifests.

**Acceptance:** The same fixtures and scripted interactions can run against either candidate foundation. Thresholds, feature requirements and evidence formats are fixed before comparative results are reviewed.

**Verification:** Validate manifests, schema compatibility fixtures, coordinate transforms and scripted scenario reproducibility.

**Security review:** Use redistributable synthetic fixtures for CI and protect privately obtained originals in controlled test storage; fixture provenance does not constrain product import capabilities.

### F04 — Qualify Hubs and Spoke as a complete foundation

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: F03.

**Deliverable:** Build a reproducible Hubs/Spoke evaluation branch or isolated package using pinned sources. Exercise imported venue, avatar, object manipulation, shared media, browser editing, export/reload and headset entry; record components retained and required changes.

**Acceptance:** Publish runnable evidence against F03 requirements, an extraction/deployment assessment and concrete adaptation estimates. Feature claims without exercised behavior remain unverified.

**Verification:** Run the common desktop/two-client scenario and actual-headset checklist; capture frame timing and reconnect behavior without claiming production capacity.

**Security review:** Inventory covered licenses, exposed services, default access policies and stale dependencies; document necessary patches rather than imposing marketplace feature restrictions.

**External evidence:** An actual target headset for comparative XR evidence

### F05 — Qualify Babylon and reusable VRSpace subsystems

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: F03.

**Deliverable:** Build the equivalent F03 evaluation using Babylon and candidate VRSpace client subsystems. Test scene authoring, avatars, media surfaces, spatial audio, physics integration and portable world state. Record reusable modules and server coupling.

**Acceptance:** The evidence is directly comparable with F04. The proposed combination demonstrates the critical interactions and identifies functionality still requiring implementation.

**Verification:** Run the same desktop, multi-client and headset scenarios; inspect bundle size, frame cost and service boundaries.

**Security review:** Check client/server separation, dependency notices, untrusted media routes and credential handling. Do not import an entire service stack merely to obtain a small client module.

**External evidence:** An actual target headset for comparative XR evidence

### F06 — Select the foundation and map retained subsystems

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: F04, F05.

**Deliverable:** Record the foundation decision against capability coverage, adaptation effort, graphics, operations and maintainability. Map every remaining card to reuse, adapt or implement. Keep one runtime foundation; retire the losing production path while retaining its evaluation evidence.

**Acceptance:** All required outcomes remain assigned. A Hubs selection may retain its working networking/media/editor systems; it does not force replacement by the default libraries. Reused functionality closes a card only after its acceptance checks pass.

**Verification:** Validate the capability mapping, full dependency graph and a build of the selected foundation.

**Security review:** Document software obligations and patch ownership. Preserve full import, editing and export goals and an application-independent engine boundary.

### F07 — Pin upstream components and establish fork maintenance

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: F06.

**Deliverable:** Create only necessary source forks; otherwise pin upstream packages and service images. Record source versions, patches, notices, software bill of materials and update responsibilities. Define regression checks for upstream upgrades and supported toolchain versions.

**Acceptance:** A clean build resolves the recorded dependency set and can identify the source of every shipped binary. Local modifications have a reproducible patch or branch history.

**Verification:** Rebuild from lockfiles and verify artifact provenance, license inventory and an example dependency update/revert.

**Security review:** Review build scripts, supply-chain exposure and distribution obligations, including native converter builds. No secret or private asset enters a package by default.

### F08 — Establish the engine control API and data services

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: F07.

**Deliverable:** Implement host-injected identity, tenant/project namespaces, scoped capabilities and basic control API middleware. Add durable schema migrations, object-store/queue interfaces, idempotent job contracts and a local service stack. Keep product roles in the host application.

**Acceptance:** A standalone host can create a scoped workspace and call engine APIs without conference records. Two tenants cannot access each other; retries preserve one result and failed migrations recover predictably.

**Verification:** Run real database, object-store and queue integration tests plus authorization, token expiry, migration rollback/forward and idempotency cases.

**Security review:** Apply transport encryption, secret isolation, least-privilege service grants and explicit processing trust boundaries; do not claim participant-held encryption for server-readable simulation data.


## Runtime

### W01 — Version complete world, entity and prefab schemas

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: F06.

**Deliverable:** Extend foundation contracts into versioned world, entity, prefab and asset-reference schemas, including component extension points, stable identifiers, hierarchy, source coordinates and migration hooks. Map the selected foundation into these contracts instead of introducing a second scene model.

**Acceptance:** A fixture containing nested prefabs, negative scales, media references and behavior data validates and round-trips without losing identity. Unknown optional components survive preservation; unsupported required components produce actionable errors. Meters, right-handed axes and Y-up remain invariant.

**Verification:** Exercise malformed references, parent cycles, duplicate identifiers, schema migration and coordinate round-trips against independent fixtures.

**Security review:** Bound nesting, component sizes and numeric ranges; reject prototype-polluting keys and unresolved external references before instantiation.

### W02 — Implement runtime lifecycle and injectable local services

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W01, F07.

**Deliverable:** Expose create, load, start, suspend, resume, unload and dispose operations around the chosen runtime. Provide injectable asset, authorization, persistence and transport interfaces with local implementations. Separate scene state from rendering resources and host application UI.

**Acceptance:** A minimal world starts without a conference account, application API or media server. Loading another world cancels obsolete work and disposes previous resources. Repeated mount/unmount and suspended-tab recovery leave one active frame loop and consistent lifecycle events.

**Verification:** Run lifecycle integration tests covering cancellation, failed loads, late asynchronous results and repeated mounting; inspect retained resource counts.

**Security review:** Local mode grants only its explicit local capabilities; absent host authorization must never silently authorize a remote world.

### W03 — Load canonical assets into the selected renderer

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A04.

**Deliverable:** Connect published asset manifests to the selected renderer, reusing its glTF, material, lighting, animation and texture facilities. Support dependency resolution, loading placeholders, cancellation, shared-resource ownership and documented advanced renderer extensions without rebuilding the upstream rendering pipeline.

**Acceptance:** The reference scene loads meshes, textures, lights and animation clips with preserved transforms and source diagnostics. Repeated instances share eligible resources, while disposing one instance leaves others intact. Required unsupported features fail visibly instead of silently disappearing.

**Verification:** Compare representative render fixtures and test missing textures, corrupt resources, cancelled loads, negative scales and shared-resource disposal.

**Security review:** Load only authorized manifest resources; enforce resource ceilings and prevent renderer plugins from fetching arbitrary asset URLs.

### W04 — Provide desktop, touch and accessible action input

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W03.

**Deliverable:** Add application-neutral action bindings for movement, look, selection, interaction and cancellation across keyboard, mouse, touch and gamepad. Provide remapping, focus ownership, pointer-lock lifecycle and accessible equivalents for essential non-spatial controls.

**Acceptance:** Users navigate and select objects with desktop or touch controls without triggering movement while typing. Pointer-lock refusal, focus loss, orientation changes and device disconnection recover predictably. Host UI can consume an action without depending on renderer internals or conference roles.

**Verification:** Use browser interaction tests for input capture, remapping, focus transitions, touch gestures and stuck-key prevention; verify keyboard-only operation manually.

**Security review:** Validate incoming synthetic actions through the same bounded action contract; user gestures cannot bypass remote permissions or object capabilities.

### W05 — Integrate WebXR sessions, controllers and comfort controls

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W04.

**Deliverable:** Adapt the selected foundation's WebXR session and controller support into shared input actions, reference-space handling and session lifecycle. Implement snap turning, teleport requests, seated/recenter controls and optional smooth locomotion with explicit comfort settings.

**Acceptance:** Capability detection exposes only available entry modes. A supported headset enters, exits, recenters and resumes without duplicate inputs or displaced world scale. Session denial and controller loss return usable controls. Locomotion requests remain subject to later collision and authority validation.

**Verification:** Combine mocked session/error tests with recorded physical-headset checks for controller profiles, reference-space resets, sleep/resume and comfort settings.

**Security review:** Tracking stays ephemeral by default; XR availability never grants movement, editing or media capabilities.

**External evidence:** Physical WebXR headset and controllers for acceptance.

### W06 — Add VR-safe controls and qualified hand interaction

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W05.

**Deliverable:** Provide reusable XR panels, readable prompts, focus states and interaction targets for controller rays and direct selection. Add hand-tracking adaptation where supported, with pinch/debounce handling and controller or desktop fallback; reuse qualified upstream UI components.

**Acceptance:** Users can dismiss errors, adjust comfort, select objects and leave the session inside the headset. Essential controls do not depend on invisible HTML overlays. Hand/controller switching does not duplicate activation, and unsupported tracking preserves a complete interaction route.

**Verification:** Test focus and action routing automatically; verify target reach, text legibility, hand occlusion, accidental pinches and device switching on actual hardware.

**Security review:** UI visibility is independent of authority; repeated or spoofed activations still pass object capability and rate checks.

**External evidence:** Qualified hand-tracking headset for the advertised hand profile.

### W07 — Bridge collision assets and fixed-step physics

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W02.

**Deliverable:** Implement the selected physics bridge, defaulting to Rapier, for static, kinematic and dynamic bodies, collider manifests, mass properties, collision filters, contacts and transform interpolation. Expose a headless simulation interface suitable for local and authoritative hosting. Use independent collider fixtures first; A13 subsequently supplies production-derived geometry.

**Acceptance:** Architectural openings remain traversable while floors and walls are solid. Physics owns simulated transforms; rendering interpolates without altering authority. Repeated loads release bodies and shapes. Fixed-step behavior is bounded under frame stalls without claiming universal cross-platform deterministic lockstep.

**Verification:** Exercise stairs, arches, negative-scale assets, thin barriers, falling bodies, contact events and frame stalls using independent geometry fixtures.

**Security review:** Reject malformed collider data, excessive body counts, invalid numeric values and unbounded catch-up simulation.

### W08 — Implement character traversal, seating and safe teleportation

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W05, W07.

**Deliverable:** Build a capsule-based character controller with walking, slopes, steps, ground detection, seating, configurable participant collision and validated teleport destinations. Connect shared input and comfort actions while keeping tracked headset motion distinct from virtual body constraints.

**Acceptance:** The traversal fixture supports stairs, ramps, doorways and moving platforms without falling through unloaded collision. Invalid teleports fail clearly. Removing a floor triggers a safe recovery. Real head movement remains tracked; boundary feedback handles wall penetration without forcibly moving the camera.

**Verification:** Run reproducible traversal scenarios plus headset checks for seated scale, recentering, wall approach and interrupted teleport requests.

**Security review:** Bound speed, acceleration, teleport range and spawn choices; authoritative validation can replay the same movement intent contract.

**External evidence:** Physical headset for tracked-camera boundary and seating acceptance.

### W09 — Implement object manipulation, throwing and joints

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W06, W08.

**Deliverable:** Define reusable interaction intents and control-lease state for selecting, grabbing, carrying, placing and throwing dynamic objects. Implement local physics constraints and bounded joints for doors, levers and attached props, using desktop and XR interaction adapters.

**Acceptance:** A statue can be carried, placed or thrown with predictable release velocity and collisions. Jointed doors obey limits. Losing input, deleting an object or suspending a session releases control safely. The same command/result contract can be hosted by the network authority.

**Verification:** Exercise heavy/light props, fast release, collision during grabs, joint limits, simultaneous local requests and interrupted interactions.

**Security review:** Enforce interaction distance, object capability, force and velocity ceilings; imported properties cannot create unlimited constraints.

### W10 — Connect physics interactions to room authority

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N05.

**Deliverable:** Bind movement and manipulation intents to the authoritative room service with lease arbitration, acknowledgments, local prediction, correction and remote interpolation. Reuse the selected networking primitives; keep shared body ownership separate from collaborative document state.

**Acceptance:** Two clients contesting one object receive one valid owner. Late joiners see current poses, joints and control state. Packet delay, duplicate messages and disconnects produce bounded correction and lease release. A client cannot tunnel, teleport or launch objects by submitting unchecked transforms.

**Verification:** Run two-client browser scenarios and headless fault tests for delayed commands, stale leases, replayed releases and prediction reconciliation.

**Security review:** Review all client-controlled movement fields; validate principal, instance epoch, object scope and replay handling before accepting state changes.

### W11 — Integrate navigation meshes, routes and world transitions

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A13.

**Deliverable:** Integrate Recast/Detour or the qualified reused navigation subsystem for tiled walkability, path queries, off-mesh connections, NPC routing and portal destination contracts. Invalidate impacted navigation regions when geometry changes and expose rebuild status to the runtime.

**Acceptance:** Routes pass through real doorways and avoid blocked or unloaded regions. A removed bridge invalidates affected paths and safe spawn recovery works. A portal resolves a destination without assuming conference sessions; remote authorization and transition orchestration remain host-service responsibilities.

**Verification:** Compare paths against independent obstacle fixtures; exercise disconnected islands, stale tiles, moved blockers and cancellation during transitions.

**Security review:** Bound pathfinding work and destination requests; reject unauthorized destination references and malformed navigation links.

### W12 — Load generic avatars and a qualified VRM adapter

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W03.

**Deliverable:** Create an avatar resource contract for skinned glTF, morph targets, skeleton mappings, body bounds and attachment sockets. Adapt VRM where qualified and preserve unsupported metadata for export. Reuse existing avatar loading rather than imposing one hosted avatar vendor.

**Acceptance:** Multiple independently sourced fixture avatars load at correct scale with stable bone references and valid bounds. Unsupported rigs return useful diagnostics or a safe placeholder. Replacing an avatar disposes resources without changing participant identity or losing host capabilities.

**Verification:** Cover differing bone names, absent optional bones, morph targets, oversized skeletons, malformed skin indices and repeated avatar replacement.

**Security review:** Enforce texture, bone, morph and material budgets; avatar metadata and extensions must not execute embedded code.

### W13 — Add avatar animation, retargeting and emote playback

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W08, W12.

**Deliverable:** Provide animation state machines, clip libraries, blending, root-motion policy and qualified skeleton retargeting. Define generic locomotion, seating, gestures and emote actions with authored fallback mappings rather than assuming every humanoid shares one rig.

**Acceptance:** Compatible fixture rigs play walking, seated transitions and several emotes without scale drift or losing foot contact beyond the agreed tolerance. Unsupported retarget mappings are reported. Interrupting an emote returns smoothly to locomotion; root motion never bypasses the physics controller.

**Verification:** Check clip transitions, missing clips, loop boundaries, different frame rates, root offsets and retargeted reference poses.

**Security review:** Bound animation events and clip resource use; event markers invoke approved actions instead of arbitrary code or privileged commands.

### W14 — Add avatar presence, inverse kinematics and attachments

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W06, W13.

**Deliverable:** Map available head and hand poses onto avatar bones using qualified inverse kinematics, calibration and bounded fallback poses. Add wearable/held attachment sockets, local source offsets and capability adapters for optional face/body tracking without requiring that hardware.

**Acceptance:** An avatar follows tracked head/hands at the configured scale, while absent tracking produces a stable fallback rather than invented measured poses. Attachments remain aligned through animation and avatar replacement. Local and remote pose contracts distinguish tracked, estimated and unavailable data.

**Verification:** Exercise seated calibration, tracking loss, arm reach limits, controller changes and attachment motion on fixture rigs and hardware.

**Security review:** Minimize tracking retention and bound pose updates; attachment assets retain ordinary ownership and resource restrictions.

**External evidence:** Physical headset for head/hand calibration and optional tracking claims.

### W15 — Implement animated wildlife and reusable NPC behaviors

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W11, W13, M02.

**Deliverable:** Add reusable path-following, flying-route, idle and scheduled-behavior components for non-humanoid actors. Bind imported clips, simple interaction bounds and entity-attached audio while separating shared behavior timing from locally evaluated skeletal animation.

**Acceptance:** A rigged bird follows a route, changes clips and carries its sound emitter without requiring human bone names. Lower-detail clients preserve its authoritative location and behavior. Missing optional audio or clips produces a documented fallback; authored routes stay within configured bounds.

**Verification:** Use synthetic animal fixtures for clip timing, route loops and LOD changes; inspect one actual animated wildlife asset before claiming fidelity.

**Security review:** Cap active actors, route complexity and event frequency; decorative actors cannot acquire participant or editor privileges.

**External evidence:** A usable rigged animal asset for the final fidelity check.

### W16 — Add terrain tiles and environmental scene components

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W11.

**Deliverable:** Implement versioned terrain tiles, heightfield/mesh rendering and collision bindings, plus reusable sky, water and bounded weather components. Reuse renderer facilities and material presets; keep environmental simulation and quality policy independent of conference venue themes.

**Acceptance:** A tiled landscape loads without visible or physical cracks at approved borders. Terrain edits invalidate affected collision/navigation revisions before traversal resumes. Water and weather have lower-cost fallbacks, and disabling decorative effects leaves navigation and world state unchanged.

**Verification:** Exercise neighboring tile seams, origin/scale conversions, terrain replacement, unloaded boundaries and reduced-effects rendering against reference fixtures.

**Security review:** Bound tile size, update frequency, particle counts and environmental parameters; malformed height data cannot exhaust memory or destabilize simulation.

### W17 — Provide declarative object behaviors and trusted extensions

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W09.

**Deliverable:** Implement versioned triggers, conditions, timers and approved actions for doors, exhibits, object interaction and simple games. Supply a documented trusted-plugin interface and renderer escape hatch while preserving behavior metadata in the world manifest.

**Acceptance:** A fixture game uses interaction, timed events and state transitions without conference code. Behaviors run in the correct local or authoritative context, survive save/reload and handle entity deletion. Cyclic trigger graphs stop at declared execution budgets with useful diagnostics.

**Verification:** Exercise event ordering, timer cancellation, graph cycles, missing action providers and replay after restoring a world revision.

**Security review:** Authorize every privileged action, constrain event amplification and keep imported script text inert unless an explicitly supported runtime admits it.

### W18 — Qualify and integrate isolated creator scripting

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: W17.

**Deliverable:** Select and integrate an isolated creator-code runtime with an explicit capability bridge, bounded execution, controlled storage/network access and termination, plus an optional browser script-editor panel. Keep trusted engine plugins separate. Document supported language/runtime versions, execution locations and serialization of script state.

**Acceptance:** A creator-authored object performs useful logic through approved APIs and survives revision export/reload. Infinite loops, excessive allocation and unauthorized host calls terminate without taking down the world. Browser/server differences are explicit; a worker alone is not accepted as isolation.

**Verification:** Run adversarial scripts, cancellation, upgrade compatibility and capability-revocation cases in the actual selected isolation mechanism.

**Security review:** Complete a separate escape/broker review covering ambient credentials, origin access, imports, resource ceilings and authoritative command validation.

### W19 — Implement scene streaming and adaptive quality budgets

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W12, W16.

**Deliverable:** Connect asset variants and spatial cells to projected-size LOD, culling, instancing, staged loading and bounded animation updates. Add separate rendering, memory, transfer and decode budgets with manual quality settings, downgrade hysteresis and gradual recovery.

**Acceptance:** A low-power profile reduces decorative detail while preserving presentation readability, authoritative geometry and usable movement. Collision arrives before entry into streamed regions. Repeated quality changes do not oscillate, leak assets or duplicate entities; premium source variants remain available.

**Verification:** Replay representative camera routes under bandwidth and frame-load limits; inspect resource counts, variant selection and collision-before-traversal ordering.

**Security review:** Enforce world and client budgets despite hostile asset metadata; quality selection must not bypass content authorization.

### W20 — Harden renderer selection and graphics recovery

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W19.

**Deliverable:** Implement capability-based backend selection and recovery around the chosen foundation: conservative WebGL2 immersive entry, qualified WebGPU paths and controlled scene reconstruction. Handle context/device loss without conflating graphics resources with world state or media connections.

**Acceptance:** Unsupported XR/backend combinations offer a working fallback before entry or reconstruct predictably. Simulated context loss restores the current world without duplicate physics or audio. Failed restoration exposes a recoverable user action while preserving independent meeting connections where possible.

**Verification:** Exercise capability matrices, denied sessions, resource recreation, backend changes, headset sleep and repeated device/context loss on supported profiles.

**Security review:** Recreated resources recheck authorized manifests; recovery cannot revive revoked assets, stale grants or superseded world instances.

**External evidence:** Actual target browsers and headsets for each advertised backend profile.

### W21 — Ship independent offline and multiplayer game examples

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W10, W17, W23.

**Deliverable:** Publish a local physics playground and a small multiplayer game using only released engine interfaces. Demonstrate loading, movement, collision, object rules, reset/save and host-provided identity without importing conference routes, account models, agendas or presenter roles.

**Acceptance:** The offline example works with network access disabled after its packaged assets load. The multiplayer example joins an engine world service directly and supports two interacting clients. Both examples use the same contracts and document deployment/configuration without hidden conference dependencies.

**Verification:** Run import-boundary checks, offline browser tests and a two-client game flow including save/reset and reconnection.

**Security review:** Use explicit demonstration permissions; sample credentials and permissive development settings must not enter published production defaults.

### W22 — Qualify runtime performance and supported device profiles

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W15, W20, W21, M10, M11.

**Deliverable:** Run integrated runtime qualification with representative venues, actors, avatars and media. Publish supported device/backend profiles, reproducible scene versions, p95/p99 frame timings, memory/decoder observations and outstanding fidelity limits rather than one unqualified frame-rate claim.

**Acceptance:** Each advertised profile sustains its selected desktop or headset target and preserves traversal, essential controls and readable presentations. Low-quality fallbacks and graphics recovery work during active media. Failures narrow the published claim and produce corrective work before that profile is accepted.

**Verification:** Replay camera/interaction workloads on actual laptops and headsets, varying active avatars, animals, screens and network conditions independently.

**Security review:** Review telemetry for sensitive tracking/media leakage and confirm resource ceilings remain effective during overload and recovery.

**External evidence:** Reference laptops/headsets and approved representative venue/animal assets.

### W23 — Implement persistent inventories and object ownership

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N05, N14, A05.

**Deliverable:** Add application-neutral inventories, object ownership, prefab instances, pickup/stow/drop operations and equipment/attachment slots. Persist item identity separately from shared render assets and connect state changes to authoritative capabilities and revisions.

**Acceptance:** A player can collect, carry, store, equip and re-place an object across reconnects without duplicating its identity. Shared venue props and personal items follow distinct ownership rules and remain usable by non-conference examples.

**Verification:** Test concurrent pickup, reconnect during transfer, duplicate retries, destroyed items, attachment replacement and persistence restoration.

**Security review:** Check item, inventory and world capabilities at every transfer; clients cannot mint items, seize another inventory or export private dependencies by changing ownership metadata.


## Assets

### A01 — Asset revisions, preserved sources and converter contracts

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: F08.

**Deliverable:** Define versioned asset, source-bundle, dependency, conversion-recipe and diagnostic schemas. Register importer/exporter adapters with explicit format, version and feature declarations. Preserve original bytes, companion files, authoring coordinates, names, pivots and hashes independently of derived runtime outputs. Provide application-neutral catalog and operation contracts.

**Acceptance:** An uploaded source receives a stable revision and can be retrieved byte-for-byte after a derived revision changes. Capability declarations distinguish native import, exchange import and export without marketplace-specific feature restrictions.

**Verification:** Round-trip schema fixtures, malformed dependency graphs, source-hash verification and recipe-version migration prove identity preservation and compatibility failures.

**Security review:** Check tenant ownership on every source, dependency and revision operation; reject ambient filesystem references.

### A02 — Resumable intake for files, folders and archives

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A01.

**Deliverable:** Implement browser and API intake for individual files, folder selections, drag-and-drop directories and supported archives. Stage a dependency bundle with relative paths, checksums, multipart/resumable progress, cancellation and expiration. Preserve companion textures and nested directories; identify archives by signatures rather than extensions.

**Acceptance:** A network interruption resumes verified chunks without restarting the complete upload. Folder and archive submissions retain equivalent dependency paths, and canceling removes only the intended incomplete session. Unsupported archive types produce actionable results.

**Verification:** Exercise interrupted and repeated completion, duplicate filenames in different folders, Unicode paths, mobile file selection, oversized entries and corrupt chunk hashes.

**Security review:** Bind upload tokens to one tenant/session; enforce quotas, path containment, bounded entry counts and safe archive expansion limits.

### A03 — Isolated conversion jobs and recoverable execution

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A02.

**Deliverable:** Run pinned converters in disposable workers with durable jobs, leases, checkpoints where supported, cancellation, bounded retries and structured progress. Separate staged sources from writable outputs. Record actual tool versions and build inventories. Implement process termination, cleanup and terminal failure classification.

**Acceptance:** A real conversion job survives worker loss through a safe retry and publishes at most one result. A canceled or timed-out job stops its subprocesses, releases its lease and leaves original data intact.

**Verification:** Kill workers before and after output commit; inject queue redelivery, disk exhaustion, malformed parser input and converter hangs. Verify resource accounting and cleanup.

**Security review:** Use nonprivileged isolation, no ambient credentials, restricted filesystem/network access and CPU, memory, disk and wall-time limits.

### A04 — Canonical glTF and GLB ingestion with feature validation

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A03, W02.

**Deliverable:** Implement glTF/GLB loading through the selected runtime and canonical compiler path. Validate buffers, references, skins, clips, morph targets, materials and supported extensions. Normalize source coordinates once while retaining original conventions and stable sub-object identifiers. Publish an explicit extension/fidelity matrix.

**Acceptance:** Representative static and animated fixtures render with correct scale, orientation, hierarchy and materials. Required unsupported extensions prevent a false success; optional approximations remain visible in diagnostics. A valid small GLB can preview before hosted optimization finishes.

**Verification:** Use Khronos fixtures plus mirrored transforms, interleaved buffers, sparse accessors, missing textures, invalid numeric values and oversized allocations; compare rendered reference views.

**Security review:** Bound decoded resources and resolve only authorized bundle dependencies; never execute asset-provided code.

### A05 — Immutable publication, reusable results and asset lifecycle

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A04.

**Deliverable:** Publish immutable manifests and derivative objects atomically, keyed by source hashes, tool versions and complete recipes. Add catalog lookup, asynchronous job-result retrieval, CDN delivery, original retrieval endpoints and reference-aware lifecycle management. Support rebuilding with new recipes without rewriting older worlds.

**Acceptance:** Concurrent identical jobs converge on one valid published result; changing any meaningful recipe input creates a distinct revision. Worlds remain pinned to their selected assets. Unreferenced outputs can be reclaimed without deleting active world or export dependencies.

**Verification:** Exercise interrupted publication, duplicate completion, cache invalidation, expired delivery grants, concurrent references, deletion races and restoration from retained originals.

**Security review:** Authorize every catalog and byte-delivery request; prevent cross-tenant existence leaks and unsafe shared-cache keys.

### A06 — OBJ, MTL, COLLADA and legacy 3DS conversion

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A05.

**Deliverable:** Add qualified OBJ/MTL, DAE and legacy .3ds adapters using pinned open-source tools. Preserve supported geometry, object grouping, transforms, texture references and basic material properties. Record tested exporter variants and supported animation features. Keep .3ds distinct from native .max scenes.

**Acceptance:** A folder containing an architectural OBJ, its MTL and textures becomes an editable runtime asset. A DAE venue retains its hierarchy and openings. Missing dependencies produce specific repair instructions, and static OBJ never claims to preserve skeletal animation.

**Verification:** Convert exporter-diverse fixtures with relative texture paths, negative scale, differing units, transparency, large indices and unsupported DAE features; inspect reference renders.

**Security review:** Disable XML external entities and reject escaped paths, excessive nesting and unbounded material/mesh counts.

### A07 — FBX meshes, skins, morphs and animation clips

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A05.

**Deliverable:** Qualify ufbx and the selected Blender route against the same corpus, then implement the better supported FBX adapter. Preserve hierarchy, units, pivots, skins, blend shapes, clip ranges and supported material bindings. Report constraints, expressions or shader features that require evaluation in the source application.

**Acceptance:** Binary and ASCII FBX fixtures load as the same animated characters at representative poses. Clip names and duration survive conversion, and a file needing native baking cannot silently become a static success.

**Verification:** Compare skinned poses, morph weights, inverse bind transforms, loop seams, reflected coordinates and multiple animation takes against exported references. Include malformed and truncated FBX inputs.

**Security review:** Use isolated parsing with allocation limits; embedded media and external references remain within the authorized source bundle.

### A08 — Native Blender scene conversion

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A05.

**Deliverable:** Implement a version-qualified headless Blender adapter for .blend sources using trusted pipeline scripts. Resolve bundled textures and linked libraries, preserve supported geometry and animation, and identify unsupported node, modifier or driver behavior. Record the exact Blender build and conversion settings in every result.

**Acceptance:** Supported .blend scenes produce editable runtime assets with correct objects, clips and appearance. Sources requiring missing libraries or unsafe embedded execution report the issue without losing originals or automatically enabling scripts.

**Verification:** Run real Blender conversions covering packed/unpacked textures, linked assets, modifiers, geometry nodes within the supported subset and animations; compare outputs and expected failure diagnostics.

**Security review:** Disable embedded autoexecution, isolate subprocesses and limit dependency resolution; inventory distributed Blender scripts and binaries.

### A09 — USD family composition and conversion

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A05.

**Deliverable:** Add version-qualified USD, USDA, USDC and USDZ intake through Blender/OpenUSD tools. Resolve declared references, payloads and selected variants within the source bundle; convert the documented mesh, hierarchy, material and animation subset. Preserve source composition metadata and report every unsupported semantic.

**Acceptance:** A packaged USD scene with local references converts reproducibly using an explicit variant selection. Missing payloads and unsupported curves, volumes or materials appear as identified issues rather than an apparently complete empty asset.

**Verification:** Compare composed transforms, instancing, selected variants, time samples and material references against native source inspection; exercise broken references, cycles and archive faults.

**Security review:** Block arbitrary filesystem or network resolution and custom resolver/plugin execution; bound composition depth and expanded resource size.

### A10 — STL, PLY and 3MF geometry classification

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A05.

**Deliverable:** Implement tested STL, mesh-PLY and 3MF conversion with geometry, color, assembly and unit handling appropriate to each format. Classify point-cloud and Gaussian-splat PLY schemas explicitly and dispatch them to their specialized adapter status. Offer scale calibration when the source omits units.

**Acceptance:** Ordinary geometry imports at the chosen physical scale with preserved supported colors and assemblies. A splat or point file is never misreported as a broken triangle mesh. Users can inspect and correct unknown-unit assumptions before placement.

**Verification:** Use ASCII/binary STL and PLY, colored meshes, 3MF assemblies, mixed-schema PLY, degenerate faces, missing units and malformed container relationships.

**Security review:** Apply shared archive containment, XML safety and decoded vertex/face limits; reject nonfinite coordinates and oversized declared counts.

### A11 — Material and animation baking with fidelity reports

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A06, A07, A08.

**Deliverable:** Build shared baking recipes for supported materials, UV preparation, textures, animation resampling, skin/morph outputs and named clips. Separate source evaluation from runtime encoding so native connectors can contribute evaluated data later. Preserve original high-quality assets and record approximations, missing renderers and deformation losses.

**Acceptance:** Procedural fixtures within the supported subset produce stable PBR outputs and animated clips. Unsupported renderer or rig features produce a correction-required result; static exchange geometry never substitutes silently for a promised animated asset.

**Verification:** Compare reference views, UV seams, normal orientation, feather silhouettes, clip endpoints, morph deformation and baked transform poses using real supported toolchains.

**Security review:** Execute only trusted recipes; imported expressions or scripts cannot run outside qualified isolated source-application evaluation.

### A12 — Mesh, texture, LOD and spatial-cell optimization

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A11.

**Deliverable:** Generate device-tier derivatives using glTF Transform, meshoptimizer and KTX/Basis tooling. Separate byte compression, mesh simplification, texture resizing, material consolidation, instancing and spatial partitioning. Preserve artist-provided LODs and stable entity/sub-object mappings; record recipe-specific resource and quality statistics.

**Acceptance:** A large venue streams nearby cells and appropriate LODs without loading its full detail first. Animated assets retain valid skins and clips across tiers. High-quality sources remain available, and all rendering variants refer to the same authoritative object locations.

**Verification:** Measure transfer, decoded memory, draw calls, geometric error, texture artifacts, LOD transitions and animation deformation on fixed fixtures; prove cache invalidation when recipes change.

**Security review:** Cap expansion and optimization work; validate compressed outputs and prevent shared-buffer corruption or oversized GPU allocations.

### A13 — Derived colliders, navigation and safe placement data

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A12, W08.

**Deliverable:** Generate separate collision and navigation artifacts from normalized geometry. Use simplified static meshes or suitable primitives for venues, bounded convex compounds for movable props, and authored overrides where needed. Preserve doorways, arches and courtyards; produce walkable areas, teleport surfaces, interaction bounds and safe spawn candidates.

**Acceptance:** The reference venue remains traversable without passing through walls or enclosing its interior in one convex hull. A throwable statue uses stable bounded collision geometry. Collision readiness is distinct from visual readiness for streamed cells.

**Verification:** Exercise doorway clearance, stairs, thin floors, concave props, mirrored scale, missing geometry and collider simplification error through the reference controller and physics adapter.

**Security review:** Enforce collider complexity and decomposition time limits; reject unsafe spawn data and unbounded navigation generation.

### A14 — Unified browser import, diagnostics and preview workflow

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A09, A10, A13, B01, A25.

**Deliverable:** Connect the shared drop target to editor placement, immediate placeholders, progress, cancellation, preview generation and repairable diagnostics. Display detected formats, units, missing dependencies, clip/material coverage and resource estimates. Support replacing dependencies and rerunning a recipe without duplicating the intended object. Integrate A25 remote URL sources into the same import progress, diagnostics and publication flow.

**Acceptance:** A user drops a venue, sees truthful progress, checks scale and traversal, then places repeated props. Ready GLBs preview quickly; large scenes remain usable while processing. Failed or canceled imports leave no ghost scene entities or lost originals.

**Verification:** Run desktop and supported headset upload/placement flows, reconnect during processing, cancel/delete races, dependency repair and repeated completion events; compare thumbnails with runtime output.

**Security review:** Authorize import-to-world attachment separately from upload; sanitize diagnostics, filenames and preview metadata shown in the browser.

### A15 — Original retrieval and interoperable scene export

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A14.

**Deliverable:** Expose complete original-bundle retrieval and an export adapter registry with GLB/glTF and a documented OBJ subset. Export selected objects or supported scene snapshots with stable metadata sidecars and explicit feature-loss reports. Document and test foreign-engine exchange-export intake without treating native project containers or scripts as interchange.

**Acceptance:** Users retrieve identical originals and export editable supported geometry, materials and animation without supplier-specific product restrictions. Reimported exchange files preserve their documented subset; engine-only behaviors are identified for complete-bundle export.

**Verification:** Reimport exported scenes in this engine and an independent compatible viewer; verify transforms, names, materials, skins and clips. Exercise foreign-engine-produced exchange fixtures.

**Security review:** Check export scope and dependency access; strip session credentials and never execute source-project scripts during intake.

### A16 — Complete world bundles and editable round trips

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A15, M09, W16, W17.

**Deliverable:** Export and reimport versioned world bundles containing the manifest, dependency graph, assets, optional originals, terrain, prefabs, colliders, navigation, behaviors, media/audio bindings and revision metadata. Provide explicit portable-source inclusion and external-media references. Implement schema migration, collision-safe clone mapping and transactional import.

**Acceptance:** An exported world opens in a clean workspace with preserved stable IDs, editable relationships and essential behaviors. Clone mode remaps references consistently. Live credentials are replaced by explicit reconnect requirements, while file-backed content remains portable.

**Verification:** Compare semantic snapshots and interactive behavior after export/reimport; exercise migrations, missing dependencies, duplicate IDs, partial upload and rollback after late validation failure.

**Security review:** Verify bundle integrity and access scope; treat imported behaviors as untrusted data until the behavior system authorizes activation.

### A17 — Qualified native SketchUp connector

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: A15.

**Deliverable:** Implement a version-qualified SKP connector using an actually provisioned supported native SDK or application route. Preserve geometry, components, instance transforms, materials and dependency metadata within the declared subset. Expose qualified native export capabilities through the adapter registry; keep DAE exchange as an independent usable route.

**Acceptance:** Real SKP fixtures convert through the deployed native toolchain and compare correctly with source views. A DAE workaround or mocked connector cannot mark native SKP import accepted. Unavailable native software reports its provisioning dependency accurately.

**Verification:** Run native component, nested-instance, texture, units and version fixtures; exercise actual process failure and unsupported source-version diagnostics.

**Security review:** Isolate native execution and validate source dependencies and generated output.

**External evidence:** Provisioned SketchUp SDK/application access and supported deployment rights; real native fixtures are required for acceptance.

### A18 — Qualified native Maya rig and scene connector

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: A15.

**Deliverable:** Implement MA/MB conversion through provisioned version-qualified Maya workers. Evaluate supported rig constraints and expressions, bake named clips and deformation, resolve dependencies, and export tested exchange/runtime outputs. Integrate shared baking and diagnostics while retaining original scenes and documented source-renderer requirements.

**Acceptance:** A real complex animated Maya fixture preserves its expected clips, feather or attachment motion and supported material appearance. Artist-provided FBX remains useful independently but does not satisfy native MA/MB acceptance. Missing plugins or licenses produce explicit dependency failures.

**Verification:** Compare native sampled poses and reference renders with converted clips; test multiple takes, source-version mismatch, missing plugins and worker interruption.

**Security review:** Constrain native script evaluation inside disposable workers without secrets or arbitrary external access.

**External evidence:** Provisioned supported Maya installation, necessary renderer/plugins and deployment rights; actual native conversion runs are mandatory.

### A19 — Qualified native 3ds Max scene connector

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: A15.

**Deliverable:** Implement native .max conversion through a provisioned supported 3ds Max worker and qualified exporter. Resolve scene dependencies, supported modifiers and instances; bake supported renderer materials and export documented runtime features. Record exact source/application/plugin versions and preserve originals.

**Acceptance:** A real architectural MAX scene becomes a correctly scaled, grouped runtime venue with verified materials and openings. Legacy .3ds or seller-provided OBJ/DAE conversion does not falsely complete native MAX support. Unsupported plugin evaluation remains an explicit technical result.

**Verification:** Compare source views, instance transforms, material assignments and modifier output; exercise missing renderer, unsupported file version, cancellation and native application crashes.

**Security review:** Isolate native scene evaluation, restrict file/network access and validate generated resources before publication.

**External evidence:** Provisioned supported 3ds Max platform, required renderer/plugins and deployment rights; real MAX files and native runs required.

### A20 — Qualified native Cinema 4D connector

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: A15.

**Deliverable:** Implement a Cinema 4D connector through a provisioned supported native application or SDK route. Qualify generators, instance hierarchies, materials, animation and dependency resolution before claiming each feature. Feed evaluated results into the shared compiler and export registry, preserving original scene data.

**Acceptance:** Real C4D fixtures produce matching supported geometry and animation through the deployed toolchain. Generic parser success or exchange-file conversion cannot establish native C4D completion. Missing renderers, generators or unsupported versions produce identified diagnostics.

**Verification:** Run native instances, generator evaluation, animated transforms, material references and missing-plugin cases; compare source views and output pose samples.

**Security review:** Run native evaluation with bounded privileges, resources and dependency access; verify output integrity before publishing.

**External evidence:** Provisioned Cinema 4D application/SDK and necessary plugins with supported deployment rights; real native runs required.

### A21 — CAD and BIM tessellation with retained metadata

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: A15.

**Deliverable:** Add specialist STEP/IGES and IFC adapters using qualified OCCT and IfcOpenShell builds. Tessellate supported surfaces/solids with configurable tolerances while retaining assemblies, units, object identifiers and useful BIM properties. Preserve construction sources and document semantics that runtime meshes cannot express.

**Acceptance:** Reference CAD assemblies and IFC buildings import at correct scale with selectable component identity and usable derived traversal. Changing tessellation tolerances creates new derivatives without changing originals. Export states precisely which metadata and geometry representations survive.

**Verification:** Compare bounds, tolerances, assembly transforms, IFC identifiers and property mappings against native references; test complex surfaces, absent units and unsupported entity types.

**Security review:** Bound tessellation complexity, schema expansion and metadata payloads; isolate parsers and inventory actual dependency licenses.

**External evidence:** Representative CAD/BIM source files and reference outputs; specialist binary builds must be qualified on deployment workers.

### A22 — Alembic and bounded simulation-cache playback

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: A16.

**Deliverable:** Implement an Alembic/cache adapter with explicit support for constant-topology deformation and a bounded changing-topology sequence route. Preserve source timing and dependency data; supply runtime playback and bundle serialization without mislabeling every cache as skeletal glTF. Define independent static or authored collision representations.

**Acceptance:** Qualified cache sequences play, seek, loop and restore after world export/reimport with their intended timing. Unsupported topology or storage requirements produce actionable results. Cache loading remains incremental and respects declared memory budgets.

**Verification:** Compare sampled vertices and frame timing with source references; exercise sparse frames, topology changes, seeking, interrupted loading, loop seams and bundle round trips.

**Security review:** Enforce decompressed-frame, sequence-duration, memory and decoder-time budgets; isolate archive/cache parsers.

**External evidence:** Representative native cache sequences and reference samples are needed to qualify each advertised cache feature.

### A23 — Point-cloud and Gaussian-splat streaming adapters

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: A16.

**Deliverable:** Implement specialized point-cloud and Gaussian-splat adapters with explicit schema detection, spatial streaming, picking and renderer integration. Preserve originals and component metadata; generate or attach separately qualified collision/traversal surfaces. Store adapter state and dependencies in world bundles and expose honest edit/export capabilities.

**Acceptance:** Representative scans stream at the selected device profile, retain scale and placement, and round-trip through complete world export. Visual splats are never treated automatically as solid meshes. Unsupported splat schemas are identified before placement.

**Verification:** Measure memory and frame timing, compare representative views, test point/splat classification, picking, cell transitions, collider alignment and bundle reconstruction.

**Security review:** Bound point counts, attribute sizes and GPU allocations; validate custom attributes and isolate specialized decoding.

**External evidence:** Selected renderer-adapter support and representative scan datasets must pass actual browser/device qualification.

### A24 — Complete asset coverage and representative venue acceptance

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: A17, A18, A19, A20, A21, A22, A23.

**Deliverable:** Publish the complete format/version/feature matrix and reproducible qualification corpus. Run the full intake, conversion, edit, optimization, physics and export workflow on substantial architecture and complex animated wildlife. Include direct-artist source/runtime deliverables, foreign-engine exchange exports, reference views and machine-readable results.

**Acceptance:** Every advertised native connector has passed real provisioned-toolchain conversion, and every format has meaningful feature and failure evidence. Venue openings, clips, materials and editable round trips pass; incomplete native dependencies remain visibly incomplete rather than credited to exchange workarounds.

**Verification:** Run corpus regression, cold/warm cache paths, corrupt dependencies, retry/cancel recovery and representative-device resource measurements against pinned builds.

**Security review:** Perform malicious-import and cross-tenant export probes against the integrated pipeline and verify source preservation after failures.

**External evidence:** Obtain representative source and runtime assets directly or by commission; native tools and required reference hardware must be available.

### A25 — Implement authenticated remote URL import and fetch brokerage

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A05.

**Deliverable:** Implement authenticated remote-source submission and a tenant-scoped fetch broker. Identify formats, preserve retrieved originals and provenance, and hand successful downloads to the existing asset/media preparation pipeline. Support bounded streaming downloads, cancellation, retries and actionable failure states.

**Acceptance:** An authorized user imports a permitted remote model or media file through the same publication workflow as an upload. Invalid destinations, redirects or failed downloads cannot create a misleading published asset or expose internal services.

**Verification:** Run real permitted fetches plus private-address, DNS-change, redirect-chain, oversized-body, timeout and interrupted-transfer cases; verify source preservation, idempotency and cleanup.

**Security review:** Authorize destination and tenant scope, revalidate DNS and every redirect, bind connections to validated addresses, restrict private/internal destinations and egress, strip unrelated credentials and enforce size/time limits.


## Networking

### N01 — Define versioned world networking contracts and adapters

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: F08.

**Deliverable:** Publish application-neutral contracts for room joins, input commands, acknowledgments, snapshots, transient poses, simulation clocks and connection lifecycle. Define message versions, entity identifiers, sequence numbers, idempotency keys and compatibility negotiation. Implement the selected networking adapter behind those contracts, with local and deterministic fixture transports for development.

**Acceptance:** An engine client negotiates a compatible protocol, joins a fixture room and exchanges typed state without conference imports. Unsupported versions fail with an actionable upgrade result. Commands and disposable poses have distinct documented delivery requirements.

**Verification:** Exercise valid and malformed wire fixtures, version negotiation, duplicate commands, stale sequences and adapter teardown; retain compatibility fixtures for future releases.

**Security review:** Bound decoded sizes and collection lengths before allocation. Treat client identifiers, timestamps and requested operations as untrusted input.

### N02 — Implement authenticated authoritative room membership

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N01, W02.

**Deliverable:** Implement Colyseus-backed room creation, join, leave and lifecycle APIs using the foundation choice. Bind each room to an immutable world revision and tenant. Exchange host-application authorization for short-lived engine grants, then maintain server-verified membership, capabilities, participant identity and connection status without embedding conference roles.

**Acceptance:** Two generic applications can join authorized worlds through the same API. Expired, revoked, wrong-instance and wrong-tenant grants fail. Rejoining retains the intended principal identity while duplicate active sessions follow an explicit policy.

**Verification:** Run multi-tenant integration cases covering grant renewal, disconnect, duplicate identity, incompatible world revision, denied join and clean room disposal.

**Security review:** Recheck capabilities on protected operations; a successful join is not permission to edit, publish media or administer the room. Keep service credentials server-side.

### N03 — Run the world through a fixed-step authoritative simulation

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N02, W07.

**Deliverable:** Connect room lifecycle to the renderer-independent physics runtime and a bounded fixed-step input queue. Separate simulation frequency, publication rate and client rendering. Validate movement and interactions against authoritative collision, apply explicit limits to dynamic entities, and expose snapshots without writing every tick into persistent authoring history.

**Acceptance:** Multiple clients observe one authoritative object state, floor and wall layout. Client quality settings do not change collision. Unauthorized teleports, excessive command rates and attempts to create unbounded bodies are rejected predictably.

**Verification:** Run shared collision fixtures at configured tick rates; inject delayed inputs, overloaded ticks and invalid movement while measuring tick headroom and queue limits.

**Security review:** Treat client transforms as requests. Validate magnitude, finite numbers, world bounds and capabilities before modifying the physics state.

### N04 — Add client prediction, reconciliation and remote interpolation

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N03, W14.

**Deliverable:** Integrate qualified Colyseus prediction and reconciliation primitives with the shared movement simulation. Buffer and acknowledge inputs, replay unacknowledged movement after authoritative corrections, and interpolate remote entity poses. Keep actual headset tracking local while reconciling the avatar body and validated locomotion; publish measurable correction and interpolation diagnostics.

**Acceptance:** Local movement responds immediately while server corrections converge. Remote avatars move smoothly through publication gaps. Crossing a wall cannot become permanent through prediction, and correction never forcibly replaces the headset's real tracked pose.

**Verification:** Exercise latency, jitter, reordered snapshots, reconnect and correction under the qualified browser/runtime versions; measure error without assuming cross-platform bitwise physics determinism.

**Security review:** Server validation remains authoritative regardless of prediction. Bound retained input history, reconciliation work and accepted client clock skew.

### N05 — Arbitrate object interactions through expiring control leases

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N04, W09.

**Deliverable:** Implement a reusable server-owned lease primitive and apply it to grab, carry, release, throw and interaction commands. Bind leases to principal, entity, operation, expiry and authority epoch. Resolve simultaneous requests deterministically, validate ongoing movement, and emit interaction results that clients can predict and reconcile.

**Acceptance:** Only one authorized holder controls a contested object. Disconnect, expiry, deletion and authority changes release or invalidate ownership. An explicit save can later persist selected transforms; routine object movement does not modify the reusable world template.

**Verification:** Exercise competing grabs, stale holder commands, lease renewal races, disconnect while carrying, excessive throws and entity deletion during an interaction.

**Security review:** Check capability, reach, allowed velocity and object constraints server-side. Never accept possession merely because the client renders an object as selected.

### N06 — Bound network traffic and protect reliable commands

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N03.

**Deliverable:** Add separate outbound scheduling for acknowledged commands, essential state and replaceable poses. Begin with secure WebSockets: coalesce superseded poses before sending, bound all queues, apply backpressure and prioritize control traffic. Expose byte, queue-age and drop metrics; keep a transport extension point without claiming WebSocket frames are unreliable datagrams.

**Acceptance:** A slow client cannot accumulate unlimited memory. Release commands outrank unsent decorative updates; transport head-of-line delay remains measured. Queue overflow follows explicit degradation and reconnect rules, and pose publication can slow independently of simulation and rendering.

**Verification:** Throttle links, suspend receivers, flood decorative changes and resume traffic; verify memory bounds, command acknowledgments, coalescing and stale-update rejection.

**Security review:** Enforce per-principal message and byte limits, bounded parsing and fair scheduling. Disconnect abusive senders without starving unrelated room members.

### N07 — Add spatial relevance and per-client state filtering

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N04, N06.

**Deliverable:** Maintain a spatial index and explicit relevance tiers for avatars, props and transient events. Use qualified Colyseus per-client filtering for bounded state sets, reduce distant pose detail and expose authorized proximity signals to media adapters. Send immutable assets through manifests and storage rather than frequent room patches.

**Acceptance:** Crossing a relevance boundary adds and removes entities without flicker or stale ghosts. Nearby interactions retain required fidelity, while distant traffic decreases. Private entities remain absent from unauthorized state even when geometrically close.

**Verification:** Move clients through dense cells, teleports and rapidly changing visibility; measure filtering CPU, serialization time, payload size and transition correctness with realistic avatar data.

**Security review:** Intersect relevance with permissions before serialization. Distance and visibility are optimization inputs, never authorization. Bound per-client tracked sets and transition work.

### N08 — Route rooms to fenced owners across a worker fleet

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N02.

**Deliverable:** Implement room placement, owner discovery and routing to the process that hosts each room. Add owner leases with monotonically changing epochs, admission based on measured capacity profiles, and drain-aware placement. Qualify the selected Redis-compatible coordination implementation, including Valkey only after testing the exact commands, scripts, TTLs and failover behavior used.

**Acceptance:** A join reaches its current owner behind a nonsticky load balancer. Fenced workers cannot commit as concurrent authorities. Adding workers increases room capacity without claiming that one room spans unlimited processes.

**Verification:** Exercise owner contention, expired leases, coordinator restart, TLS, script compatibility, network partitions and randomized reconnect routing in a multi-worker harness.

**Security review:** Authenticate coordination and worker traffic; validate routing grants and epochs. Prevent clients from selecting an unauthorized internal worker or tenant.

**External evidence:** A qualified coordination service with the required Redis protocol behavior and a deployment path that can route connections to room owners.

### N09 — Recover rooms through checkpoints and controlled reconnects

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N05, N08.

**Deliverable:** Persist versioned checkpoints of recoverable transient state, world revision references and command progress. Implement reconnect negotiation, checkpoint restoration, owner-epoch changes and planned drain handoff. Distinguish durable edits from recoverable motion and document potential checkpoint loss; use controlled reconnects until uninterrupted migration is actually demonstrated.

**Acceptance:** A crashed room restores to a declared checkpoint and clients converge on its new authority. Stale leases and duplicate commands cannot replay ownership or saved edits. Planned deployment drains stop new admissions and guide existing clients through recovery.

**Verification:** Kill workers during grabs and checkpoints, corrupt a snapshot, retry commands and roll service versions forward/back within the supported compatibility window.

**Security review:** Reauthorize returning principals and validate checkpoint provenance. Do not restore expired credentials or persist unnecessary detailed head/hand tracking history.

### N10 — Provide authenticated Yjs collaboration and persistence

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N02.

**Deliverable:** Create an application-neutral Yjs provider for notes, whiteboards and annotations with document-scoped authorization, persistence, bounded updates and ephemeral awareness. Separate document identity from room identity so explicitly permitted documents can survive sessions. Define an opaque encrypted-update transport extension without treating Yjs as the authority for physics or presenter control.

**Acceptance:** Concurrent edits converge after disconnect and reload. A document can be shared across authorized instances without leaking into another tenant. Read-only members cannot submit persisted changes, and transient cursor awareness does not become permanent tracking history.

**Verification:** Exercise concurrent edits, compaction/reload, reconnect, oversized updates, revocation, denied document IDs and persistence failure with recovery.

**Security review:** Authorize every document subscription and write. Limit update size and processing cost; sanitize rendered content separately from CRDT convergence.

### N11 — Add scoped chat and ephemeral collaboration channels

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N06.

**Deliverable:** Provide generic room, group and direct-participant message channels with server-assigned ordering, idempotent sends, pagination and configurable retention. Add bounded ephemeral channels for reactions, pointers and presence. Expose moderation capabilities and lifecycle events for applications without implementing event roles, agendas or a conference-specific moderation interface.

**Acceptance:** Authorized members can exchange messages across reconnects without duplicates. Membership changes stop future delivery, and ephemeral signals expire. Applications select retention and deletion policies through engine APIs rather than modifying the transport implementation.

**Verification:** Verify ordering, repeated sends, private group transitions, deletion, pagination, denied recipients, rate limiting and reconnect after missed traffic.

**Security review:** Check channel membership on send and receive. Render untrusted text safely, bound attachments, and prevent user-controlled identifiers from crossing tenant boundaries.

### N12 — Qualify networking under realistic load and failure

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N07, N09, N10, N11.

**Deliverable:** Build repeatable multi-client and multi-room qualification scenarios with representative avatar poses, dynamic objects, interactions and collaborative edits. Exercise proposed 20, 50 and 100 participant profiles while measuring owner CPU, tick headroom, serialization, bandwidth, memory and recovery. Publish passing configurations and limits rather than a universal participant claim.

**Acceptance:** A standalone networking qualification harness works without conference services; W21 separately verifies the packaged game examples. Load and fault results identify the supported interaction profile, software versions and hardware. Rooms recover without split authority, unbounded queues or cross-tenant delivery.

**Verification:** Combine network impairment, worker/coordinator failures, rolling upgrades, competing grabs and document traffic; retain traces and reproducible fixture commands as release evidence.

**Security review:** Include hostile message rates, forged grants and relevance-boundary access attempts. Use synthetic principals and exclude private content from diagnostic traces.

**External evidence:** Representative load hosts and target network profiles sized to the proposed qualification scenarios.

### N13 — Coordinate revocation and generic moderation across services

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N11, N10, N14, M12.

**Deliverable:** Implement engine operations for removing principals, restricting publication/editing, expiring bans and invalidating control leases across world, media and collaboration services. Publish idempotent revocation events with measurable enforcement latency. Persist membership/revocation events and consumer acknowledgments. Apply them to collaboration writes/subscriptions, durable editing, presenter leases and device eligibility for future key envelopes; M16 consumes the same event lifecycle.

**Acceptance:** Removal stops protected activity and future media delivery across active connections and reconnects. Host applications define role policy while the engine enforces scoped actions; partial service failure has a documented fail-closed path.

**Verification:** Exercise revocation races, unavailable consumers, stale grants, repeat commands, ban expiry and attempts to retain an active presenter or grab lease. Verify one removal across world commands, documents, editing, presenter/grab leases, media admission and key-envelope eligibility.

**Security review:** Authorize the moderator and target scope, retain safe audit records and prevent cross-tenant removal or silent access restoration after recovery.

### N14 — Implement durable world revisions and authoring transactions

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W01, N01.

**Deliverable:** Implement the server APIs for world templates, revisioned entity changes, idempotent command groups, history queries, optimistic conflicts and explicit snapshot publication. Keep these generic APIs independent of the browser editor and live physics ticks.

**Acceptance:** Two authorized clients can commit disjoint changes and receive explicit conflicts on incompatible edits. Undo creates a valid compensating revision. A published world references a consistent immutable dependency set.

**Verification:** Run database integration tests for concurrent commits, retries, interrupted transactions, migration, history visibility and snapshot restoration.

**Security review:** Validate principal, tenant, entity and dependency read permissions; audit changes without recording transient participant tracking or embedding credentials in world data.


## Audio and media

### M01 — Establish the shared spatial-audio graph and listener contract

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W02.

**Deliverable:** Define serializable AudioEmitter and AudioZone components plus source adapters for buffers, media elements and live tracks. Build the Babylon AudioEngine v2/Web Audio integration with one local listener, category buses and explicit nonspatial modes. Bind listener position/orientation to desktop camera or XR head pose using canonical meters and coordinates.

**Acceptance:** A world source routes through exactly one spatial path. Entering or leaving XR switches the listener without duplicate audio or one listener per eye. World video defaults to spatial playback; global amplification requires an explicit configuration.

**Verification:** Verify coordinate fixtures, head rotation, camera changes, graph ownership, source disposal and serialization round trips using deterministic audio probes.

**Security review:** Source references resolve through authorized engine assets or tracks. Do not allow imported scene data to execute arbitrary audio-processing scripts.

### M02 — Implement attached sounds, distance curves and continuous music mixing

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M01, A05.

**Deliverable:** Add reusable short-sound buffers, streaming loops and entity/local-offset attachments. Implement configured attenuation, reference distance, rolloff, directional cones and a separate fade-start/audible-radius envelope. Preserve explicit mono/stereo handling and support calibration metadata. Attach sources to interpolated transforms so animated birds and moving objects carry their sounds smoothly.

**Acceptance:** Four distinct calibrated corner tracks remain continuously mixed with equal attenuation at equal distance; approaching a corner changes the balance smoothly. A bird's source follows its transform. Inverse falloff still reaches zero at the engine's configured cutoff.

**Verification:** Measure gain and channel behavior with fixtures; exercise loops, changing distance, replacement, moving attachments and HRTF/equal-power profiles.

**Security review:** Bound decoding and cached buffers by published asset limits. Reject nonfinite gains or malformed distance settings before constructing audio nodes.

### M03 — Add area emitters, acoustic zones and bounded occlusion

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M02, W07.

**Deliverable:** Implement authored point, line and area-source approximations for waterfalls and broad sound features. Add optional acoustic zones, bounded collision-query occlusion, smooth low-pass/gain changes and modest reverb sends. Publish editable parameters and serialization hooks while keeping all sources within one coherent gain and phase model.

**Acceptance:** A waterfall grows louder near its authored extent rather than only near its center. Crossing zone boundaries remains smooth. Multiple emitters do not accidentally multiply the source level, and geometric walls influence the configured approximation without claiming full acoustic simulation.

**Verification:** Check area edges, moving listener paths, zone overlaps, normalized multi-emitter output and query budgets; compare occluded and unobstructed fixtures.

**Security review:** Acoustic attenuation never grants privacy. Bound emitter counts, impulse-response resources and per-frame geometry queries for creator-authored zones.

### M04 — Manage audio activation, mixing controls and resource budgets

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M03.

**Deliverable:** Implement gesture-based audio unlock, suspension/resume handling and per-user voice, video, music, ambience and effects controls with master headroom. Budget active decoders and panners independently of graphics. Virtualize inaudible loops with hysteresis and preserved timeline, and expose a listener policy for applications using an accessible 2D view.

**Acceptance:** Join activation works within browser permissions. Headset sleep and tab suspension recover without duplicate nodes. Resource pressure preserves prioritized voice and presentations, while any quality downgrade retains distance behavior and avoids nearest-source switching among audible corner tracks.

**Verification:** Stress declared source budgets; cycle suspension, resume, scene reload and user mute; measure node/decoder cleanup and preserved loop positions.

**Security review:** Enforce source limits even for trusted-looking manifests. Device and autoplay restrictions produce actionable state, never hidden attempts to bypass user permissions.

### M05 — Introduce the LiveKit media adapter behind engine contracts

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N02.

**Deliverable:** Define media-session, publication, subscription and track-lifecycle interfaces independent of conference UI and world object semantics. Implement the selected LiveKit client/server adapter with stable source identities, connection state, mute/replacement events and service-side token issuance. Support both configured self-hosted and managed endpoints through the same public contract.

**Acceptance:** A generic engine sample publishes and receives media through the adapter without importing a meeting application. Switching endpoint configuration preserves object bindings. Reconnect and track replacement have explicit events that downstream spatial systems can consume.

**Verification:** Run adapter contract cases for join, publish, mute, replace, disconnect, reconnect and disposal; verify server/client version compatibility.

**Security review:** Keep API secrets server-side. Bind issued media identities to verified engine principals and fail closed on unsupported or unauthorized publication requests.

**External evidence:** A reachable LiveKit-compatible media service for integration testing; M07 supplies the self-hosted qualification environment.

### M06 — Enforce private media membership and subscription permissions

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M05.

**Deliverable:** Map engine capabilities to narrow media-room, publication and subscription grants. Implement server-enforced private conversation membership, source permissions, renewal and revocation. Use separate authorized media rooms or verified server-side subscription enforcement where required; do not rely on client muting or a cooperative publisher to protect private streams. Implement a qualified self-hosted admission/revocation path at every signaling entry and reconnect, with membership epochs, no direct bypass and enforceable media-node checks for active-session access. Use a maintained server integration where needed; short token TTL alone is insufficient. Expiring authorization leases must bound active-session access when the control plane is unavailable.

**Acceptance:** A modified client cannot subscribe to an unauthorized nearby microphone, private group or tenant. Membership removal stops future delivery through the tested service path. Applications choose group policy while the engine enforces identities, scopes and operations. Original and server-refreshed cached tokens cannot restore removed permissions. Measure the maximum enforcement interval, including control-plane partitions, and keep the claim blocked until the configured enforcement mechanism passes.

**Verification:** Attempt direct SDK subscriptions, forged track IDs, reused grants, stale membership and cross-room access; test revocation during playback and reconnect. Reuse original/refreshed tokens after removal, attempt direct signaling access and interrupt management/control services during active media; verify bounded termination without granting stale access.

**Security review:** Acoustic range and AOI are independent of permission. Document grant lifetime and revocation latency; never expose service administrator credentials to browsers.

### M07 — Ship a self-hosted SFU and TURN deployment harness

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M06, N08.

**Deliverable:** Provide pinned LiveKit and TURN configurations, local integration orchestration and a reference production deployment with explicit UDP/TCP ports, TLS, public addressing and health checks. Qualify coordination compatibility and node draining. Document the single-node room boundary, region placement and which hosting services can expose the required media networking.

**Acceptance:** Two external clients communicate through direct connectivity and forced TURN fallback. Multiple rooms distribute across the media fleet, while one room's capacity remains measured. Planned node drain and failure produce documented reconnect behavior and actionable diagnostics.

**Verification:** Exercise restricted networks, UDP blocking, TCP/TLS fallback, certificate renewal, coordinator interruption and media-node restart using external probes.

**Security review:** Use authenticated expiring TURN credentials, restricted administration and secrets injection. Prevent the relay from becoming an unauthenticated public service. Expose signaling only through the qualified admission path and deploy the M06 media-node revocation/lease enforcement configuration.

**External evidence:** UDP-capable test hosts with routable public addresses, DNS/TLS certificates and controlled external clients; generic HTTP-only hosting is insufficient.

### M08 — Attach remote microphones to avatars without duplicate playback

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M04, M06, W14.

**Deliverable:** Wrap each selected incoming microphone track in a single-track media-stream audio source and bind it to the avatar's interpolated head/mouth offset. Reconcile track identity, mute, replacement and teardown with the media adapter. Publish local microphone capture outbound without default local monitoring or a simultaneous global conference audio renderer.

**Acceptance:** Walking avatars carry their voices; listener motion and head rotation change the mix appropriately. Muting, reconnecting or replacing a microphone never creates two playback paths. Missing avatars use an explicit temporary binding policy rather than silently becoming global audio.

**Verification:** Use two moving clients to check spatial gain, track replacement, mute, late avatar arrival, device permission denial and clean disposal.

**Security review:** Create nodes only for authorized subscribed tracks. Revocation tears down playback promptly; local capture starts only after the browser's permission flow.

### M09 — Create generic media surfaces and an extensible viewer registry

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M01, A25.

**Deliverable:** Implement media-surface entities with source revision, aspect ratio, audio binding, preview state and disposal lifecycle. Add a registry for authorized viewers/converters and an attachment fallback that preserves originals. Expose the same content through world surfaces and accessible 2D views without assuming arbitrary websites, native applications or file formats render inside VR. Resolve imported external file sources through the A25 broker and preserve their publication identity.

**Acceptance:** Images, registered content and unknown attachments can be placed, replaced, moved and deleted without orphaned resources. Unsupported files receive a clear attachment/preview result. A surface exports and reimports with stable source and audio references.

**Verification:** Exercise registry selection, unsupported types, missing revisions, loading failures, replacement, lifecycle cleanup and serialization.

**Security review:** Treat viewer plugins as trusted engine extensions. Resolve files through authorized storage and validate external fetches; never execute embedded active content automatically.

### M10 — Publish camera and screen capture onto world surfaces

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M08, M09.

**Deliverable:** Add explicit camera and desktop screen-capture workflows, publication controls and live textures. Associate captured audio with the intended screen/camera emitter without duplicating microphone playback. Provide a short-lived paired-device presentation capability so a desktop can originate a stream while a headset receives it; keep application presenter policy outside the engine.

**Acceptance:** A desktop user chooses the capture source through the browser prompt. Headsets display supported incoming streams regardless of their ability to originate capture. Stop-sharing, source termination and replacement update both picture and spatial sound.

**Verification:** Qualify capture denial, window/tab/system-audio variations, ended tracks, paired-device expiry and mixed microphone/screen audio on supported browsers.

**Security review:** Require user activation and scoped publication grants. Pairing must bind verified principals and require explicit device confirmation; never silently capture another device.

**External evidence:** Actual supported desktop browsers and headset receivers; available capture-audio sources vary by browser and operating system.

### M11 — Play uploaded video through one synchronized visual/audio element

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M04, M09, M24.

**Deliverable:** Load qualified uploaded-video variants into one media element used by both the video texture and MediaElementAudioSourceNode. Connect its audio once to the screen emitter, expose play/pause/seek/loop controls and preserve source clock ownership. Handle authorized CDN access, CORS, codec selection and clear failure states.

**Acceptance:** A looping wall video sounds as if it comes from its screen, including after movement or replacement. Pausing and seeking affect picture and sound together. Muting its emitter removes that video's audio completely, with no independent global route.

**Verification:** Exercise loops, seeks, resize, disposal, unsupported codecs, expired URLs and CORS failures while measuring audio/video alignment.

**Security review:** Use published validated variants and authorized delivery. Reject arbitrary decoder inputs beyond resource limits and avoid exposing signed media URLs in logs.

### M12 — Synchronize presentation control and media playback across clients

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M10, M11, N09.

**Deliverable:** Apply server-owned presentation leases to source selection, page changes and video controls. Synchronize asset revision, source identity, sequence number, play state, position, rate and server-time anchor. Implement late-join reconstruction and measured drift correction; keep transient pointers separate from durable content and application-specific presenter selection. Register checkpoint/restore hooks for source revision, page, playback time anchor and controller epoch with N09; invalidate stale presenter leases after authority-owner changes.

**Acceptance:** Only the current authorized controller changes a surface. Late joiners reach the current page or video position, and lease expiry or handoff cannot replay stale controls. Each client shares playback state while retaining its own spatial audio mix.

**Verification:** Inject clock offset, delayed controls, duplicate seeks, simultaneous handoff, late join and buffering; measure drift and sequence convergence. Crash the world owner during active video and presenter handoff, restore the checkpoint and verify late-join reconstruction with a new authority epoch.

**Security review:** Validate every control operation against entity scope and lease epoch. Source changes must reference authorized published content, not unchecked external URLs.

### M13 — Allocate media subscriptions from world visibility and audio relevance

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N07, M10, M11.

**Deliverable:** Drive stream subscription and quality from projected surface size, visibility, priority and decoder budgets rather than hidden HTML-element dimensions alone. Add authorized voice pre-subscription margins, smooth fades and hysteresis around audible boundaries. Prioritize active presentations and speech while exposing policy hooks for applications and device profiles.

**Acceptance:** A visible video texture does not stop because its backing element is hidden. Crossing a voice range avoids rapid subscription churn and clipped initial speech under the qualified margin. Revoked streams are removed regardless of retention margins or priority.

**Verification:** Exercise occluded screens, moving listeners, rapid viewport changes, constrained decoder counts, competing streams and permission changes while measuring quality transitions.

**Security review:** Intersect every optimization decision with server authorization. Client proximity requests cannot widen private media membership or bypass source permissions.

### M14 — Render PDF slides, images and readable text surfaces

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M12, M25.

**Deliverable:** Integrate PDF.js page rendering, image panels and text surfaces with bounded resolution, lazy page loading and accessible 2D text/navigation. Consume immutable office-to-PDF outputs and publish page metadata to presentation synchronization. Preserve original documents and show conversion limitations, including unsupported animations, fonts or embedded applications.

**Acceptance:** A presenter changes a slide once and authorized clients display the same page revision in desktop and immersive views. Nearby text remains readable within the qualified device budget. Users can access original files and choose screen sharing when static conversion loses essential behavior.

**Verification:** Use large-page, font, rotation, image and malformed-document fixtures; verify page identity, accessibility, resource limits and late joins.

**Security review:** Disable automatic execution or navigation from document actions. Resolve external references through approved policies and isolate conversion outside the browser runtime.

**External evidence:** The qualified office-conversion and font environment supplied by the document-conversion lane.

### M15 — Connect shared notes, whiteboards and page annotations to surfaces

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N10, N11, M14.

**Deliverable:** Bind Yjs documents to reusable notes, whiteboard and annotation surfaces. Implement desktop and qualified XR input, vector strokes, selection and accessible editing views. Anchor annotations to asset revision and page coordinates; send pointers through ephemeral channels while preserving persistent content separately from server-owned presentation control.

**Acceptance:** Concurrent notes and strokes converge after reconnect. Page changes keep annotations on their correct page and source revision. Read-only viewers can follow presentations without acquiring edit authority, and world export retains permitted document references and content snapshots.

**Verification:** Exercise simultaneous edits, page switching, source replacement, disconnected drawing, permission changes, export/reimport and keyboard operation.

**Security review:** Enforce document and surface permissions independently. Bound stroke density and text size, sanitize displayed content and prevent annotations from becoming executable scene behavior.

### M16 — Implement authenticated media E2EE keys and membership epochs

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N13.

**Deliverable:** Define the E2EE threat model and implement a reviewed endpoint-authentication and key-envelope protocol around LiveKit's encryption support. Generate session epoch keys at authorized endpoints, distribute encrypted envelopes to verified devices, and rotate on membership changes. Handle late joins, reconnects, key loss, revocation and explicit recovery policy without plaintext keys in service logs. Consume N13 membership/revocation events for device eligibility and key-epoch changes. Scope keys to each actual authorized private media audience rather than sharing one world-wide key.

**Acceptance:** Only admitted endpoints obtain current media keys. Removed devices cannot decrypt future epochs; key loss fails visibly rather than silently disabling encryption. Document that signaling metadata remains server-visible and that revocation cannot erase previously received content.

**Verification:** Exercise device substitution, forged envelopes, late join, removal, reconnect, rotation races and unsupported-browser failure using reviewed protocol fixtures.

**Security review:** Use established cryptographic primitives and authenticated endpoint identities. Block production E2EE claims until protocol and integration review passes.

**External evidence:** A reviewed browser-compatible key-envelope/group-key implementation and security review of endpoint authentication and key lifecycle.

### M17 — Protect shared content with explicit encrypted-processing boundaries

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M16, M14.

**Deliverable:** Add client-encrypted document updates, snapshots and prepared media/assets using the established key lifecycle and opaque storage/relay contracts. Keep server-required simulation state outside this promise. Provide explicit modes for local preparation or an admitted converter that can read source content; encrypted storage must not silently bypass validation or claim invisible server conversion.

**Acceptance:** Authorized clients restore encrypted shared documents and render prepared content after reconnect while storage contains ciphertext. Revoked members cannot obtain new epochs. Choosing server conversion or processing identifies the endpoint's access rather than describing it as outside the trust boundary.

**Verification:** Verify encrypted persistence/reload, tampering, wrong keys, large updates, key rotation and conversion-mode transitions with synthetic content.

**Security review:** Authenticate ciphertext metadata and scope keys to content audiences. Keep client resource limits, provenance and access controls after decryption.

### M18 — Record sessions through an explicitly authorized processing endpoint

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: M07, M17.

**Deliverable:** Provide recording start/stop/status APIs and a separate recording worker using qualified LiveKit egress or an admitted receiver endpoint. Define captured tracks, surface composition and synchronization metadata. Publish immutable recording artifacts with access and retention hooks. For encrypted sessions, admit a recorder with keys only through explicit application-approved processing policy. Implement a reusable program-composition input contract for live tracks, file-backed audio/video with M12 playback anchors and PDF/slide state. Select a produced mix or a defined listener/viewpoint mix; file-backed sources require content authorization and keys independently of media-track encryption.

**Acceptance:** Recording captures the declared program and produces playable, synchronized output with recoverable failure status. Private sessions cannot gain an undisclosed recorder. The API distinguishes ordinary egress from an E2EE-capable processing path instead of assuming stock egress decrypts arbitrary sessions. A live microphone, a PDF slide change and an uploaded wall video with soundtrack appear once each when selected, at the correct program times; excluded/private sources remain absent.

**Verification:** Exercise start/stop races, worker crash, missing tracks, key rotation, revoked recorder, retry idempotency and artifact deletion. Exercise the mixed live-track, slide and file-video fixture through capture and playback, checking source selection, timing, audio duplication and separate content/media key access.

**Security review:** Authorize recording separately from listening. Scope processor keys and storage access, and avoid logging decrypted media or reusable credentials.

**External evidence:** A deployed recording/egress worker with measured CPU capacity and durable artifact storage.

### M19 — Integrate authorized captions and transcription providers

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: M18.

**Deliverable:** Define a transcription provider contract and an explicitly admitted caption-processing endpoint. Route authorized audio, emit speaker/source identifiers and timestamped partial/final captions, and render readable captions in desktop, 2D and qualified XR surfaces. Expose transcript export, access and retention hooks while keeping application language and recording policy separate. Consume the M18 program-input contract, including selected file-backed audio; possession of media-track keys does not grant document or file access.

**Acceptance:** Captions track the selected audio program and remain aligned through source changes. Encrypted sessions identify the processor as a key-holding endpoint or disable processing clearly. Users can distinguish partial corrections and unavailable transcription from finalized text.

**Verification:** Use known speech fixtures, interruption, mixed sources, caption revisions, provider failure and key revocation; measure latency and documented recognition limits.

**Security review:** Grant only necessary tracks and keys. Protect transcript artifacts as content, with tenant-scoped access and configurable deletion.

**External evidence:** A selected and licensed self-hosted speech-recognition runtime/model or configured transcription provider, plus representative language fixtures.

### M20 — Relay a shared stage program across independent audience rooms

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: M13, M18.

**Deliverable:** Implement a generic stage-program source with a common clock, track/source identifiers and an actual authorized relay or republishing worker into independent audience media rooms. Propagate presentation state with measured relay delay, reconnect and source replacement behavior. Keep audience world instances separate and expose topology controls for applications. Reuse the M18 program-input contract to coordinate live tracks, authorized file-backed video/audio timelines and slide state across audience rooms.

**Acceptance:** Clients in different audience rooms receive the same live program through real media delivery, not merely matching identifiers. One audience-room failure does not stop the stage. Capacity evidence separates stage publishers, relay fanout, per-room limits and aggregate attendance.

**Verification:** Exercise multiple rooms, relay interruption, publisher replacement, clock alignment, room churn and encrypted-mode key rotation under measured traffic.

**Security review:** Authorize each relay destination and its source access. Any relay that decrypts content is an admitted processing endpoint, with explicit keys and trust.

**External evidence:** Relay/republishing capacity and multi-room SFU infrastructure with routable media connectivity for load qualification.

### M21 — Deliver a produced broadcast with viewer-latency awareness

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: M20.

**Deliverable:** Add a produced-program broadcast adapter with qualified segmented video delivery, authenticated manifests and CDN/object-storage configuration. Map viewer playback time to the stage program clock so slides, annotations and application interactions can account for broadcast delay. Support lightweight and world-surface receivers, with spatial screen audio unless explicit amplification is selected.

**Acceptance:** Many receiver instances share a program without joining one unbounded interactive room. Late joins and buffering preserve the declared synchronization model. The API exposes latency and live-edge status rather than presenting delayed viewers as identical to stage participants.

**Verification:** Exercise buffering, seeking within the allowed window, token expiry, source discontinuity, CDN failure and viewer-time alignment. Verify the microphone, changing PDF and uploaded wall-video soundtrack fixture end to end, with each chosen input captured once and private inputs excluded.

**Security review:** Protect manifests and segments with scoped access. Document revocation/cache/buffer limits; broadcast distribution does not automatically preserve media E2EE.

**External evidence:** A selected broadcast packaging path and CDN/object store supporting required access controls, media formats and CORS.

### M22 — Promote audience participants into live publishing safely

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: M21.

**Deliverable:** Implement application-neutral promotion and demotion transactions between audience reception and authorized live publishing. Obtain fresh grants, establish the interactive connection, transfer relevant control leases and switch playback paths with feedback prevention. Provide status and rollback hooks; applications decide who is invited, accepted or returned to the audience.

**Acceptance:** An authorized audience member can join the live stage without hearing a delayed copy of themselves or retaining duplicate program audio. Failed promotion returns to a usable audience state. Demotion revokes publication and restores the appropriate audience clock and subscriptions.

**Verification:** Exercise accepted/declined invitations, slow permissions, reconnect mid-transition, duplicate requests, source-device failure and simultaneous handoffs.

**Security review:** Reauthorize at each boundary, expire transfer grants and revoke old capabilities. Audience membership alone cannot acquire microphone or presenter authority.

### M23 — Qualify the complete spatial-media graph on real devices

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: N12, M15, M19, M22.

**Deliverable:** Run reproducible end-to-end scenarios combining four-corner music, moving birds, avatar microphones, area waterfalls, looping screens and live presentations. Qualify laptop speakers, headphones and actual headsets through the final graph, including echo cancellation, output-device changes and resume. Publish supported browser/device configurations, source budgets, drift, frame/audio cost and network conditions.

**Acceptance:** Spatial behavior, permission enforcement and single-route playback survive reconnect and source replacement. Acoustic quality remains usable under the declared concurrent load. Stage, broadcast, recording and caption results identify their different latency, trust and capacity profiles.

**Verification:** Include blind listening checks, instrumented gain fixtures, restricted-network runs, device swaps, processor failure and hostile subscription attempts; retain evidence for release.

**Security review:** Use consented test participants and synthetic content. Verify no private tracks, plaintext keys or transcript content enter diagnostics.

**External evidence:** Reference laptops with speakers/headphones, actual supported headsets, external network probes and consented human listeners for perceptual and echo tests.

### M24 — Implement video and audio preparation workers

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A05.

**Deliverable:** Integrate pinned FFmpeg workers for metadata probing, browser-playable video/audio variants, thumbnails and loudness metadata. Define supported codec/container profiles, preserve originals and publish immutable derived media through the asset pipeline.

**Acceptance:** Representative uploaded media plays through the supported browser profiles with the correct duration, channel layout and seek behavior. Invalid input and unavailable codecs produce clear diagnostics rather than silent audio loss.

**Verification:** Test variable frame rate, silent and multi-channel inputs, corrupt containers, large files, cancellation, retry and resulting browser playback.

**Security review:** Run untrusted containers under resource/egress limits, audit the actual FFmpeg build and prevent path, playlist or remote-reference escape.

### M25 — Implement office document conversion and safe previews

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: A05.

**Deliverable:** Integrate a pinned headless office converter for supported presentation/document inputs, PDF/page outputs and thumbnails. Package fonts and record conversion differences; expose original retrieval and desktop sharing for features that static pages cannot preserve.

**Acceptance:** Representative slide decks and documents yield readable page sequences with correct order and useful font/layout diagnostics. Encrypted, corrupt or unsupported inputs have explicit outcomes; embedded macros do not execute.

**Verification:** Compare reference pages, fonts, images, slide order, failures and cancellation; verify output through the browser PDF renderer when M14 is integrated.

**Security review:** Isolate office parsing, disable active content and network references, enforce file/page/resource limits and retain private-document access controls.

### M26 — Qualify core spatial audio and laptop echo behavior

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M13, M16, N12.

**Deliverable:** Run the core four-corner, moving-source, waterfall and wall-video audio scenarios on headphones, laptop speakers and actual supported headsets. Exercise microphone echo cancellation through the final playback graph and record core source/decoder budgets.

**Acceptance:** Equally calibrated sources have matching distance gains at equal distances; movement changes the mix continuously. Video audio remains screen-attached with one route. Simultaneous conversation and video remain usable without feedback under the declared profile.

**Verification:** Measure gain/cutoff behavior and A/V drift; perform listening, device-change, reconnect, permission-denial and headset-resume checks with real output/capture devices.

**Security review:** Confirm private streams stay inaccessible and diagnostic output contains no audio content or keys; failures remain release blockers for affected profiles.

**External evidence:** Reference laptop speakers/headphones and actual supported headsets


## Authoring

### B01 — Adapt the browser editor shell and scene selection

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: W04.

**Deliverable:** Wrap the qualified browser authoring foundation or build missing shell components: hierarchy outline, viewport selection, inspector hosting, tool modes and host-injected authorization. Keep editor packages application-neutral and reusable independently of conference administration.

**Acceptance:** An imported world exposes stable selectable entities and hierarchy without duplicating renderer-owned objects. Selection stays synchronized between outline and viewport. Keyboard navigation, focus transitions and read-only mode work, and replacing the world clears obsolete selections safely.

**Verification:** Exercise nested/instanced scenes, multi-selection, deleted entities, keyboard operation and scene replacement in browser tests; inspect accessible names and focus order.

**Security review:** Read-only presentation is not enforcement; editor commands require a valid capability and sanitize asset-provided labels before display.

### B02 — Add transactional transforms, cloning and prefab editing

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: B01, W09.

**Deliverable:** Implement transform gizmos, numeric entry, snapping, reparenting, cloning and prefab instance overrides through a shared authoring-command model. Provide local preview and reversible grouped edits while preserving source pivots and stable object identity.

**Acceptance:** Dragging a group creates one logical undo step rather than a history entry per frame. Cloning allocates new identifiers, prefab overrides remain distinct from source definitions and reparenting preserves intended world transforms. Cancelled gestures restore the original scene.

**Verification:** Cover rotated parents, negative scales, group transforms, prefab overrides, cancel/undo/redo and invalid parent cycles against independent fixtures.

**Security review:** Validate numeric bounds and entity scopes before committing commands; previews cannot bypass protected-object capabilities.

### B03 — Expose material, lighting and environment authoring

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: B02, W16.

**Deliverable:** Add inspectors for supported physically based material properties, texture assignment, lights, shadows, sky, water and weather settings. Reuse selected renderer editors where compatible and store changes as portable component data or declared renderer extensions.

**Acceptance:** Users edit a material instance without unexpectedly changing unrelated shared materials. Light and environment changes preview correctly, undo cleanly and survive serialization. Unsupported shader features remain visible as preserved metadata with explicit limitations rather than silently resetting.

**Verification:** Exercise shared-versus-instance edits, texture replacement, renderer-extension preservation, undo and low-quality preview behavior with reference materials.

**Security review:** Permit only validated asset references and bounded rendering parameters; arbitrary shader or node input follows the trusted-extension policy.

### B04 — Deliver drag-and-drop import, catalog and placement flows

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: B02, A14, W23.

**Deliverable:** Connect files, folders and archives to resumable imports, job progress, diagnostics and the reusable asset catalog/inventory. Support quick runtime-asset placement, delayed conversion placeholders and source retrieval without vendor-specific controls or conference-only workflows.

**Acceptance:** Dropping a supported asset leads to an editable placed object or an actionable conversion result. Retries do not duplicate published assets or placements. Cancelled jobs and missing textures remain understandable, and users can reuse an existing asset without reuploading it.

**Verification:** Exercise ready GLB, archive dependencies, interrupted upload, retry, cancellation, failed conversion and placement after asynchronous completion.

**Security review:** Enforce upload/catalog/placement capabilities and tenant boundaries; display converter diagnostics safely and retain server resource limits.

### B05 — Provide collision, navigation and spawn authoring tools

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: B02, W11.

**Deliverable:** Add overlays and editing controls for collider assignments, simplified shapes, collision groups, navigation tiles, teleport regions, portals and spawn locations. Expose rebuild status and diagnostics while preserving the separation between visual geometry and physical representation.

**Acceptance:** A host can inspect blocked doorways, repair a collider or spawn point, rebuild affected navigation and validate traversal. Pending rebuilds cannot publish a falsely ready walkable area. Edits have clear undo behavior and preserve unchanged regions.

**Verification:** Use venue fixtures with arches, stairs and deliberately broken colliders; verify rebuild cancellation, stale result rejection and safe-spawn validation.

**Security review:** Authorize physics edits separately from ordinary placement; reject malicious shape parameters and dangerous spawn destinations.

### B06 — Implement browser terrain sculpting and tile updates

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: B05, W16.

**Deliverable:** Add bounded terrain sculpt/flatten/smooth and surface-paint tools with brush preview, grouped stroke transactions and tiled dirty-region updates. Coordinate visual, collider and navigation revisions so live editing cannot produce silent disagreement between rendered and physical terrain.

**Acceptance:** A stroke crossing tile borders preserves seams and undoes as one operation. Rebuild progress and temporarily unavailable regions are visible. Removing a supporting surface triggers the established participant recovery policy before publication, and unchanged tiles retain their identities.

**Verification:** Exercise border strokes, large undo operations, interrupted rebuilds, negative elevations, concurrent invalidation and world reload after terrain edits.

**Security review:** Limit brush extent, changed-tile counts and rebuild frequency; enforce terrain-edit capabilities independently of object manipulation.

### B07 — Author media surfaces, sound emitters and acoustic zones

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: B04, M12.

**Deliverable:** Provide reusable inspectors for screen geometry, source bindings, playback policy, emitter attachments, distance curves, directional cones, mixer buses and acoustic zones. Add visual falloff/zone overlays and a listener preview using existing media/audio systems.

**Acceptance:** Users place a wall video with one spatial soundtrack, attach sound to an animal and configure overlapping corner tracks. Moving or duplicating objects preserves intended bindings without accidental duplicate playback. Acoustic changes undo and reload; private-media authorization remains distinct from audible radius.

**Verification:** Verify save/reload of media/audio settings, duplicate-binding prevention, emitter offsets, overlapping ranges and acoustic-zone editing.

**Security review:** Validate source access and playback-control grants; authoring an audible zone cannot grant access to a private conversation.

### B08 — Author behavior graphs, actor settings and attachments

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: B02, W14, W15, W17.

**Deliverable:** Expose declarative trigger/action editing, clip selection, NPC route configuration, attachment sockets and component diagnostics through reusable editor panels. Reuse qualified graph tools; the core editor supports declared behaviors while general creator-code editing follows the isolated-runtime expansion.

**Acceptance:** An author configures a door trigger, animated route and wearable attachment without editing source files. References survive cloning and prefab overrides. Invalid action graphs, missing clips and broken sockets prevent misleading publication and remain repairable after reload.

**Verification:** Exercise behavior graph validation, component-reference remapping, route previews, clip changes, attachment replacement and undo across actor edits.

**Security review:** Editor previews execute only approved actions in a constrained context; privileged runtime effects require normal authority checks.

### B09 — Persist collaborative edits, revision history and undo

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: B02, N14, N05.

**Deliverable:** Connect authoring commands to durable revisions, idempotent commits, edit leases or optimistic version checks and collaborative change notifications. Add revision history, conflict resolution and reversible command groups without using a document CRDT as physics authority.

**Acceptance:** Two editors changing the same entity receive a consistent commit or explicit conflict. Disjoint permitted changes persist, retries create no duplicate revisions and revocation stops further commits. Undo respects intervening edits instead of restoring a stale whole-world snapshot.

**Verification:** Run concurrent browser editors against persistence with dropped acknowledgments, stale revisions, expired leases, retries, reconnect and conflicting undo.

**Security review:** Validate actor, tenant, expected revision and entity scopes server-side; history must not expose inaccessible assets or other tenants' edits.

### B10 — Complete world export, reimport and live-to-template saves

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: B03, B06, B07, B08, B09, A16.

**Deliverable:** Connect browser workflows to complete world-bundle export/reimport, supported GLB export, original retrieval and explicit capture of selected live changes into a new template revision. Reuse asset-lane exporters and surface fidelity/loss reports instead of duplicating conversion code.

**Acceptance:** A world round-trip preserves IDs, prefab overrides, terrain, collisions, behaviors, media and source references. Saving thrown-object placements creates an intentional new revision without recording physics ticks. GLB limitations are explicit, and export never silently removes supported editing capabilities.

**Verification:** Round-trip a composite authored world, compare semantic manifests, restore captured runtime placements and test missing dependencies, migration and interrupted exports.

**Security review:** Check export/read capabilities per dependency and exclude live credentials, participant records, private keys and ephemeral tracking from bundles.


## Operations and release

### R01 — Package the reproducible local and hosted service stack

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: N09, M07, N10.

**Deliverable:** Provide local composition and deployable infrastructure for control API, world fleet, media/TURN, collaboration, queue, database and storage. Separate HTTP/WebSocket routing from UDP-capable media infrastructure and document capacity assumptions.

**Acceptance:** A fresh environment can launch the selected stack and run a two-client room with asset processing and live media. No service silently depends on a developer workstation or hosted editor account.

**Verification:** Run clean provisioning, service discovery, health/readiness, dependency outage and teardown/recreate tests.

**Security review:** Use scoped identities, private service paths, secret references and minimal exposed ports. Keep local convenience settings out of production defaults.

**External evidence:** Selected hosting resources exposing required HTTP/WebSocket and media transports

### R02 — Harden transport secrets keys and service boundaries

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: R01, M17.

**Deliverable:** Complete environment-specific TLS, secure WebSockets, TURN credentials, service authentication, key rotation, secret distribution and browser policy configuration. Document data classes, retention and server-visible processing boundaries.

**Acceptance:** Expired credentials fail closed, rotation works without cross-tenant access, and supported encrypted modes match their stated participants and processors. Browser bundles contain no service secrets. Session revocation follows the measured M06 enforcement path; a JWT expiry timestamp is not treated as active-session termination.

**Verification:** Test token/key expiry, rotation, downgraded transport, origin/cross-site abuse and key-loss recovery according to the documented policy.

**Security review:** Apply the standing end-to-end security standard to each actual data flow; do not claim certification or hide necessary trusted endpoints.

### R03 — Add metrics tracing capacity budgets and cost controls

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: R01, M13.

**Deliverable:** Instrument frame time, asset latency, conversion time, world tick, queue depth, room placement, subscriptions, decoder/audio load and recovery. Add budget alerts and safe diagnostic export using opaque session IDs.

**Acceptance:** Operators can distinguish client rendering, simulation, media and network bottlenecks, and can account for per-event participant minutes, bandwidth and worker consumption.

**Verification:** Inject representative failures/load and verify correlation, alert delivery, metric bounds and log redaction.

**Security review:** Exclude private document/media content and raw tracking streams; restrict diagnostics and prevent user-controlled labels from exhausting monitoring resources.

### R04 — Qualify persistence migration backups and restoration

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: R01, B10.

**Deliverable:** Implement backup/restore procedures for metadata, world revisions, collaboration documents and asset manifests, with explicit retention and recovery targets. Use compatible migrations and rehearsed restore or forward-repair plans.

**Acceptance:** A clean environment can restore an internally consistent world and its assets at a documented recovery point. Retried restores do not duplicate jobs or revive revoked grants unintentionally.

**Verification:** Run real database/object-storage restore, missing-asset detection, schema upgrade/downgrade compatibility and interrupted migration drills.

**Security review:** Encrypt protected backups, restrict restore access, verify deletion/retention behavior and document key recovery separately from data recovery.

### R05 — Qualify restricted networks and service failure recovery

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: R01, M12.

**Deliverable:** Exercise TURN fallback, bandwidth/latency/loss changes, WebSocket reconnect, worker drain/crash, media-node loss, converter restart and staged release rollback. Publish expected user-visible recovery and limitations.

**Acceptance:** Authorized clients recover predictably without duplicate room authorities, presenters or audio paths. Unsupported seamless migration is not advertised as achieved.

**Verification:** Run controlled fault scenarios through actual ingress and media paths; verify queue replay, lease epochs and checkpoint restoration. Repeat recovery with removed members holding original and refreshed media tokens, including unavailable control-plane services.

**Security review:** Ensure recovery never drops authorization checks, restores stale media access or exposes abandoned temporary processing files.

### R06 — Qualify rendering audio and conference capacity profiles

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: R03, W22, M26.

**Deliverable:** Run reproducible desktop and real-headset workloads with architectural assets, animated wildlife, physics, four music sources, avatar voice and video screens. Test 20/50/100 interactive participants and concurrent interactive-room growth separately; R13 qualifies the expanded stage/broadcast topology.

**Acceptance:** Publish passing hardware/browser/workload profiles with p95/p99 frame timing, selected headset refresh, join latency, media quality, memory and service headroom. Failing configurations remain unsupported rather than receiving an invented capacity claim.

**Verification:** Use real media publishers/decoders plus load clients, repeat steady-state and burst joins, and retain raw measurements and configuration hashes.

**Security review:** Verify load controls resist resource exhaustion and test with privacy modes enabled rather than disabling safeguards for better numbers.

**External evidence:** Representative ordinary laptop, premium desktop and actual target headsets

### R07 — Complete integrated security and abuse verification

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: R02, W18.

**Deliverable:** Execute the engine threat-model scenarios across tenant isolation, grants, uploads, converters, behaviors, media subscriptions, exports and administration. Add regression coverage for findings and record a separate self security review.

**Acceptance:** Blocking findings are fixed and verified on the candidate commit. A self-review is identified honestly; actual repository-required independent reviews remain enforced if configured.

**Verification:** Run cross-tenant and stale-token attacks, parser/sandbox escape fixtures, quotas, SSRF/path traversal, permission races and secret scans in deployed configurations.

**Security review:** Do not weaken required checks or encryption to close the milestone. Record residual limitations with bounded impact and a concrete disposition.

### R08 — Qualify browser headset and accessible engine behavior

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: M26, W22.

**Deliverable:** Define the supported browser/headset matrix and run input, locomotion, media, listener pose, readable surfaces, focus, permission-denial, sleep/resume and context-loss scenarios. Qualify optional hands/layers/trackers separately.

**Acceptance:** Each advertised combination has actual evidence and useful fallback behavior. The local accessibility example works without requiring immersive 3D navigation.

**Verification:** Run browser automation plus hands-on headset, keyboard/screen-reader and output-device scripts; preserve device/browser versions with results.

**Security review:** Verify capture consent, safe focus transitions and privacy-consistent alternate views; do not use an emulator as sole hardware evidence.

**External evidence:** Actual devices for every advertised immersive support profile

### R09 — Publish the engine beta with verified core contracts

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: R02, R04, R05, R06, R08, M15.

**Deliverable:** Produce versioned SDK packages and service images with migration notes, immutable provenance and a compatibility matrix. Publish only the core functionality already exercised through the release checks, keeping expanded capabilities visibly pending.

**Acceptance:** A clean independent consumer can install the beta and run local and multiplayer examples. Released artifacts correspond to the tested commit and exclude unverified adapter claims.

**Verification:** Run package-consumer, API/schema compatibility, artifact integrity and upgrade/rollback smoke checks against released builds.

**Security review:** Complete the core subset of R07 threat-model checks and a separate beta security review; no unresolved blocking finding may enter the beta.

### R10 — Complete SDK documentation integration examples and handoff

Repository: neophilism/Browser-VR-Engine. Stage: core.

Depends on: R09.

**Deliverable:** Publish getting-started guides, SDK/API references, plugin/converter authoring, world schemas, media/audio examples, deployment/runbooks and upgrade guidance. Maintain exact progress, dependency and evidence records for future agents and project dashboards.

**Acceptance:** A fresh developer can build a non-conference application, import/export a world and deploy a test room using repository instructions alone. Handoff includes unresolved external dependencies and the next runnable cards.

**Verification:** Execute documented commands and example projects in clean environments; validate links, schema examples and status/evidence references.

**Security review:** Keep credentials out of documentation and examples, state privacy boundaries accurately and verify deployment examples use secure defaults.

### R11 — Qualify expanded formats and the requested reference assets

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: A24, W22, B10.

**Deliverable:** Run real native-tool connectors and the agreed architecture/animal corpus through conversion, editing, rendering tiers, collision/navigation and export. Record exact file/tool versions, approximation reports and supported feature subsets.

**Acceptance:** Every advertised native or specialist adapter has a real passing fixture; the Acropolis/eagle/futuristic-building scenarios have visual and functional evidence using actual supplied files. Exchange substitutes do not mark native loaders complete.

**Verification:** Compare reference renders/animations, traverse openings, place and throw props, inspect acoustic attachments and round-trip the complete edited world.

**Security review:** Exercise malformed files and embedded code through isolated workers; preserve source access controls and immutable conversion provenance.

**External evidence:** Actual reference models and provisioned native SDK/application/plugin environments

### R12 — Accept and release the complete general engine

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: R07, R10, R11, R13.

**Deliverable:** Reconcile all core and expanded engine cards, publish supported capability/format/device profiles and produce the final versioned SDK and service release. Keep every reusable mechanism free of conference-specific runtime dependencies.

**Acceptance:** Every core and expanded engine card is implemented and verified against its required evidence. Any incomplete mandatory capability, unresolved blocking finding or missing required hardware, provider, asset or native-tool evidence blocks the complete release. A fresh host runs the general examples and deployment successfully.

**Verification:** Run the final package, migration, world-round-trip, security, real-device and operational smoke suite on released artifacts; link immutable evidence and rollback instructions.

**Security review:** Close all blocking security findings, retain required notices, verify artifact provenance and perform the final separately recorded security review.

### R13 — Qualify expanded stage broadcast and processing at event scale

Repository: neophilism/Browser-VR-Engine. Stage: expanded.

Depends on: R05, R06, M23.

**Deliverable:** Exercise the complete multi-instance stage, produced broadcast, audience promotion, encrypted content, recording and captions under sustained and burst workloads. Measure separate interactive, relay, processing and CDN latency/capacity profiles.

**Acceptance:** Independent audience instances receive the correct program and current presentation state. Promotion, processor failure and reconnect preserve permissions and avoid duplicate sound. Published event capacity follows actual results for the stated topology.

**Verification:** Run load and outage rehearsals with real media sources/decoders, authorized processors and broadcast distribution; correlate viewer delay, question/poll timing and recovery evidence.

**Security review:** Keep private backstage/conversation content out of the public program and verify key/endpoint admission boundaries under scaling and failover.

**External evidence:** Provisioned load, relay, recording/transcription and CDN test infrastructure


## Conference application

### C01 — Bootstrap the conference application repository

Repository: neophilism/XLR8. Stage: core.

Depends on: F03, R12.

**Deliverable:** Create the separate application workspace, branded shell, route structure, API boundary, test harness and app-owned plan/handoff ledger. Consume versioned engine interface packages through a dependency lock; keep generic world functionality in the engine.

**Acceptance:** A fresh checkout builds the application against a pinned engine contract and displays an explicit service-unavailable state when backends are absent. No copied engine implementation appears in app source.

**Verification:** Run clean-install, package-boundary, routing and error-state tests. Validate cross-repository dependency/version records.

**Security review:** Separate browser configuration from server secrets and apply baseline session, content-security and dependency policies.

### C02 — Connect identities organizations and guest access

Repository: neophilism/XLR8. Stage: core.

Depends on: C01, F08.

**Deliverable:** Implement organizer accounts, organization membership, participant profiles, guest invite identity and an identity-provider adapter. Exchange application identity for scoped engine grants; define session expiry, logout and account recovery boundaries.

**Acceptance:** Registered and authorized guest users can establish the intended identity and request scoped grants. Session expiry and logout invalidate the application session and further grant issuance. C05 and C19 verify revocation of existing connections across engine services.

**Verification:** Exercise a real test identity provider, session renewal, guest reuse/expiry, cross-organization access and logout across tabs.

**Security review:** Verify token audience, issuer, nonce and role mapping. Store minimum profile data and prevent a client-supplied organization or role from becoming authoritative.

**External evidence:** Configured test and production identity-provider credentials where a hosted provider is selected

### C03 — Implement events sessions and schedule persistence

Repository: neophilism/XLR8. Stage: core.

Depends on: C02.

**Deliverable:** Add event/session records, draft and published states, time zones, organizer ownership, session types and links to engine world templates/instances. Implement edits, cancellation and optimistic conflict detection.

**Acceptance:** Organizers can create and publish an event with multiple sessions; participants see only published sessions they may access. Schedule changes preserve stable links and explicit cancellation status.

**Verification:** Test daylight-saving boundaries, timezone rendering, overlapping sessions, concurrent edits and database migrations.

**Security review:** Authorize every mutation by organization and event; prevent public discovery of private event details.

### C04 — Implement registration invitations and admission records

Repository: neophilism/XLR8. Stage: core.

Depends on: C03.

**Deliverable:** Add registration, capacity/waitlist records, revocable invitation links and attendee check-in. Support organizer-managed invitations and direct link sharing before optional notification delivery is connected.

**Acceptance:** A valid invitation admits its intended user according to capacity and event policy; duplicate registration is idempotent and revocation takes effect. Waitlist promotion does not overbook under concurrent requests.

**Verification:** Test duplicate submissions, invitation expiry/replay, capacity races and cancellation/re-registration.

**Security review:** Bind grants to event and intended identity, throttle abuse and avoid exposing the attendee directory through invitation lookup.

### C05 — Map conference roles to engine capabilities

Repository: neophilism/XLR8. Stage: core.

Depends on: C04, N13.

**Deliverable:** Implement attendee, host, speaker and exhibitor role policies as application-owned mappings to engine join, speak, present, edit and moderation capabilities. Add live promotion, demotion and scoped delegation.

**Acceptance:** Changing a role updates world, media and editing access consistently; a speaker does not automatically gain venue administration or access to other events.

**Verification:** Run table-driven policy tests and multi-service revocation/race cases, including stale tokens and concurrent promotions.

**Security review:** Enforce roles on server endpoints and grants. Verify least privilege and prevent role escalation through UI state or modified requests.

### C06 — Build the event lobby agenda and participant directory

Repository: neophilism/XLR8. Stage: core.

Depends on: C04.

**Deliverable:** Provide event landing pages, agenda filters, session details, search, attendee-visible directory settings and clear paths to join available rooms. Display local time and session state without requiring a 3D client.

**Acceptance:** A participant can find the next session and locate authorized people or rooms using keyboard or touch. Private attendee/profile fields remain hidden according to policy.

**Verification:** Test search/filter combinations, timezone changes, accessibility navigation and private/public directory boundaries.

**Security review:** Sanitize event/profile content and enforce visibility rules on the API, including search result counts.

### C07 — Connect the venue and shared asset library

Repository: neophilism/XLR8. Stage: core.

Depends on: C03, B04.

**Deliverable:** Expose engine venue templates and organization asset collections in event setup. Support import progress, preview, clone, version selection and quotas using the engine APIs and editor rather than duplicating converters.

**Acceptance:** An organizer can import a venue, track processing and select a published revision for an event. Failed conversion preserves the source and provides actionable diagnostics.

**Verification:** Exercise successful, interrupted and failed imports plus cross-organization asset references and template cloning.

**Security review:** Check upload/export grants, storage ownership and private source retrieval; vendor policies do not remove engine capabilities.

### C08 — Build the host venue setup and rehearsal workflow

Repository: neophilism/XLR8. Stage: core.

Depends on: C07, C05, B07, B05, B09.

**Deliverable:** Compose engine editing tools into event preparation: spawn locations, screen placement, stage access, seats, music, environmental audio and prop layout. Add rehearsal sessions and save/publish a venue revision.

**Acceptance:** A host can prepare a complete room, preview four overlapping tracks and wall-video sound, rehearse presentations and publish the tested layout without changing an active session accidentally.

**Verification:** Run setup-to-rehearsal-to-publish tests with saved-world reload and concurrent organizer edits.

**Security review:** Keep rehearsal membership separate from published session access; enforce entity-level editing and presenter rights.

### C09 — Build device preflight and join onboarding

Repository: neophilism/XLR8. Stage: core.

Depends on: C05, M26, M07.

**Deliverable:** Provide microphone/speaker/camera selection, audio unlock, network/media checks, quality selection, accessibility choices and desktop/VR entry. Explain actual unavailable capabilities and preserve user choices between reconnects.

**Acceptance:** A user can join with voice only, camera, VR or the accessible view; permission denial and unavailable hardware lead to usable alternatives. Audio starts from a deliberate join interaction.

**Verification:** Test denied permissions, missing devices, output changes, restrictive networks, headset sleep and keyboard-only operation on real browser/device profiles.

**Security review:** Do not activate capture before user intent; redact device identifiers and avoid leaking room access tokens in diagnostics.

### C10 — Implement lobby admission room entry and recovery

Repository: neophilism/XLR8. Stage: core.

Depends on: C09.

**Deliverable:** Connect session admission to engine room placement, waiting areas and media join. Implement leave, reconnect, full-room alternatives and clear recovery when a worker is replaced.

**Acceptance:** An admitted user reaches the correct session with matching world/media authorization. Expired or revoked users are rejected, and reconnect cannot accidentally join a different event.

**Verification:** Run multi-client admission races, worker loss, token expiry, full room and network reconnection scenarios.

**Security review:** Coordinate grants across services, revoke on removal and prevent open-redirect or arbitrary room-ID entry.

### C11 — Build participant avatar presence and personal controls

Repository: neophilism/XLR8. Stage: core.

Depends on: C10.

**Deliverable:** Expose avatar selection, profile labels, seating, locomotion preferences, push-to-talk/mute and per-source listening controls through engine APIs. Support equivalent essential controls in desktop and immersive UI.

**Acceptance:** Participants see correct identity/presence and hear voices follow avatars. Personal mute, volume and comfort settings persist without changing other participants settings.

**Verification:** Test two-user avatar changes, seat transitions, personal audio controls and XR/desktop switching without duplicate listeners or streams.

**Security review:** Prevent identity impersonation and unauthorized avatar asset access; distinguish local mute from host moderation.

### C12 — Build the presentation and shared file workflow

Repository: neophilism/XLR8. Stage: core.

Depends on: C10, M14.

**Deliverable:** Add upload/share controls, screen targeting, slide navigation, looping video, live desktop sharing, presenter handoff and paired-desktop presentation for headset users. Preserve engine spatial sound defaults.

**Acceptance:** An authorized presenter can place content on a wall, loop a video with localized sound, hand off control and support late joiners at the current slide/time. Unsupported files remain accessible attachments.

**Verification:** Exercise slide and video handoffs, capture cancellation, browser audio capture limits, reconnect and simultaneous presenter requests.

**Security review:** Validate presenter leases and content access; screen capture uses explicit browser source selection and displays capture state.

### C13 — Build spatial networking and private conversation flows

Repository: neophilism/XLR8. Stage: core.

Depends on: C11, C06.

**Deliverable:** Provide nearby-person discovery, walk-up conversation, personal blocking and explicit private conversation membership using engine spatial media and capability interfaces.

**Acceptance:** Walking between groups changes the audible public mix smoothly. Joining a private conversation requires authorization; leaving or removal revokes media access rather than merely lowering volume.

**Verification:** Test two overlapping public conversations and a private group, with late joins, blocked users and boundary movement.

**Security review:** Verify membership and subscriptions server-side, including revoked users reconnecting with stale grants.

### C14 — Implement workshop and breakout orchestration

Repository: neophilism/XLR8. Stage: core.

Depends on: C10, W11.

**Deliverable:** Add creation, assignment, voluntary selection, timed return and host movement between breakout instances. Preserve shared session resources through explicit access links and rejoin state.

**Acceptance:** Hosts can move an authorized group into independent rooms and return them predictably. World state, conversation membership and encryption state correspond to the destination.

**Verification:** Test concurrent assignments, full/failed destinations, interrupted transfers, host reconnect and return timers.

**Security review:** Revoke source-room grants according to policy and never transfer private breakout media to other groups accidentally.

### C15 — Build exhibition booths and interactive venue experiences

Repository: neophilism/XLR8. Stage: core.

Depends on: C08, C10, W17.

**Deliverable:** Add exhibitor-scoped booth configuration, shared exhibits, reusable prop placement and guided venue experiences. Hosts can configure animated animals, media walls and sound features using engine components.

**Acceptance:** An exhibitor can prepare their assigned area and interact with visitors without editing neighboring booths. Shared objects and presentations preserve their configured physics and audio behavior.

**Verification:** Run two exhibitor/visitor sessions with scoped edits, saved layouts, walking routes and interactive props.

**Security review:** Enforce booth/entity boundaries, object quotas and safe behavior capabilities; do not accept arbitrary uploaded scripts as trusted application code.

### C16 — Build keynote backstage and audience orchestration

Repository: neophilism/XLR8. Stage: expanded.

Depends on: C12, M22.

**Deliverable:** Implement backstage preparation, stage program selection, bounded audience instances, speaker queue and authorized audience-to-stage promotion. Align slides and interaction timing with live or broadcast delivery delay.

**Acceptance:** Multiple audience instances receive the same program through actual distribution, and promotion creates a working interactive connection without feedback or duplicate audio.

**Verification:** Rehearse program switching, relay failure, delayed viewers, stage promotion/demotion and multiple audience instances.

**Security review:** Keep backstage tracks private; grant stage publication deliberately and include relays/recorders in the stated encryption trust boundary.

### C17 — Implement moderated questions polls and audience interaction

Repository: neophilism/XLR8. Stage: expanded.

Depends on: C16.

**Deliverable:** Add moderated questions, polling, hand raising and response summaries. Associate interactions with event/session IDs and the viewers program timeline where broadcast delay matters.

**Acceptance:** Hosts can queue questions and open/close polls; eligible participants submit according to policy and see accurate results without duplicate counting after reconnect.

**Verification:** Test concurrent answers, duplicate retries, delayed viewers, poll closure races and moderator handoff.

**Security review:** Enforce eligibility, rate limits and moderation scopes; sanitize participant content and prevent unauthorized result access.

### C18 — Build shared notes whiteboards and annotation workflows

Repository: neophilism/XLR8. Stage: core.

Depends on: C12, M15.

**Deliverable:** Expose engine collaborative documents as session notes, whiteboards and presentation annotations. Add ownership, save/export, reconnect and accessible editing views tied to the same shared state.

**Acceptance:** Concurrent participants can edit permitted content, reconnect and retrieve the intended final document. Annotations stay attached to the right asset revision and page.

**Verification:** Test concurrent edits, reconnect replay, page changes, export and permission revocation without document divergence.

**Security review:** Protect document membership and stored content; reject unauthorized operations even when the client caches a prior document.

### C19 — Build host moderation and participant protection

Repository: neophilism/XLR8. Stage: expanded.

Depends on: C13, C14, C16.

**Deliverable:** Provide host mute, removal, ban, restricted editing, incident context and participant blocking controls. Apply actions consistently across world, text, media and presentation services with appropriate expiry.

**Acceptance:** A removed user loses relevant access promptly and cannot retain an active microphone or edit lease. Local blocking and event-level moderation have distinct understandable effects.

**Verification:** Exercise simultaneous moderation/reconnect, expired bans, host handoff and attempts to retain stale connections or leases.

**Security review:** Audit administrative actions without recording private conversation content by default; prevent cross-event moderation and privilege escalation.

### C20 — Build privacy recording captions and retention controls

Repository: neophilism/XLR8. Stage: expanded.

Depends on: C12, M19.

**Deliverable:** Expose session privacy modes, admitted recording/caption endpoints, recording status, participant notices and retention/access controls. Support captions in 3D and 2D and manage permitted recordings/transcripts after sessions.

**Acceptance:** A private session has no undisclosed processing endpoint; enabling recording/captions shows the actual trust change. Authorized users can retrieve retained material and deletion follows the configured policy.

**Verification:** Test key rotation, recorder entry/removal, late joins, caption failure, playback authorization and retention expiry.

**Security review:** Keep keys and processing visibility accurate; no blanket E2EE claim for material intentionally decrypted by converters, relays or recording endpoints.

### C21 — Complete accessible participation and localization foundations

Repository: neophilism/XLR8. Stage: expanded.

Depends on: C06, C18, C20, C17.

**Deliverable:** Complete a 2D meeting path with readable presentations, captions, keyboard controls, semantic labels, focus recovery and reduced motion. Externalize interface strings, locale/time formatting and text direction for future language packs.

**Acceptance:** A participant can register, join, listen, present where permitted, use notes/questions and leave without relying on 3D navigation or a pointer. The selected listening policy is explicit.

**Verification:** Run keyboard and screen-reader task scripts, zoom/contrast/reduced-motion checks, long translations and right-to-left layout fixtures.

**Security review:** Keep accessible routes subject to the same access and recording rules; do not expose additional private content through alternate views.

### C22 — Connect notifications and calendar delivery

Repository: neophilism/XLR8. Stage: core.

Depends on: C06.

**Deliverable:** Implement an outbound notification adapter, event invitations, schedule-change reminders and calendar-file generation. Connect one selected production delivery provider, with retries, bounce handling, preference controls and idempotent sends.

**Acceptance:** A real test recipient receives the correct invitation/update and calendar times; retries do not send duplicates and disabled delivery is shown honestly. Link sharing remains available independently.

**Verification:** Use a sandbox provider and one authorized real delivery test; test failures, retries, timezone updates and preference enforcement.

**Security review:** Protect provider credentials, validate recipients and avoid leaking attendee lists or private session details. Delivery occurs only under configured organizer/user actions.

**External evidence:** Authorized email delivery account and verified sending domain for live delivery qualification

### C23 — Build organizer administration and operational reporting

Repository: neophilism/XLR8. Stage: expanded.

Depends on: C19, C20, R03.

**Deliverable:** Add organizer dashboards for session readiness, attendance, room health, storage, conversion failures, usage budgets and exportable event reports. Provide administrative controls through scoped engine/application APIs.

**Acceptance:** An organizer can diagnose a failed join or import and see accurate service health without accessing private media. Reports distinguish attendance, concurrent users and subscribed/publishing media counts.

**Verification:** Test report reconciliation against known scenarios, privacy filtering, stale data labels and threshold alerts.

**Security review:** Restrict operational data by organization and role; log safe identifiers and audit sensitive administrative changes.

### C24 — Run the complete conference rehearsal suite

Repository: neophilism/XLR8. Stage: expanded.

Depends on: C15, C21, C22, C23, R09.

**Deliverable:** Create an automated event rehearsal plus a real participant/headset script covering preparation, registration, keynote, breakouts, exhibits, shared files, spatial audio, moderation and post-event access. Record actual environment and service versions.

**Acceptance:** The complete event succeeds across the declared device/network profiles. Failures become tracked fixes; a passing unit suite cannot substitute for the user journey or actual provider/hardware evidence.

**Verification:** Run multi-client browser tests and real-device/real-service rehearsal with network interruption, media handoff and recovery.

**Security review:** Repeat cross-tenant, revoked-role, private-room and recording-boundary cases during the integrated journey.

**External evidence:** Representative human/device rehearsal participants and provisioned external services

### C25 — Deploy and verify the conference application release candidate

Repository: neophilism/XLR8. Stage: expanded.

Depends on: C24.

**Deliverable:** Add deployable frontend/API configuration, migrations, secret references, health checks, canary promotion and rollback. Publish operator/admin documentation, self-contained handoff and truthful status integration for the project tracker.

**Acceptance:** A production-like environment serves the application over the intended domain and passes public-path join/presentation checks. Deployment, rollback and restore evidence is attached to the actual commit/version.

**Verification:** Run deployment smoke, migration compatibility, expired-secret, restore and rollback drills through the real ingress path.

**Security review:** Review TLS, CSP, cookies, CORS, secrets, administrative access and environment isolation before promotion.

**External evidence:** Hosting account, domain/DNS access and production service credentials

### C26 — Accept the complete conference release

Repository: neophilism/XLR8. Stage: expanded.

Depends on: C25, R12.

**Deliverable:** Reconcile every application card, required engine capability, external dependency and release scenario. Publish supported device/capacity/format profiles, known limits, versioned runbooks, acceptance evidence and final progress records.

**Acceptance:** All planned conference capabilities and required expanded engine lanes are verified; no mock provider, unavailable native connector or failed gate is labeled complete. The deployed release passes the final event rehearsal.

**Verification:** Repeat critical production smoke and reference-event tests on the release build; verify links to immutable CI, security, deployment and recovery evidence.

**Security review:** Perform a separately recorded final security review and close unresolved blocking findings without weakening required repository checks.
