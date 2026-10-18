# F05 portable authored-world evaluation

## Implemented scope

The isolated Babylon/VRSpace candidate now exports a bounded authored-world carrier and opens it in a fresh instance. It carries the canonical document and all declared original assets, including unused originals, imported model bytes, hierarchy and normalization, collider descriptors, animation associations, and positional audio/video bindings. It preserves authored state while restarting live physics, media and animation clocks. It does not claim live-session restoration, a selected production file format, or complete F05 qualification.

The implementation and limits are documented in [PORTABLE_WORLD.md](../../evaluations/babylon-vrspace/PORTABLE_WORLD.md). The new browser lane is separate from the existing desktop, emulated XR and released-service lanes. The unchanged F03 inputs and thresholds remain the comparison baseline.

## Recovery and source identity

After the browser-tool timeout and transient filesystem rollback on 2026-10-18, the earlier uncommitted portable implementation and report bytes were unavailable. A bounded search found no surviving handoff. They were reconstructed and tested afresh; unavailable old results are not used as evidence.

Two explicitly incomplete checkpoints preserved the recovered source on `feat/f05-portable-world-recovered`: `fe9a0af1db58ea87ce702f9a0a85cb51d561adf1`, then `a017afcfcf10eb1ae188fc883cdd040c1518566d` with tree `e3d248a14e9f68e7c268d9cb68c39c0220626ed1`. The second checkpoint contains the functional implementation and historical development captures. The later canonical run below binds its actual source bytes, including the final explanatory GLB scope correction.

The [development record](../../evaluations/babylon-vrspace/evidence/portable-recovery-development/README.md) preserves the first actual unit, desktop and portable runs. Their source and collection limitations remain explicit. These records were not relabeled as the final run.

## Fresh canonical local execution

The [original final collector files](../../evaluations/babylon-vrspace/evidence/portable-recovery-final/README.md) record execution from `2026-10-18T20:53:07Z` to `20:54:33Z`. All twelve executable stages passed. The thirteenth stage, browser installation, is explicitly `skipped_local` because a verified existing Chrome binary was selected. The manifest remains `mode: local`, `complete: false`, `dirty: true`, with no collection failures; local evidence cannot satisfy hosted acceptance.

| Actual check | Result |
| --- | --- |
| F04 toolkit | Install, pinned source, 15 Node tests, 20 Python tests, 68 historical integrity files, and actual npm audit passed |
| F05 toolkit | Install, build, 80 unit/server/import/XR/portable tests, and actual npm audit passed |
| Desktop browser | 19/19 in `run-yrunNw` |
| Emulated XR | 10/10 in `run-cAb3oT`; physical headset remains false |
| Portable browser | 9/9 in `run-lBXHkM`; physical headset/audio remain false |
| Collection | 31 report files plus manifest, with independent command bounds and fresh run-directory detection |

Both npm audits returned zero advisories. Those modern toolkit results do not replace the separate failing legacy Hubs runtime graph audit.

The portable report ran from `20:54:01.213Z` to `20:54:33.148Z`, inside its independently recorded command bounds `20:54:00.830Z` to `20:54:33.171Z`. Its SHA-256 is `af05fc6439b89a550d1d53daa74c03dad5a4857858c4ae8809aac02cd2489544`. The complete local manifest SHA-256 is `6b11d4e211deb6b61267edf31ec17a5531e51d9be11e48c2cb9ce8929b79506e`.

All 28 source files, 15 evaluation build inputs, eight workspace inputs and four outputs match the final run. The independent artifact parser verifies framing, canonical JSON, authored revisions, all eleven frozen originals, the exact imported-model derivative, normalization, hierarchy and affine additions. Export and re-export preserve identical authored carrier bytes. Downloaded browser bundles are not executed for verification.

The browser observations also exercise held startup/load/import promises, rejected concurrent operations, disposal waiting for native decode, cleanup failure retaining ownership, and a successful cleanup retry. The retained direct-run and canonical reports preserve their separate meanings.

## Integrated foundation execution

The [original local foundation receipt](portable-integration-local-2026-10-18/index.json) records all six stages passing from `20:59:17.754Z` to `20:59:38.815Z`, including 39 package tests, 350 tooling tests, both standalone examples, the external packed consumer, sharding and the actual root dependency audit. No test was skipped. The checkout remained dirty and local, so its manifest correctly has `complete: false`.

## Review and integration gate

The separate [assistant self security review](../security/F05-portable.md) found no remaining blocker in this bounded implementation after the reported fixes. PR9 subsequently passed all four candidate jobs and all artifact verifiers, then merged at `5979457d6f2f69b710bd08af745ef9f1b048d4ca`. Main `39166555145` failed one portable media-readiness observation, so main verification remains unresolved. The [original candidate/main receipt](portable-integration-ci-39166203932/index.json) and [separate readiness repair](F05-portable-readiness.md) preserve the actual outcomes and required next gates.

The same change permanently retains [PR8's already verified candidate/main artifacts](hubs-runtime-integration-ci-39156160278/index.json). PR8 tooling acceptance remains separate from its undispatched manual Hubs runtime.

## Remaining qualification

F04/F05 remain blocked and F06 remains unselected. Shared authoritative objects/physics/media, measured audiovisual timing, the frozen workload and ten-cycle protocol, physical headset/audio and target-device results remain open in the [qualification map](../qualification/f05-gap-map.md). XLR8 still begins only after the complete engine release. No generation provider or payment credential is needed for this evaluation.
