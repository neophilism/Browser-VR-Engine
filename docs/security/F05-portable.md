# F05 portable-world separate self security review

Review date: 2026-10-18. Reviewer: the primary implementation assistant in a separate post-verification review pass. This is an assistant self review, not an independent human approval. Parallel agents also reviewed source and evidence; their findings supplement this review.

## Reviewed identity and scope

Reviewed source is the reconstructed portable checkpoint tree `e3d248a14e9f68e7c268d9cb68c39c0220626ed1`, published as `a017afcfcf10eb1ae188fc883cdd040c1518566d`, followed by the source-identical canonical local evaluation and documentation/evidence integration. The eventual PR review must bind the final exact head. A later source change invalidates this source review until its diff and changed behavior are reviewed.

The review covers the portable framing/parser, caller-byte ownership, public load boundary, model import transaction, canonical hierarchy and affine collision projection, media routes, native load/dispose ordering, host replacement and cleanup retry, isolated contracts build, 13-stage evaluation collector, independent carrier inspection, and released-service workspace source bindings. It also checks that the retained PR8 evidence is a restoration of original bytes and does not claim the manual Hubs diagnostic ran.

Principal final source SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `evaluations/babylon-vrspace/src/main.js` | `6889963cd7d2821e8dbdee4f64c3b7ddcfa46110f3b5b7ff61917cc68fa7e787` |
| `evaluations/babylon-vrspace/src/portable-world.js` | `5650e8556c4d53145defed4f2d930756d9d8c3c0ed2b738910e9d462e75e4e85` |
| `evaluations/babylon-vrspace/src/spatial-audio.js` | `16a4a798e18934515ec725868880520fa99b45f6abf9b3709a222ccce0c05725` |
| `scripts/ci/evaluate.mjs` | `5ea8133f07a7a119eda554097e868ecc5ea03170437dd4710cbe701a3d6c9833` |
| `scripts/ci/portable-carrier-evidence.mjs` | `a1afed5513262420bfe79dbda0ff152740543e76e03b8bcb2031edc8148266b9` |
| `scripts/ci/service_evidence.py` | `7c8e5a43b8a151b385d137cdc21185dccc013f01a8869a9712d4698427a3cd31` |

## Findings resolved before this review concluded

- Caller-owned Buffer views could alias mutable storage. The portable boundary now creates owned byte copies; size/type/count checks precede allocation, including public `load()` calls.
- Initial fixture startup could race a programmatic open. Startup and open now share one host task; the browser regression holds fixture loading and observes no second renderer allocation.
- An awaited model import could overwrite a concurrent authored edit. The importer owns its transaction and rejects edits until publication or rollback completes.
- Concurrent public loads and disposal during a native decoder await could corrupt ownership. Load reserves the instance before awaiting, duplicate load rejects, and disposal waits for pending work to settle before native resources are freed.
- A cleanup failure could lose the owner needed for retry. Cleanup attempts all owned resources, preserves failed ownership and blocks replacement allocation until a successful retry. Native XR end precedes renderer release.
- Static children of moving ancestors could diverge from their colliders. This slice rejects unsupported ancestry; supported static boxes use the full composed affine corners. Moving colliders require the documented root-TRS semantics.
- Clip lookup, route values, emitter descriptors, transforms and imported resource budgets needed explicit validation. Required unsupported semantics reject before publication; exact animation names are required.
- Build/source and evidence binding needed the transitive contracts closure. Before/after input fingerprints, isolated TypeBox resolution, actual esbuild workspace-input inspection, all four outputs, and service before/after snapshots now cover it.
- A final GLB description referred to the earlier transform-only snapshot. Its explanatory text was corrected before the final canonical run; the prior development reports retain their prior source identity.

## Trust boundaries and review result

Untrusted carrier bytes are length/depth/count bounded, canonicalized and hash checked before scene allocation. Model resource declarations pass the existing bounded importer. Integrity hashes establish byte identity; they are not a generic native-decoder safety guarantee. Rendered audio/video/image data is restricted to the exact known F03 media catalog in this evaluation; bounded unused originals remain preservable. General media import and conversion remain planned product capabilities.

Authored originals and semantics remain intact while runtime clocks restart. The file is explicitly an evaluation carrier. Unknown optional data remains subject to contract preservation; unsupported required behavior is rejected. No external script, arbitrary model dependency, iframe viewer, conferencing policy or provider key path is added.

The CI verifier parses retained carriers independently and derives expected synthetic imported content from checked F03 bytes. Changed report counts, consistently rehashed malicious envelopes, stale runs, fatal-error fields, missing originals, source drift and missing workspace coverage cannot establish acceptance. Local mode keeps its omitted browser installer and `complete: false`; physical-device flags remain false. Required existing service and desktop/XR lanes remain in place. Neither the main engine workflow nor the pinned shared service process helpers is changed.

**Result:** no remaining blocking finding within this source and evaluation scope. Actual functional evidence is recorded in [F05-portable.md](../evidence/F05-portable.md). Hosted current-head checks and artifact verification, safe merge and main verification are still separate gates. Full foundation qualification, production upload isolation, shared authorization, sustained resource behavior, target-device performance and physical headset/audio remain unverified.
