# Approved technical architecture

Design baseline dated 2026-10-17. Repository naming and engine-first execution are resolved by [ADR 0001](../decisions/0001-engine-first-workspace.md). Described capabilities are design requirements, not claims of implemented functionality.

## Browser Game and VR Engine Technical Architecture

Research findings and recommended architecture

Technical design proposal17 October 2026

Recommendation. Build a reusable browser engine around Babylon.js, with Rapier physics, Colyseus world networking, LiveKit media, and a modular asset conversion service. Publish that engine from one repository and build the conference application in a separate repository. Qualify existing Hubs and VRSpace subsystems before implementing equivalent functionality, so reuse decisions are based on working behavior and total adaptation effort.

The product goal is a shared, editable virtual environment that works on ordinary computers and in VR. A conference can use a classical venue, a futuristic building, animated wildlife, presentation walls and shared files. The same engine must also support games and simulations without requiring conference accounts, agendas or presenter roles.

Capability policy. Preserve the full planned ability to import, convert, edit, reuse and export worlds and objects. Select artists, suppliers and services that support those capabilities, including direct purchases and commissioned exports. Vendor-specific asset policies are not engine feature requirements.

This document specifies proposed architecture and acceptance criteria. The research establishes available components and documented limitations; capacity and model fidelity must be established by the implementation tests described here. Repository names below are descriptive placeholders.

## 1 Recommended decision

Babylon.js supplies a substantial rendering and XR foundation under Apache 2.0. Its scene, material, animation, inspection and optimization tools remove the need to construct those systems from first principles. Its runtime remains a library within our engine, which owns the application-facing contracts, editable world format and deployment services. [S01, S02]

Hubs Community Edition is the strongest complete-platform alternative for obtaining an existing browser and VR meeting experience. VRSpace is a particularly relevant reuse candidate because its client already uses Babylon and is distributed independently of its Java server. A fresh modular stack does require more initial assembly than adopting an entire functioning meeting platform. [S03, S04, S05]

The recommended default is the modular Babylon architecture because the engine must serve games and other applications as well as conferences. However, the first implementation qualification should allow a Hubs fork to replace multiple planned subsystems if it meets the same engine separation, graphics, authoring and operational requirements with materially less total work. The project should select one runtime foundation after that test, rather than maintain two complete implementations.

| Decision | Proposed default | Reason |
| --- | --- | --- |
| Runtime | Babylon.js full engine packages | Integrated graphics and XR primitives; modular imports keep optional features out of initial loads. |
| World simulation | Rapier plus Colyseus | Renderer-independent physics and authoritative room infrastructure; integration remains ours. |
| Live media | LiveKit | Media transport, SDKs and subscription controls are reusable without adopting a complete meeting UI. |
| Spatial audio | Babylon AudioEngine v2 and Web Audio | One positional sound system for microphones, video, music and object-attached effects. |
| Asset interchange | glTF 2.0 and GLB | A common runtime asset target, supplemented by our complete editable world manifest. |
| Browser authoring | Engine editor packages with selective reuse | Placement, inspection, material and scene tools remain usable in every application. |
| Application | Separate conference repository | Event workflows compose engine capabilities without becoming dependencies of the engine. |

## 2 Open source options

The licenses below describe the named upstream projects, not every dependency or bundled sample. Release builds must retain the required notices and use an inventory of the actual pinned source and binaries. Commercial use is compatible with these open-source approaches, with differing obligations. Hubs is a viable commercial option: MPL permits commercial distribution while imposing source availability obligations for covered distributed files. [S06]

| Candidate and license | Reusable functionality | Assessment |
| --- | --- | --- |
| Babylon.js; Apache 2.0 [S01] | Rendering, PBR, animation, XR, inspection, scene tools and performance primitives. | Preferred general runtime. Multiplayer services and collaborative product workflows are additional work. |
| Hubs Foundation and Spoke; Hubs MPL 2.0 [S03, S04] | Room-based social VR, avatars, media sharing and a browser scene editor. | Best whole-platform fork candidate. Qualify engine extraction, graphics, current dependencies and event topology. |
| VRSpace; Apache 2.0 [S05] | Babylon client, world and avatar functions, sharing and editing; separate server artifact. | Inspect whole reusable client subsystems. Its server architecture differs from the recommended room/media services. |
| PlayCanvas engine and editor; MIT [S07, S08] | WebGL and WebGPU engine, WebXR, animation, audio and open editor frontend. | Strong alternative. The documented editor frontend still connects to hosted PlayCanvas services. |
| Three.js and A-Frame; MIT [S09, S10] | Flexible rendering and component-based XR development. | Natural choice with Hubs; more assembly when starting directly from renderer/framework primitives. |
| iR Engine; CPAL 1.0 [S11] | World editor, avatars, networked physics and social/media services. | Broad integrated candidate. CPAL attribution/network terms and the full deployment stack need explicit adoption review. |
| Godot; MIT [S12] | Mature game tooling, scene system, physics and native/web exports. | Less direct fit for browser meeting integration; current stable web export uses WebGL2 Compatibility, not WebGPU. |
| Third Room and Croquet; Apache 2.0 [S13, S14] | Alternative shared-world and distributed application designs. | Useful references. Third Room does not claim a ready standalone engine; Croquet uses replicated client simulation and now provides a reflector server. |

Babylon Editor is a desktop application. Its availability does not finish the requested in-browser world builder. Babylon gizmos and inspection APIs are useful primitives, while Hubs/Spoke and VRSpace deserve evaluation for whole authoring and interaction subsystems. [S15]

### Qualification before committing the stack

Run the same small acceptance scene through Hubs Community Edition and a Babylon sample with relevant VRSpace modules: an imported architectural venue, a rigged animated animal, a presentation screen, movable objects, a desktop attendee and an actual headset. Test in-browser placement, saved-world export and reload, access rules, shared media, reconnects and frame timing. Inspect dependencies and the amount of code that must be replaced.

Adopt the solution that preserves the required capabilities with the least sustainable work. If Hubs wins, reuse its working room, avatar, editor and media stack rather than forcing every default dependency onto it. If Babylon wins, retain useful VRSpace modules behind our APIs and avoid taking its entire server solely to obtain a few client features. A fork should exist when a real source change is necessary; ordinary dependencies can stay as pinned upstream packages.

## 3 Repository and deployment boundaries

| Repository | Contents | Boundary |
| --- | --- | --- |
| Spatial World Engine | Runtime SDK, scene schema, physics and networking adapters, generic editor, asset compiler, media surfaces, avatars, world services, tests and examples. | Has no conference registration, agenda, ticket, sponsor or speaker-role dependency. |
| Virtual Conference App | Branded web UI, event API, registration, schedules, presenter workflows, breakout assignment, accessibility layout, event moderation and reports. | Consumes released engine packages and service APIs. Adds event policy rather than duplicating world systems. |

The engine repository can be a monorepo containing several packages and service images. Two repositories do not imply two processes. Begin with a small number of deployables: conference API, world service, collaboration service, media infrastructure and isolated asset workers. Separate these because their workloads, transports and trust boundaries differ, not to maximize service count.

Figure 1  Proposed runtime and service relationships. The diagram shows service responsibilities; deployment may combine compatible HTTP services initially.

### Engine packages

Use engine packages for schemas, runtime/input, rendering, physics/navigation, networking, spatial audio, media, assets, editor components, avatars and persistence. The engine control API owns uploads/import status, catalogs, world revisions, export, inventory and generic access grants. A host application supplies an authorization adapter without creating a conference dependency. Expose documented advanced Babylon extensions for shaders and renderer-specific work.

The conference UI can use React and TypeScript, with the engine owning its canvas lifecycle and XR interaction surfaces. React handles ordinary panels and event workflows. In immersive mode, essential controls use engine-rendered or otherwise qualified XR interfaces; the app must not assume ordinary HTML panels appear in the headset.

### Proving that the engine is general

Ship an offline physics playground and a small multiplayer game example in the engine repository. The local example loads a scene, accepts input, uses collision and object behavior, and saves or resets without calling the conference API. Local storage and simulation implement the same contracts used by hosted worlds. Cloud conversion can remain a hosted feature; the generality test does not require every proprietary source format to convert offline.

Use semantic package releases and a documented compatibility range for world schemas, messages and service APIs. The application pins an engine version and runs integration tests against it. Breaking changes need migrations and an explicit app upgrade, so a conference release is not implicitly changed by an upstream package update.

## 4 World data and ownership of state

Use glTF/GLB for rendered assets, and a versioned engine-owned manifest for complete worlds. glTF is designed for runtime asset transmission; our world model also needs persistence, permissions, behaviors and interaction semantics. Keep original source files so future conversions can improve without degrading the source. [S16]

| Record | Essential fields and responsibilities |
| --- | --- |
| World revision | Schema version; stable entities and hierarchy; spawn points; terrain and spatial cells; lights; asset versions; behavior references; scene settings. |
| Entity or prefab | Stable ID; transform; render asset; collider; interaction components; animation state; media binding; attachments and application-neutral tags. |
| Asset revision | Source hash and format; coordinate convention; dependency list; conversion recipe; derived meshes/textures/LODs; animation clips; diagnostics. |
| World instance | World revision; region; authoritative worker; lifecycle; room capacity profile; participants; current transient state and snapshot checkpoint. |
| Capability grant | Principal; scope; world or entity; allowed operations; expiration; server-verifiable signature or session binding. |
| Media surface | Source type and ID; presentation control lease; play/pause/time state; aspect ratio; audio policy; associated annotations. |
| Audio emitter and zone | Entity attachment; file, stream or video binding; gain and falloff; audible radius; directionality; mixer bus; acoustic zone and playback clock. |
| Conference records | Event, session, speaker, attendee, registration and breakout assignment. These live in the application, linked to engine instance IDs. |

Choose one canonical coordinate convention: meters, right-handed axes and Y up. Configure Babylon consistently, convert source coordinates once, and store the original convention. Preserve pivots, negative-scale handling and stable sub-object identifiers so editing does not break collision, animation or future asset replacement.

### Authoring and live simulation

Persistent authoring commands create or delete objects, change materials, set initial transforms, edit terrain and attach behaviors. They carry an expected revision, idempotency key and server-checked capability. They enter a durable history with conflict handling and undo/redo.

Runtime commands move, grab, release, throw or interact. The room simulation validates them and owns current velocities, collisions and control leases. Do not write every physics tick into the authoring history. An explicit save operation may commit selected runtime changes into a new world revision; the reusable venue template remains predictable.

Use optimistic version checks or edit leases for conflicting scene changes. Use Yjs for concurrently edited notes, whiteboard data and annotations. A CRDT must not be a second authority over physical transforms or presenter control. [S17]

## 5 Import conversion and export

The user-facing workflow is one drop target for files, folders and archives. A ready GLB can appear quickly; a large authoring scene creates a conversion job with an immediate placeholder, progress and a useful result. The system retains the original and explains missing dependencies or unsupported features. It never labels an import successful while silently discarding the animation or essential materials.

| Input family | Supported path to implement | Feature boundary |
| --- | --- | --- |
| glTF and GLB | Direct loading plus validation and optional optimization. | Advertise tested extensions and exact fidelity; retain a broadly compatible fallback. |
| OBJ and MTL | Automated geometry/material conversion with accompanying textures. | OBJ has no skeletal animation. Resolve companion files and relative paths. |
| FBX | Dedicated ufbx and/or Blender conversion path. | Qualify skinning, clips, morphs and materials; bake source constraints and expressions. |
| DAE and 3DS | Tested Assimp/exchange-format workers. | Format variants differ; legacy .3ds is distinct from a .max scene. |
| BLEND | Pinned native Blender worker. | Disable embedded autoexecution; evaluate supported nodes and bake where required. |
| USD family | Blender/OpenUSD-based conversion of documented scene features. | Resolve references and variants; report materials, curves, volumes or composition that cannot translate. |
| STL PLY and 3MF | Qualified geometry/point/color import adapters. | Inspect PLY content; a mesh, point cloud and Gaussian-splat file need different handling. |
| SKP | Native connector or author/export route, then DAE or another supported format. | A native SDK is an additional integration, not a capability supplied by a generic mesh loader. |
| MAX MA MB and C4D | Native application export workers or artist-prepared exchange exports. | Application version and plugins determine what can be evaluated and baked. |
| STEP IGES and IFC | Specialist CAD/BIM adapters for tessellation and metadata. | Runtime meshes do not preserve every CAD construction operation or BIM semantic. |
| Alembic and simulation caches | Specialist cache/sequence adapters and bounded derived outputs. | Changing topology is not automatically a glTF skeletal animation. |
| Splats and large point clouds | Optional specialized renderer and spatial streaming. | Generate separate collision/traversal geometry when a solid environment is needed. |
| Foreign game projects | Export source assets through the original toolchain. | Do not mistake engine-specific asset containers or scripts for universal interchange. |

Assimp provides broad format coverage, but its support list includes qualifications and deprecated paths. Use native Blender for BLEND rather than Assimp's deprecated reader. ufbx is a focused FBX reader that can reduce FBX-specific work; it is not itself a complete universal scene compiler. [S18, S19]

Direct SKP support stays in the extensibility plan. The currently published SketchUp SDK access process requires additional access arrangements; meanwhile DAE is an established exchange route documented for 3D Warehouse. This is an implementation dependency, not a reason to reduce the platform's import goals. [S20, S21]

### Asset compiler stages

1 Intake. Perform resumable upload, file-signature identification, archive expansion within limits, dependency inventory and hashing. Accept texture folders as a unit. Ask only for genuinely ambiguous technical choices such as unknown units; supply useful defaults and previews.

2 Isolated parsing. Execute converters in per-job containers or virtual machines with resource limits, minimal filesystem access and controlled network egress. Disable embedded scripts by default. Scene references are resolved through the upload manifest, not through arbitrary host paths or network URLs.

3 Normalization. Convert units and axes, repair supported geometry defects, resolve material texture paths, preserve object names/pivots/hierarchy, and map materials to the supported physically based material model. Keep a report of every approximation.

4 Runtime preparation. Bake supported materials and animation, prune unused data, deduplicate resources, instance repeated objects where appropriate, generate LODs, and split large scenes into spatial cells. Preserve artist-provided LODs where they outperform automatic results.

5 Collision and navigation. Build simplified physical geometry, walkable areas, teleport surfaces, interaction bounds and safe spawn candidates. Architectural openings must remain usable. Hosts can correct generated data through the editor.

6 Verification. Run glTF validation, feature checks, resource-budget checks and preview generation. Validate that expected animation clips, textures and important scene parts remain present. A conversion can succeed structurally and still require visual correction.

7 Publication. Publish immutable asset versions and manifests to object storage, with content hashes and CDN delivery. Reuse derived results when the source hash, converter version and recipe match; changing the recipe produces a new version.

Reuse glTF Transform for structured asset manipulation, meshoptimizer for geometry optimization and compression, KTX/Basis tools for texture delivery, and Khronos glTF Validator for structural checks. Compression, simplification and runtime optimization are separate operations: a smaller download can still contain the same costly number of triangles and draw calls. [S22, S23, S24, S25]

Use a software dependency inventory for the actual converter builds. Blender is GPL software; its license does not automatically make the artwork it produces GPL. Changes or extensions distributed with a converter still require their applicable software obligations to be followed. Keep native tools in isolated services with explicit input/output contracts, and disable embedded script execution for uploaded scenes. [S52, S53]

### Export as a first class capability

Provide complete world-bundle export and reimport, GLB/glTF export for supported scene content, original-file retrieval, and pluggable additional export formats. The complete world bundle includes a manifest, dependency graph, assets, collider/navigation data, behaviors and revision metadata. Tests must verify round-trip preservation of stable object IDs and essential behavior, not just screenshot similarity.

A GLB export is an interoperable rendering asset and may not express every engine behavior. Loss reports must identify what remains in the world manifest. Exact regeneration of every proprietary authoring scene is a separate exporter problem; retain originals and add specific native connectors when needed. No marketplace-specific restrictions are embedded in engine import/export behavior.

## 6 The example venues and animal

The following listing details guide initial technical tests. Actual asset files must be qualified before a scene is advertised as supported at a particular fidelity or device tier.

| Example | Published source characteristics | Engineering treatment |
| --- | --- | --- |
| Acropolis model 2499428 [S26] | glTF, FBX, USD and DCC variants; PBR; 2,109,032 polygons described as quads only. | Try glTF first. Partition and optimize the venue, derive separate colliders, and retain interior openings. Quad counts are not triangle counts. |
| SketchUp Acropolis [S27] | Specific downloadable asset remains to be inspected. Warehouse generally documents DAE availability. | Qualify the actual download and dependencies. Use DAE conversion or the SKP connector as applicable; do not infer polygon count or completeness. |
| Righi American Bald Eagle [S28] | 40,152 quads, modeled feathers, 4K textures; animated Maya 2026.3 source; static OBJ; six animation segments. | Obtain or produce a baked animated exchange export. Preserve feathers and clip names, translate Arnold appearance, then generate quality tiers. |
| Giimann Structure 17 [S29] | OBJ, MAX and DAE; 1,715,148 polygons; V-Ray setup and plugin flag; unwrapped UVs listed as No. | Test OBJ/DAE conversion; qualify material baking and UVs. Confirm whether usable interiors exist before placing indoor conference areas. |

The eagle's technical challenge is not simply polygon count. Its source rig uses expressions and controls, while the alternate OBJ is static. Ask for a delivered skeleton, baked deformation and distinct usable clips, or bake through the native application before conversion. Other animals may use fur systems requiring cards, meshes or specialized rendering; do not assume one animal's successful pipeline covers every species or asset. [S28]

For direct artist procurement, specify both source and runtime deliverables: agreed units and pivots, named objects, packaged textures, documented PBR materials, baked clips, skeleton metadata, LODs, collision suggestions and representative browser previews. Those deliverables simplify ingestion while preserving the highest-quality source for future rendering upgrades.

## 7 Graphics and device adaptation

The renderer should offer high visual quality through physically based materials, lighting and reflections, with the presentation and traversal experience preserved on weaker hardware. Use the full Babylon engine ecosystem through modular imports; load authoring tools, specialized formats and expensive effects only when needed. The quality controller observes real frame time, memory pressure, download and decode behavior rather than relying on a device label alone.

| Experience | Rendering approach | Proposed validation goal |
| --- | --- | --- |
| Premium desktop | Higher-detail assets, richer shadows/reflections, selective postprocessing and more decorative animation. | 60 frames per second in the qualified scene; approximately 16.7 ms per frame. |
| Ordinary desktop or laptop | Reduced shadow/texture/material cost, staged scene loading and controlled avatar/video detail. | A stable 30 to 60 frames per second according to the published device profile. |
| Standalone VR | Stereo-aware budget, restrained transparency and postprocessing, aggressive scene/animation LOD. | Meet the selected headset refresh target, such as 72 or 90 Hz; do not use desktop 30 fps as VR success. |
| Lightweight access | Simplified world or accessible two-dimensional meeting view with presentation and audio priority. | Successful participation on devices that cannot sustain the immersive scene. |

These are proposed targets, not measured guarantees. Rendering budget, transfer budget, physics budget and media decoding budget must be tracked independently. Three beautiful animals can be manageable while too many transparent feather layers or animated avatar skeletons are not; a fast network cannot repair GPU overdraw.

### Quality policy

Generate multiple mesh and texture variants, use projected-size LOD, frustum and occlusion culling, repeated-object instancing, and baked lighting or probes where useful. Stream the current venue area before distant detail. Keep text and presentation screens sharp while reducing decorative effects first. Faraway eagles may use simpler meshes and less frequent animation evaluation while close animals retain a high-quality form.

Prioritize collision and navigation data before allowing movement into a newly streamed area. Quality differences change rendering detail, not the authoritative floor, wall or object location. Dynamic props should receive appropriate lighting probes rather than requiring the entire venue to relight when a host moves a statue.

Expose quality controls and a reduced-motion mode. Automatic downgrades need hysteresis and gradual recovery so the experience does not oscillate. Handle graphics context/device loss by reconstructing render resources from the scene state while preserving the independently managed meeting connection where possible.

### WebGPU and immersive VR

Use WebGL2 as the conservative immersive baseline. Enable desktop WebGPU when supported, and enable WebGPU XR only after checking the immersive session and required XR GPU binding. Babylon's current documentation calls this path experimental and notes feature differences. An existing WebGPU scene cannot simply become a WebGL scene after XR entry fails; the app needs a controlled reconstruction path or must select the VR-compatible renderer first. [S30]

Qualify actual browser/headset combinations, including standalone headsets, PC-connected headsets and visionOS devices when in scope. Display available modes from capability checks rather than device-brand assumptions. Treat hands, controller profiles, eye tracking, face tracking, haptics and composition layers as separately detected capabilities with usable fallbacks.

## 8 Physics navigation and interaction

Rapier owns physical bodies and contacts. Babylon displays interpolated transforms. The authoritative room service owns shared dynamic objects, validates commands and resolves conflicting grabs. An engine integration layer maps asset collision data, coordinate conventions, joints and character movement into those systems. Rapier is Apache 2.0 and includes useful character-controller primitives. [S31, S32]

| Object type | Physical representation | Interaction behavior |
| --- | --- | --- |
| Building or terrain | Simplified static triangle geometry, heightfields or suitable primitive compounds. | Solid walls/floors with doors, arches, ramps and walkable spaces preserved. |
| Attendee | Capsule and character controller. | Walking, slopes, steps, seating and teleport validation; configurable attendee-to-attendee collision. |
| Movable statue or furniture | Bounded convex compounds with appropriate mass/friction. | Select, carry, place or throw under a server-owned control lease. |
| Decorative animal | Visual skeleton and simple optional interaction bounds. | Server-timed behavior and locally evaluated animation; feather-by-feather physics only if explicitly needed. |

Do not wrap an entire architectural complex in one convex hull: that fills openings and usable spaces. Rapier recommends convex decomposition for non-convex dynamic objects rather than detailed dynamic triangle-mesh colliders. CoACD is an available MIT-licensed preprocessing tool to evaluate. [S33, S34]

Use Recast/Detour for navigable surfaces, path queries, NPC routes and teleport destinations. It supplements collision physics. After authoring changes affect geometry, update the impacted navigation tiles or mark them unavailable until rebuilt; safely relocate affected participants if a floor or spawn region is removed. [S35]

Support desktop mouse/keyboard and touch input alongside controller rays, hand selection where supported, direct grabs, snap turning, teleportation and optional smooth locomotion. Preserve real headset tracking: a virtual wall cannot physically stop the user's head. Boundary fading and body constraints should provide feedback without forcing the tracked camera to violate the user's real movement.

## 9 Multiplayer and large conferences

Use Colyseus for room lifecycle, authoritative state synchronization and connection management. Current 0.18 documentation includes fixed timesteps, input buffering and prediction/reconciliation primitives, reducing custom networking work. Our engine still supplies the shared simulation, interaction rules and state design; a networking library does not complete game physics or abuse resistance. [S36, S37]

Start with secure WebSockets for broad compatibility. Separate rendering frequency, simulation frequency and network publication rate. A reasonable initial experiment is a 30 or 60 Hz simulation with pose updates near 15 to 30 Hz and interpolation at the display refresh rate. These are tunable test parameters, not universal settings. Coalesce superseded pose updates, bound queues and protect reliable commands from decorative state traffic.

### Interest and authority

Maintain a spatial index and per-client relevance policy. Nearby participants receive richer head/hand/animation data; distant avatars receive reduced updates or coarse presence. The full scene and asset catalog belong in manifests and cached storage, not in every frequent room-state patch. Colyseus provides per-client StateView filtering but warns against assuming it is optimized for large datasets; measure the actual serialization and filtering work. [S38]

A client requests a grab; the server grants a bounded control lease and validates subsequent movement and release. Use prediction for immediate local response and reconcile with authority. Remote objects interpolate. Clients cannot create unlimited physics bodies, teleport through authoritative collision or acquire presenter control by sending an unchecked message.

### Capacity by interaction mode

| Mode | World arrangement | Media arrangement |
| --- | --- | --- |
| Collaboration | One bounded room where participants interact with objects and one another. | Relevant spatial voice, limited cameras and shared screens. |
| Workshop or breakout | Independent instance for each working group. | Independent authorized media room and presenter controls. |
| Exhibition or networking | Connected zones and room instances, with a directory and portals. | Proximity subscriptions and distinct private conversation groups. |
| Keynote | Stage plus bounded audience instances sharing a common program. | Low-latency presenter SFU; synchronized stage distribution and limited audience participation. |
| Very large audience | Many audience instances or a lightweight viewer. | Produced broadcast via CDN, with separate chat and moderated Q and A. |

Self-hosted LiveKit currently places a room on one node; Colyseus places a room in one process. Adding machines scales concurrent rooms rather than making one room unlimited. The design therefore separates event-wide attendance from the number of fully interactive avatars and subscribed streams per client. [S39, S40]

A large event can present one common keynote while attendees inhabit multiple audience instances and join interactive breakouts. Make instance transitions and participant discovery understandable. Do not imply that everyone sees and collides with every other attendee in one shared simulation when they are in different instances.

Use a stage program clock and source IDs across instances. Deliver the actual program through authorized media relay/republishing to audience rooms or a produced broadcast source delivered to clients; common IDs alone do not move tracks between independent rooms. A CDN broadcast has different delay from the live presenter room, so slides, polls and questions need viewer-latency awareness. Promotion to stage creates an authorized interactive connection and handles feedback loops.

## 10 Media documents and collaboration

Use LiveKit as the default SFU, the service that forwards selected audio/video streams to participants. It supplies reusable media transport and SDKs under Apache 2.0. mediasoup is an excellent lower-level alternative, while Jitsi is attractive when adopting a conventional meeting stack. The proposed media interface should allow substitution without changing world object semantics. [S41, S42]

### Shared surfaces

| Content | World representation | Reusable implementation |
| --- | --- | --- |
| Slides or PDF | Page texture on a screen, wall or portable panel; accessible 2D view. | PDF.js; office-to-PDF conversion for supported inputs. |
| Prerecorded video | Video texture with synchronized play/pause/seek and spatial audio attached to its screen. | FFmpeg-derived variants, CDN delivery and authoritative playback state. |
| Live screen or camera | Live texture on a media surface. | LiveKit publication and subscription; desktop capture is a first-class presenter path. |
| Images and text | Boards, posters, labels and readable panels. | Image/text renderers with resolution and size controls. |
| 3D object | An instantiated asset with selection, manipulation and optional physics. | The same asset pipeline and entity system used for worlds. |
| Notes and whiteboards | Shared editable document connected to a spatial surface. | Yjs plus an authenticated collaboration provider and persistence. |
| Other digital files | An attachment object with preview or registered specialized viewer. | Extensible viewer/converter registry; preserve originals for retrieval. |

PDF.js is Apache 2.0 and can render in the client or a worker. LibreOffice provides headless office conversion under MPL 2.0 with additional component licenses. FFmpeg licensing depends on its build and linked libraries. Run LibreOffice and FFmpeg in isolated processing workers; record the deployed versions and build configuration. [S43, S44, S45]

Static slide conversion does not preserve every PowerPoint animation, embedded application or font effect. Offer desktop screen sharing for the original application, and qualify richer presentation formats as separate viewers. A website iframe is not automatically a texture in immersive VR. Remote browser/application sessions can be an optional adapter where interactive native tools are needed.

### Synchronization and subscription policy

For slides, synchronize asset revision, current page, pointer and annotation state. For file video, synchronize source, play state, position, playback rate, sequence number and a server time anchor; each client fetches media independently and corrects drift. A late joiner reconstructs the current state immediately. The presenter lease serializes changes and releases on expiry or handoff.

For live media, use selective subscriptions with explicit camera/decoder budgets. Stage audio and active presentation screens outrank decorative video. Media priority controls resource allocation; it does not automatically make a source play at uniform volume everywhere. Private conversations require server-enforced media membership/subscription rules; lowering volume on the client does not provide privacy.

LiveKit's adaptive streaming normally observes HTML element visibility and size. A hidden video element used as a texture source can be misclassified as invisible. The engine media adapter must control stream quality from the three-dimensional surface's projected size, visibility and priority, rather than trusting DOM visibility alone. [S46]

A headset may receive a shared screen without being able to originate every kind of screen capture. Support a paired desktop presenter flow and uploaded-media presentations. Browser capture still requires a user-selected source, and audio capture depends on browser and source support. [S47]

## 11 Spatial audio for every world source

Spatial audio is a core engine system, available equally to a game, an exhibition or a conference. Microphones, recorded sounds, music and video soundtracks use the same emitter model. Every world source has a position or attaches to an entity. Global playback is an explicit mode for interface sounds or deliberately configured amplification, never the default for a video placed on a wall.

Use Babylon AudioEngine v2 over Web Audio. Its spatial sound facilities provide scene-node attachment, listener pose, panning, distance models and mixer routing. Custom Web Audio source nodes can enter the engine through its sound-source API, allowing remote media streams and video elements to share the same spatial graph. These are reusable primitives; the source binding, authoring controls, media policy and lifecycle are engine work. [S54, S55, S56]

| Source | Attachment and behavior | Required result |
| --- | --- | --- |
| Bird or other animal | Emitter attached to the animated entity with a configurable local offset. | Sound travels with the animal and changes direction and volume as it passes. |
| Attendee microphone | Incoming media stream attached near the avatar head or mouth. | Each listener hears a different distance and direction; avatar motion and VR head turns update the mix. |
| Waterfall or ambient feature | Point emitter or an approximation using an area or line of emitters. | Sound is strongest near the feature, with a smooth approach and departure. |
| Four corner music tracks | Four independent looping emitters with overlapping audible ranges. | All relevant tracks mix continuously. Walking toward one raises its contribution while others recede. |
| Video on a wall | The video surface owns the audio binding and playback clock. | Sound comes from the screen, moves with it, and follows looping, pause, seek and replacement. |
| Keynote amplification | Explicit speaker placement, a zone bus or a declared broadcast mode. | Hosts choose amplification behavior; ordinary spatial sources keep their configured falloff. |

### Listener and source contracts

Maintain one listener for the local player. On desktop it follows the viewing camera; in VR it follows the current head pose, including orientation, with one listener for the head rather than separate listeners for the eyes. Attach emitters to interpolated world transforms so motion remains smooth between network updates. Store meters consistently across audio, rendering and physics. A screen or avatar can define a local source offset independently of its mesh origin.

An AudioEmitter component records source kind and ID, parent entity, local position/orientation, enabled state, base gain, mixer bus, reference distance, falloff model, rolloff, fade-start distance, audible radius, optional directional cone, looping and clock policy. AudioZone describes an acoustic area, its reverb/occlusion preset and any explicit routing. Access to a private conversation is a separate server-controlled permission, not an acoustic parameter.

Default to a smooth distance curve with a separate end-of-range fade. Web Audio supports inverse, linear and exponential attenuation, but maxDistance applies to the linear model and is not a universal silence switch. The engine therefore defines its own audible radius and fade envelope. At equal distance, equally calibrated unobstructed emitters contribute equally; different recordings may still have different perceived loudness. The editor should offer gain calibration and optional loudness normalization. [S55, S57]

Use HRTF binaural panning for a qualified headphone/VR profile and an efficient equal-power profile where appropriate. HRTF can accept mono or stereo sources; it produces stereo output. Test channel handling explicitly for voices, music and video, rather than assuming every input recording is mono. The renderer computes each source independently, so overlapping music never becomes a nearest-source-only switch. [S57]

### Microphone and video routing

Route an incoming microphone track through one media-stream source, spatial panning and the voice bus. Avoid simultaneously attaching that track to an automatic global audio renderer. Local microphone capture publishes outbound without local speaker monitoring by default. The spatial binding and network subscription manager must agree on track identity, mute state and teardown, including reconnects and replacement microphones.

For a prerecorded video, use the same media element for the visible video texture and its MediaElementAudioSourceNode. Route its audio once through the screen emitter and video bus. Do not create an independent audio player or leave a second global playback path attached. Looping, seeking and pause then share the video clock, while each listener applies local spatialization. Web Audio specifies this media-element rerouting; cross-origin delivery must also be configured for audio processing. [S57]

Use equivalent track bindings for live screens or cameras with audio. Moving, resizing or deleting a surface updates or disposes its emitter; resizing can change an explicitly chosen speaker layout without multiplying the source accidentally. A large screen may use a deliberately designed speaker pair or area approximation. Verify the result as one intended sound system, including phase and gain, rather than treating duplicate playback as spatial width.

### Acoustics performance and user controls

Implement optional wall occlusion with limited-rate collision queries and smooth gain/low-pass changes. Add acoustic zones and modest reverb for indoor or outdoor character. A visually solid wall does not automatically provide realistic sound isolation, and an area waterfall should not sound as if every part comes from one distant point. These features can advance incrementally without requiring a full acoustic simulation before positional sound works.

Maintain voice, video, music, ambience and effects buses with per-user volume controls and a master limiter. Budget active panners and decoders independently of graphics. Virtualize inaudible sources with hysteresis and preserve their timeline so a looping video or music track resumes at its current point when approached. Spatial subscription changes must respect privacy rules and avoid clipping the beginning of nearby speech; pre-subscribe or retain a small transition margin where authorized.

Unlock/resume audio through the join interaction and handle browser suspension, device changes and headset sleep. Qualify microphone echo cancellation through the final playback graph on laptop speakers as well as headphones. One authoritative playback state is shared, but each client owns its listener mix. The 2D accessibility view needs an explicit listening policy and source controls, because it may have no moving 3D camera.

## 12 General engine capability scope

Second Life and teleXLR8 describe the breadth of the desired experience, but acceptance should be based on explicit capabilities. The engine must support the following systems, with conference workflows in the separate application.

| Engine capability | Conference use | Other uses |
| --- | --- | --- |
| Worlds and persistence | Venues, session instances, breakouts, saved arrangements. | Game levels, simulations, exhibitions and persistent social rooms. |
| Terrain and environment | Landscapes, water, sky, weather and lighting presets. | Outdoor games, vehicle routes and environmental simulations. |
| Building and editing | Placement, snapping, cloning, hierarchy, materials, terrain edits and undo. | User-created levels, interactive exhibits and collaborative design. |
| Avatars and animation | Body/hand presence, seating, gestures, emotes and attachments. | Playable characters, NPCs, animation state machines and retargeting. |
| Inventory and object identity | Reusable props, personal items, shared resources and access grants. | Collectibles, equipment, reusable prefabs and optional application economies. |
| Physics and navigation | Solid venues, moving furniture, object manipulation and walking. | Rigidbody games, vehicles, constraints and AI navigation. |
| Behaviors and scripting | Interactive exhibits, doors, media controls, timers and guided tours. | Game rules, triggers, scripted objects and custom simulations. |
| Communication and media | Voice, text, video, shared files, annotations and presentations. | Social games, classrooms, remote assistance and collaborative tools. |
| Identity and permissions | Invite access, speaker/host capabilities and moderation primitives. | Teams, game ownership, private worlds and application-specific rules. |
| Discovery and portals | Venue navigation, participant directory and session movement. | Level transitions and navigable world networks. |

Avatar support should include generic skinned glTF assets, a qualified avatar-format adapter such as VRM, skeleton mapping, animation blending and retargeting, inverse kinematics, locomotion/emote states and attachment points. Non-humanoid animals need their own rigs and behaviors. Additional face/body trackers integrate through capability adapters rather than becoming required hardware.

First-party plugins can be trusted TypeScript modules. Creator-authored behaviors need a bounded execution design: an explicit capability API, no ambient application credentials, time/memory limits, controlled persistence/network access, and termination. Begin with declarative triggers/actions that support useful interactivity; qualify an isolated script runtime for more general authoring. A worker by itself is not the entire security boundary.

These are substantial systems, not features guaranteed by selecting a renderer. Commerce, land-economy rules, payment processing, particular Second Life script compatibility and global world federation can be application/compatibility modules if requested. The architecture must allow them without making a continuous planet or an economy a prerequisite for a conference.

## 13 Security privacy and content processing

Use one server-verifiable principal across the conference API, world instance, collaboration service and media session. Exchange application authorization for short-lived, narrowly scoped engine and media grants. Bind every asset operation, join request, presenter action and editing command to its appropriate tenant, instance or entity. Check authorization on the server; hidden controls are not enforcement.

Validate all untrusted inputs: nested archives, oversized geometry, texture dimensions, malformed animations, paths, media containers and unsupported active content. Enforce converter limits and isolate native processes. Arbitrary external URLs need an authenticated fetch service with destination validation and egress controls. Imported scene scripts are data until explicitly accepted through the behavior system.

Keep motion and biometric-adjacent tracking ephemeral by default. Store only the events and recordings needed by the selected product policy. Separate private content from publicly reusable material; users and organizations control their own sharing through engine capabilities. Those access controls do not impose vendor-specific limits on the engine's available functions.

### Encryption and recording modes

LiveKit supports end-to-end encryption, while application developers own key distribution and signaling remains server-visible under TLS. A recorder or captioner that can read encrypted media is an authorized endpoint with keys. State this boundary clearly rather than describing server-side recording as invisible to an end-to-end privacy model. [S48]

Offer private sessions with participant-held media/content keys and no undisclosed processing endpoints. Offer recorded conference sessions with an explicitly admitted recorder and application-defined access/retention. Uploaded material processed by a server converter is necessarily visible in that conversion trust boundary; a strictly private workflow can accept locally prepared runtime assets or use an explicitly trusted converter. Authoritative physics also requires the server to process the collision and interaction state it arbitrates.

Protect service credentials outside the browser, sign or integrity-check engine distributions, record dependency versions and scan deployable artifacts. Generic permissions should support joining, observing, speaking, presenting, creating, editing, deleting, exporting and administering. The application maps attendee, speaker, exhibitor and host roles to those capabilities.

## 14 Infrastructure and operations

Use PostgreSQL, including Neon if desired, for durable accounts, event configuration, world revisions, permissions and audit metadata. Store assets, previews and media in object storage. Transient poses and audio/video stay off the database write path. Introduce a durable job queue and idempotent processing for imports and transcodes; retries must not create duplicate published revisions.

Use a Redis-compatible coordination layer for room placement, transient presence and pub/sub where upstream components require it. Valkey is a suitable candidate for qualification, but verify the exact LiveKit/Colyseus versions, commands, TTLs, scripts and failover behavior rather than assuming compatibility from the protocol name. [S49]

### Hosting choices follow transport requirements

Render can host the application API, web frontend and suitable background workers. Its WebSocket documentation says connections are assigned across service instances and reconnections are not guaranteed to return to the same instance. A Colyseus deployment therefore needs room-owner-aware routing and drain/reconnect handling; generic autoscaling alone does not solve this. [S50]

Host self-managed LiveKit and TURN on infrastructure that exposes the required UDP/TCP media ports, such as suitable virtual machines or a configured Kubernetes deployment. Treat this as a separate media fleet. A managed media provider can accelerate initial deployment through the same adapter, while the self-hosted path remains available. Start with a modest deployment and add orchestration complexity only when measured operation needs it. [S51]

World workers periodically checkpoint recoverable transient state and drain before planned termination. A crash can require clients to reconnect to a replacement instance and restore the latest checkpoint; do not advertise uninterrupted migration until demonstrated. Use readiness checks that verify required dependencies, rollback-capable releases, and a room-owner lease/epoch so two workers cannot both act as the current authority.

Instrument browser frame time, asset timing, converter duration, world tick cost, queue depth, room joins, WebRTC quality, reconnects and recording health. Correlate by opaque session/instance IDs without logging document content or full tracking streams. Capacity planning should include participant minutes, SFU/CDN egress, concurrent publishers, media decoding, conversion CPU, optional GPU jobs and stored recordings. Graphics in the ordinary path render on client devices.

Cloud-rendered video can be a separate advanced option for unusually demanding desktop scenes. It introduces streaming cost, latency and different interaction constraints, particularly in VR. It is not required for the base browser engine or a substitute for a properly optimized local rendering path.

## 15 What we reuse and what we build

| Area | Already supplied by candidates | Our integration or product work |
| --- | --- | --- |
| Graphics and XR | Babylon rendering, materials, animation and XR primitives. | World model, quality adaptation, assets, application lifecycle and qualified device behavior. |
| Physics and navigation | Rapier, Recast/Detour and preprocessing tools. | Collision pipeline, interaction rules, authority, editor changes and safe traversal. |
| World networking | Colyseus rooms, state synchronization and current netcode primitives. | Schemas, spatial relevance, physics contract, routing, permissions and recovery. |
| Live conferencing | LiveKit transport, tracks, subscriptions and SDKs. | Spatial sound, world surfaces, event media policies, stage fanout and recording UX. |
| Spatial audio | Babylon AudioEngine v2 and Web Audio source, listener and panner primitives. | Entity bindings, video/microphone routing, acoustic zones, editor controls and source budgets. |
| Scene authoring | Babylon tools; possible VRSpace or Hubs/Spoke reuse. | Coherent browser editor, saves/undo, concurrency, import jobs and world export. |
| Asset processing | Blender, Assimp, ufbx, glTF Transform, compression and validation. | Reliable service orchestration, feature coverage, native connectors, diagnostics and fidelity checks. |
| Shared documents | PDF.js, office/media converters and Yjs. | Readable 3D/2D surfaces, presenter control, permissions, synchronized playback and accessible workflows. |
| Conference application | Generic engine capabilities and UI libraries. | Registration, agenda, event roles, breakout management, keynote controls, reports and branding. |

The largest remaining work is a reliable content pipeline, cohesive authoring and VR interaction, coordinated world/media permissions, large-event operation and product validation. No defensible percentage of time saved follows from GitHub feature lists alone. The reuse qualification should preserve functioning subsystems whenever their adaptation and maintenance cost is lower than replacement.

## 16 Acceptance evidence before release

The following are proposed qualification scenarios and exit conditions. They should become measurable development gates in the subsequent PR plan. They are not claims of achieved capacity or a fixed ceiling on future growth.

| Gate | Required evidence |
| --- | --- |
| Engine independence | Offline playground and multiplayer game use the published engine without importing conference modules; app consumes a released version. |
| Asset coverage | A feature-level fixture corpus covers each advertised format, missing dependencies, rigs, materials and failure modes; original and derived data are preserved. |
| World round trip | Export and reimport a complete editable world; retain IDs, prefabs, behaviors, collision, media references and terrain. Verify migration between schema versions. |
| Venue and animal fidelity | Inspect real architecture and animal files, animation clips, materials, collider openings and device variants. Compare reference views and traversal behavior. |
| Interactive rooms | Exercise 20, 50 and 100 participant scenarios while independently varying voice, cameras, screens, avatar detail and dynamic objects. Publish the passing profiles. |
| Event scale | Increase concurrent rooms and broadcast attendance separately. Use realistic workloads; idle connections alone do not establish conference capacity. |
| Graphics | Measure p95/p99 frame timing, memory, transfer and decoder use on specified laptops and actual headsets; sustain the chosen XR refresh target. |
| Network adversity | Test restricted corporate networks, TURN fallback, packet loss, changing devices, permission denial, suspended tabs, headset sleep and reconnect. |
| State correctness | Conflicting grabs, late joins, presenter handoffs, world edits, retries and crashes produce one valid authoritative state with predictable recovery. |
| Spatial mixing | Four corner tracks remain continuously mixed. Equal calibrated sources balance at equal distance; motion, VR head rotation, falloff, cutoffs and occlusion behave as configured. |
| Attached media audio | Moving birds and avatar microphones retain attachment. A wall video loops with spatial sound, remains synchronized, has no duplicate global route, and disposes cleanly. Clients at different positions hear the corresponding spatial mixes. |
| Audio devices | Test echo cancellation with laptop speakers and headphones, simultaneous remote voices and video audio, output-device changes, reconnects and headset resume through the final spatial graph. |
| Security and privacy | Attempt cross-tenant joins, unauthorized media subscription, arbitrary editing, malicious imports and excess resource use; verify recording/key boundaries. |
| Accessibility | Join and participate with keyboard, readable text, captions where provided, reduced motion and a 2D presentation path. |
| Operations | Demonstrate restores, worker/media failure recovery, draining, rollback and observability using deployable pinned builds. |

Set concrete service-level targets after selecting the reference hardware, representative assets and event interaction modes. Useful measurements include time to usable entry, voice join success, presentation drift, physics tick headroom, state recovery time and per-participant cost. Keep performance results attached to a specific configuration so the product does not confuse an auditorium benchmark with a fully interactive workshop.

## 17 Architectural decisions to carry into development

Use one reusable engine repository and one conference application repository, with the dependency flowing from application to engine.

Preserve full import, editing, conversion and export capabilities. Source content and services from suppliers that support the product.

Use the Babylon modular stack as the proposed default, subject to a bounded Hubs/VRSpace reuse qualification that can replace whole subsystems.

Store complete worlds in a versioned manifest and bundle; use glTF/GLB for interoperable rendered assets.

Separate authoring history, authoritative live simulation, collaborative documents and media transport.

Make microphones, video soundtracks, music and environmental sounds spatial by default, with entity attachments and continuous per-listener mixing.

Optimize independently for graphics, asset transfer, simulation and media decoding; retain source quality for premium device profiles.

Scale conferences through appropriate room, stage and broadcast modes; qualify single-room density independently.

Treat exact format fidelity, device coverage, capacity and operational recovery as tested claims, with evidence required before release.

The next planning deliverable can turn these contracts, reuse decisions and acceptance gates into dependency-ordered PRs. This architecture intentionally defines the technical work first; repository creation and implementation belong to that next stage.

## Source references

Primary project documentation and repositories reviewed for this architecture on 17 October 2026. Source numbers identify the supporting reference beside factual claims. Design recommendations and test profiles are the proposed architecture.

S01  [Babylon.js repository and license](https://github.com/BabylonJS/Babylon.js)

S02  [Babylon.js official feature specifications](https://www.babylonjs.com/specifications/)

S03  [Hubs Foundation client and Community Edition entry point](https://github.com/Hubs-Foundation/hubs)

S04  [Hubs Foundation Spoke browser editor](https://github.com/Hubs-Foundation/Spoke)

S05  [VRSpace repository and reusable client/server artifacts](https://github.com/jalmasi/vrspace)

S06  [Mozilla MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)

S07  [PlayCanvas runtime](https://github.com/playcanvas/engine)

S08  [PlayCanvas editor frontend](https://github.com/playcanvas/editor)

S09  [Three.js repository](https://github.com/mrdoob/three.js)

S10  [A-Frame repository](https://github.com/aframevr/aframe)

S11  [iR Engine repository and license](https://github.com/ir-engine/ir-engine)

S12  [Godot current stable web export documentation](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)

S13  [Third Room and Manifold engine status](https://github.com/matrix-org/thirdroom)

S14  [Croquet library and reflector server](https://github.com/croquet/croquet)

S15  [Babylon.js desktop editor](https://github.com/BabylonJS/Editor)

S16  [Khronos glTF specification and ecosystem](https://github.com/KhronosGroup/glTF)

S17  [Yjs shared types and collaboration](https://github.com/yjs/yjs)

S18  [Assimp supported file formats](https://github.com/assimp/assimp/blob/master/doc/Fileformats.md)

S19  [ufbx FBX loader](https://github.com/ufbx/ufbx)

S20  [SketchUp Desktop SDK access](https://extensions.sketchup.com/sketchup-sdk)

S21  [3D Warehouse downloadable file formats](https://help.sketchup.com/en/3d-warehouse/downloading-model-file-formats)

S22  [glTF Transform](https://github.com/donmccurdy/glTF-Transform)

S23  [meshoptimizer](https://github.com/zeux/meshoptimizer)

S24  [KTX Software and texture processing](https://github.com/KhronosGroup/KTX-Software)

S25  [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator)

S26  [Acropolis model 2499428 listing](https://www.turbosquid.com/3d-models/the-acropolis-3d-model-2499428)

S27  [User-supplied SketchUp Acropolis model identifier](https://3dwarehouse.sketchup.com/model/u5dc7fd58-c38c-4860-bf11-a746a9a01e46)

S28  [Massimo Righi American Bald Eagle listing](https://www.massimorighi.com/product/7657/)

S29  [Giimann Futuristic Architectural Structure 17 listing](https://www.cgtrader.com/3d-models/exterior/sci-fi-exterior/futuristic-architectural-structure-17)

S30  [Babylon WebGPU in WebXR support and limitations](https://doc.babylonjs.com/features/featuresDeepDive/webXR/webGPUXR/)

S31  [Rapier physics repository](https://github.com/dimforge/rapier)

S32  [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)

S33  [Rapier collider guidance](https://rapier.rs/docs/user_guides/javascript/colliders/)

S34  [CoACD convex decomposition](https://github.com/SarahWeiii/CoACD)

S35  [Recast Navigation and Detour](https://github.com/recastnavigation/recastnavigation)

S36  [Colyseus repository and license](https://github.com/colyseus/colyseus)

S37  [Colyseus 0.18 netcode primitives](https://docs.colyseus.io/netcode)

S38  [Colyseus StateView filtering](https://docs.colyseus.io/state/view)

S39  [LiveKit distributed deployment and room placement](https://docs.livekit.io/transport/self-hosting/distributed/)

S40  [Colyseus scalability and room ownership](https://docs.colyseus.io/scalability)

S41  [LiveKit server repository and license](https://github.com/livekit/livekit)

S42  [mediasoup architecture overview](https://mediasoup.org/documentation/overview/)

S43  [PDF.js repository and license](https://github.com/mozilla/pdf.js)

S44  [LibreOffice licenses](https://www.libreoffice.org/licenses/)

S45  [FFmpeg license and build considerations](https://ffmpeg.org/legal.html)

S46  [LiveKit selective subscriptions and adaptive streaming](https://docs.livekit.io/transport/media/subscribe/)

S47  [LiveKit screen sharing](https://docs.livekit.io/transport/media/screenshare/)

S48  [LiveKit encryption overview](https://docs.livekit.io/transport/encryption/)

S49  [Valkey migration and protocol compatibility](https://valkey.io/topics/migration/)

S50  [Render WebSocket routing and lifecycle](https://render.com/docs/websocket)

S51  [LiveKit ports and firewall requirements](https://docs.livekit.io/transport/self-hosting/ports-firewall/)

S52  [Blender license and Python extension guidance](https://www.blender.org/about/license/)

S53  [Blender embedded script security](https://docs.blender.org/manual/en/latest/advanced/scripting/security.html)

S54  [Babylon AudioEngine v2 overview](https://doc.babylonjs.com/features/featuresDeepDive/audio/)

S55  [Babylon spatial sound attachment and distance properties](https://doc.babylonjs.com/typedoc/classes/_babylonjs_core.AbstractSpatialAudio)

S56  [Babylon custom audio source creation](https://doc.babylonjs.com/typedoc/functions/_babylonjs_core.CreateSoundSourceAsync)

S57  [W3C Web Audio Recommendation](https://www.w3.org/TR/2021/REC-webaudio-20210617/)
