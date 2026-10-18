# F04: pinned Hubs / Spoke evaluation

**F04 remains blocked.** This bundle makes the completed local work reproducible and preserves its limits. It does not select a foundation or satisfy the full F03 scenario, service, two-client, reconnect, performance, or headset gates.

The demonstrated subset is useful: the real Spoke editor loads the original F03 courtyard, skinned creature and media; a numeric-field edit moves a prop and its collision proxy; native GLB export retains the creature skin and both animation clips; native project reload retains the mapped edit, collision relationship, screen size and positional-video setting. A fresh Hubs typecheck, its one upstream unit test, and a production client build also pass. See `evidence/index.json` and `REUSE_ASSESSMENT.md` for what this evidence can support.

The next [real Hubs runtime diagnostic](runtime/README.md) is prepared separately: exact Hubs/Reticulum/Dialog sources, immutable container contexts, mandatory audits, real loopback readiness and a native two-browser room/rejoin harness. Its pure checks pass, but the new container/backend/browser path is unexecuted because local Docker and the required procfs supervision surface are unavailable. The [manual Ubuntu replay](runtime/HOSTED_REPLAY.md) provides the next compatible host through an explicit reviewed-main dispatch. It has no required runtime job and does not change the existing evidence claims.

## Reproduce

Use Node 24 and Git. The bundle is a private standalone npm project, outside the root workspaces; its two pinned tools do not enter the engine runtime dependency graph. Run these commands from `evaluations/hubs-spoke` in the engine repository:

```sh
node scripts/bootstrap.mjs
npm run setup
npm run build:hubs
npm run preflight:compose
npm run install:browser
npm run evaluate:spoke
npm test
npm run verify:evidence
```

`bootstrap.mjs` runs `npm ci --ignore-scripts` through a minimal child environment and an isolated npm configuration/cache. `setup` fetches the exact public commits, applies the recorded Spoke patch, checks the expected source and lockfile digests, then installs the upstream dependencies with lifecycle scripts disabled. It never resets an existing checkout. Unexpected dotenv/npm/Yarn configuration is rejected; use a clean checkout if verification reports unexpected changes. `setup hubs`, `setup spoke`, or `setup compose` limits the operation to one source, for example `npm run setup -- spoke`.

`install:browser` installs Playwright's Chromium into the ignored artifact cache. When an approved local browser is already available, set `CHROME_EXECUTABLE` instead and omit that command. A download outage is a blocked setup condition, not a reason to substitute simulated browser evidence. Linux with Node 24.19.0 and Chrome 151.0.7922.34 was exercised here; no other OS/browser is qualified by these captures.

The initial evaluation's Hubs/Spoke dependency trees were reused for the retained fresh build/browser runs. The private toolkit was installed from its new lockfile. A fresh clone plus full upstream dependency-install replay on another machine has **not** been observed; the commands and transport patch are supplied for that replay. Install time and availability depend on the upstream Git/codeload/registry endpoints, including a large historical Three.js archive.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `F03_FIXTURE_ROOT` | `../../packages/qualification-fixtures/fixtures` | The shared, unchanged F03 fixture set. |
| `EVAL_WORKDIR` | `./artifacts` | Sources, caches, browser downloads, temporary files and unique run directories. |
| `EVAL_HUBS_SOURCE` | `artifacts/sources/hubs` | Existing pinned Hubs checkout, or setup destination. |
| `EVAL_SPOKE_SOURCE` | `artifacts/sources/spoke` | Existing pinned and exactly patched Spoke checkout, or setup destination. |
| `EVAL_COMPOSE_SOURCE` | `artifacts/sources/compose` | Existing pinned Compose checkout, or setup destination. |
| `CHROME_EXECUTABLE` | Playwright-installed Chromium | Explicit browser executable for the real browser run. |
| `EVAL_PORT` | `9090` | Unoccupied loopback HTTPS port; change it when another local evaluation uses 9090. |
| `EVAL_SOFTWARE_RENDERING` | `1` | Request SwiftShader. Set `0` to omit software-rendering flags; the observed renderer is still recorded. |

All paths can be absolute. Relative overrides resolve from the command's working directory. The runner refuses an occupied port, serves a unique project name, verifies the served bytes, and creates a new `artifacts/runs/run-*` directory every time. Existing results cannot be mistaken for a new run. A failed command or browser check writes a failed result and returns a nonzero exit code. The deliberately blocked Compose preflight returns a `blocked` record without starting services.

The editor binds only to `127.0.0.1`. The browser blocks off-origin HTTP requests and service workers. Local self-signed HTTPS is allowed only for this evaluation server; outbound package/source downloads retain TLS verification. Child environments preserve named proxy/certificate settings needed by managed networks, but exclude provider credentials, GitHub/npm credentials, inherited Node flags and user npm configuration. HOME/USERPROFILE are neither read nor repurposed; npm/Git configurations, caches and browser profiles use explicit paths. Do not add application/provider secrets to these tools.

## Frozen inputs and the native project wrapper

`fixture-pins.json` copies F03's comparison manifest. Before each run, the tool checks all seven referenced canonical JSON digests plus the comparison manifest and all 11 resource byte digests. It copies only those 19 verified files into the ignored run's temporary serving directory. No duplicated F03 assets are committed here.

The wrapper is intentionally a **Spoke-native subset**, not an implementation of the general engine schema. `scripts/fixtures.mjs` maps the fixed, known fixture into a native `.spoke` project. The recorded adaptation describes unsupported semantics. In particular, static collider editing is not dynamic-body simulation, native `maxDistance` is not the engine's explicit fade-to-silence envelope, clip presence is not NPC route playback, and the editor camera is not the runtime's locomotion scenario.

Wrapper version 2 corrects two issues in the first local capture:

1. A model's box collision proxy is now its child, with identity local position/rotation, so numeric prop edits move the collision proxy too.
2. Spoke's native video object scales its own plane by the video aspect ratio. The wrapper compensates for that internal scale so F03's unit-quad dimensions remain 5.333333 by 3 meters.

The first capture remains byte-for-byte in `evidence/2026-10-17-initial`. Its field-edit and native export observations remain valid, but it does not prove these corrected mappings. The corrected browser run is retained separately under `evidence/2026-10-17-portable`. A failed intermediate selector attempt is retained too: Tab changed a focused numeric field's displayed `0.60` to `0.6`. The final runner selects the actual Position group instead of a changing field value.

The exported GLB is inspected for its envelope, embedded geometry, skin and clips. **It has not been reimported into Hubs.** Native media references retain local URLs, so the output is not a self-contained published asset package. Complete portable asset rewriting, canonical semantic roundtrip, permissions, revision transactions and Hubs runtime ingestion remain future qualification work.

## Source adaptation and licenses

Full repository URLs, commits and original/patched file hashes are in `source-pins.json`. The exact reviewable patch is `patches/spoke-node24-and-downloads.patch`.

- Spoke's historical Three.js Git dependency is downloaded as a codeload archive for the same exact commit. The original transport could not resolve that historical object through advertised Git refs. The archive SHA-256 and SHA-512 integrity are retained.
- Yarn registry tarball URLs are changed to the npm registry while preserving the common locked package versions and integrity hashes.
- Direct webpack is changed from 4.39.3 to exactly 4.47.0 to run on Node 24 without the obsolete MD4 hashing failure. Its required dependency entries are included in the patch.

These are bounded reproducibility adaptations. They do not establish that either upstream dependency tree is secure or current. The original 2026-10-17 Hubs audit timed out with invalid/missing registry JSON. A separate [2026-10-18 source-lock audit](../../docs/evidence/f04-upstream-audit-2026-10-18/receipt.json) obtained a valid failing report: 106 npm package/metavulnerability entries, including 14 critical and 64 high. The original timeout capture remains unchanged. The modern toolkit graph and the legacy upstream graph are separate audit scopes.

Unmodified upstream license texts are under `licenses/`. Hubs and Compose use MPL-2.0; Spoke includes MPL-2.0 and MIT notices for editor-derived portions. The private toolkit uses Playwright (Apache-2.0) and Yarn (BSD-2-Clause); source and lockfile retain those identities. This evaluation is not a completed transitive-license or legal review, and does not change the engine repository's license. Preserve notices and review file-level source obligations when distributing a chosen fork.

## Evidence interpretation

`npm run verify:evidence` checks the committed artifact hashes and recorded bounds. It does not run hardware or turn a past observation into a new test. The original capture index and bytes are unchanged. A fixed five-file source-snapshot map preserves the original README/assessment/security/package/verifier fingerprints while explicitly reporting current-source differences; actual captured editor/build/audit files still resolve at their original paths. A verified historical capture is not a rerun of the current source.

`npm test` requires the original nine editor checks, 20 Python runtime methods, two Node browser-policy methods and four historical-integrity methods. These exercise fixture identity, tamper rejection, transform conventions, collider/video mapping, environment filtering, failed subprocess handling, exact patch reproduction, GLB bounds and diagnostic failure rules. They are different from a fresh browser run. The real watchdog-process regressions and native two-client runtime harness are required separately in the manual hosted workflow.

Neither the original nor portable editor run supplies physical-headset evidence, audio listening evidence, frame-time percentiles, event-scale capacity, server authorization, multiuser ownership, reconnect convergence, avatar tracking/IK, or full world export/import fidelity. `REUSE_ASSESSMENT.md` lists the qualification work needed before F06 can choose this foundation. `SECURITY_REVIEW.md` records the scoped assistant self review; it is not independent human approval.
