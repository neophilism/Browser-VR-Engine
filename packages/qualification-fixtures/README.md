# Reproducible qualification fixtures

Original synthetic assets and a shared scenario for F04/F05 foundation comparison. The package generates actual self-contained glTF 2.0 files, PCM audio and JSON inputs. The original encoded WebM seed is included. No vendor model, private recording, renderer or candidate service is required to generate the set.

```sh
npm run build
npm run generate --workspace @browser-vr-engine/qualification-fixtures
npm run check:fixtures --workspace @browser-vr-engine/qualification-fixtures
npm run example:fixtures
```

Generation emits 19 files under `fixtures/`. `--check` compares every byte and rejects missing, changed or untracked output files. `catalog.json` identifies each original asset, provenance, size and SHA-256. `comparison.json` binds the world, scenario, thresholds, workloads, device targets, catalog and exported schemas by content digest.

| Fixture | Purpose |
| --- | --- |
| `models/courtyard.gltf` | A 24 m courtyard, columns, segmented open arch, 1.2 m by 2.2 m doorway, 18 cm steps, ramp and a 5 cm thin barrier |
| `models/coordinates.gltf` | One-meter RGB positive-axis markers |
| `models/prop.gltf` | An asymmetric original movable object instanced ten times |
| `models/creature.gltf` | A five-joint skinned bird, two named clips, a morph target and an attachment marker |
| `audio/corner-0.wav` through `corner-3.wav` | Four mono 48 kHz, PCM16 one-second loops at 220/330/440/550 Hz, each -24 dBFS RMS |
| `audio/calibration.wav` | A 1 kHz loop used as the moving creature source |
| `media/screen-marker.webm` | Original 720p/30 frame-counter video with timed audio pulses |
| `media/readability.svg` | Original 16:9 image for media/import readability checks |

`world.json` contains 55 entities. Static collider-only entities are invisible proxies for imported architecture; they must not render another copy of the visible geometry. Their local box extents and transforms match the real glTF nodes. Physics simulation and traversal still require candidate implementation and observation.

The media surface is a centered **unit quad** in the local XY plane, with its front toward +Z. Entity scale supplies the physical width and height. The wall's source aspect ratio is metadata, not another size multiplier. The surface and its positional audio component share a single playback identity. There are six positional emitters: four corner music sources, the moving bird and the wall. Isolate the music bus for four-source calibration; the other two sources must not bias that measurement.

Public imports provide `generateFixtureSet`, `generateToneWav`, the small synthetic geometry generators, `createFixtureAssetPort` and `createFixtureAuthorizer`. Fixture files are available through `@browser-vr-engine/qualification-fixtures/fixtures/*` exports. The local asset port resolves only the explicit catalog and verifies bytes on access; it has no network or path fallback. The fixture authorizer grants only exact synthetic scope/operation/target matches. Neither helper replaces production identity or storage authorization.

The models are checked with the pinned official Khronos glTF validator, plus independent assertions for winding, skin data, source amplitudes and geometry/collider alignment. This establishes fixture validity and reproducibility. It does not establish candidate rendering quality, codec playback, browser authoring, SFU operation, room capacity or headset support.

The protocol, frozen thresholds, actual-device requirements and later-card boundaries are in `docs/qualification/f03.md` at the repository root. Source encoding details are in `sources/README.md`.
