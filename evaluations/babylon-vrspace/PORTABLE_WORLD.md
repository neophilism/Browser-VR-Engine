# Portable authored-world evaluation

This candidate can export the complete canonical authored document and every declared original file into one `.bveworld` file, then open it in a fresh browser context. This is a bounded F05 evaluation carrier. It does not select the F06 foundation or commit the engine to a production storage format.

Use **Export world** to download the carrier and **Open world** to validate and load it. Opening `/?world=empty` creates no evaluation renderer or audio context and requests no fixture originals until a valid carrier is supplied. The portable loader resolves assets only from the package. It does not fetch missing fixture bytes. The separate **Export GLB** action exports a geometry/material/animation subset. The legacy transform snapshot helper is local to an existing instance.

## What is preserved

The full authored world document is preserved, including asset references, optional component data, hierarchy, matrix/TRS transforms, collider descriptors, animation associations, screen/media bindings and spatial emitter descriptors. All eleven declared F03 originals are physically present, including unused resources. A dropped model adds its original bytes and a canonical hierarchy: the movable collider is on the parent; centering and uniform scaling are authored on a mesh child; the imported model's own hierarchy and local transforms remain intact.

The world revision uses the frozen F03 derivation. The complete canonical manifest and complete carrier body also have their own integrity hashes, so metadata outside that revision derivation is still covered. A later re-export preserves authored state even after physics, animation and playback have advanced. Opening starts those live clocks and body motion anew; it does not resume a session checkpoint.

## Trust and allocation boundaries

The uncompressed framing uses an eight-byte `BVEF05W1` magic, two little-endian 32-bit lengths, a SHA-256 body digest, canonical UTF-8 JSON and length-delimited original payloads. The parser rejects noncanonical or duplicate JSON keys, trailing/truncated content, duplicate/missing/reordered assets, mismatched references and hashes, unsupported required components, unsafe hierarchy and excessive budgets. It copies caller-owned typed arrays before hashing; Node Buffer views do not retain mutable aliases.

The carrier is capped at 2 MiB of manifest, 128 MiB of payload, 128 assets and 512 entities, with at most 32 MiB per original. The checked model importer enforces buffer/accessor/image/animation/node/draw budgets; the world adds aggregate decoded-resource and instance budgets before native rendering. Public load checks byte types, counts and sizes before making owned copies, validates world descriptors before cloning them, and verifies the authored revision and each original before allocating physics or audio.

Rendered media is deliberately limited to the exact frozen catalog's audio, video and image descriptors and hashes. Unused assets are bounded opaque bytes. This does not claim generic media upload safety or provide video/document conversion. Those remain later import/transcode work. No arbitrary scripts, external model dependencies or iframe viewers are introduced.

Static box colliders use the full composed affine transform to construct a convex hull; negative scale and shear remain authored data. Static colliders under moving or route-animated ancestors are explicitly rejected. Dynamic/kinematic colliders require root TRS in this slice. The loader does not silently approximate unsupported moving affine geometry. Animation selection requires one exact native clip name.

## Ownership and cleanup

Startup and file opens share one host task. A concurrent file event cannot allocate another instance during startup. A public load reserves the fresh instance before its first await; another load is rejected, and disposal waits for pending native decode work to settle before releasing the scene. Authored transform edits are rejected while an import owns its transaction, preventing stale import publication from overwriting a concurrent edit.

Package validation precedes replacement. After validation, the prior instance releases ownership before a new renderer is allocated. Native XR end must succeed before its renderer can be freed. Ordinary cleanup attempts every owner even when another owner fails. Failed audio closure or other retained ownership prevents a replacement instance from allocating until cleanup succeeds on retry. Initial native load failure restores a retryable empty host and its file control.

## Reproducible source and test coverage

The build uses the checked `packages/contracts/src` source directly. TypeBox 0.34.52, including subpath imports, resolves only from this evaluation's pinned dependency. The exact actual transitive workspace input set is checked against the declared seven TypeScript files plus contracts package metadata. Local/workspace fingerprints are captured before compilation and compared afterward; a changing source cannot receive a misleading final build receipt.

The receipt binds 15 evaluation build inputs, 8 workspace inputs, 4 outputs and 28 evaluation source files. The canonical evaluation graph has 13 stages and keeps the desktop 19-check and emulated XR 10-check lanes separate from the nine portable checks. The portable lane uses real separate BrowserContexts, blocks fixture routes after authoring, retains all three carrier files, and compares exported/re-exported bytes and independently derived content. It also holds native fixture/read/decode promises at the ownership boundaries and injects a controlled audio close failure to prove retained ownership and retry. Its final report includes errors emitted during fingerprinting and resource closure.

Commands are `node run.mjs build`, `node run.mjs test-server`, `node run.mjs test`, `node run.mjs test-xr` and `node run.mjs test-world`. Root `node scripts/ci/evaluate.mjs --local` runs the full required local graph with an explicit verified `CHROME_EXECUTABLE`; its evidence always remains local and `complete: false`. Hosted current-head CI and independent downloaded-artifact verification remain the acceptance path.

Physical headset/audio, target-device performance, long-session cleanup trends, durable shared worlds, real shared media, generic converters and production publication are not established by these local carrier checks. The existing service lane remains separately required.
