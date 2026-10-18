# F04 real Hubs runtime diagnostic

**Prepared implementation; backend execution is blocked in the current workspace.** Docker and the required same-namespace procfs task/children interface are unavailable here. The pure checks and exact-file source-adaptation rehearsal are recorded separately from the existing Spoke editor evidence. A separate [manual Ubuntu replay](HOSTED_REPLAY.md) provides the compatible hosted path after this change is reviewed and merged to main. It does not add a required runtime job, select F06 or complete F04.

The command is designed to run real Hubs, Reticulum, Dialog and PostgreSQL on a compatible Linux host, open two independent browser contexts, create a real room, enter through the native desktop UI, observe native presence and avatar motion, check actual Dialog audio transport/packet counters, close a client and rejoin in the same browser context. The browser harness has not been executed against this new container profile. Its assertions are candidate checks until that replay succeeds.

## Reproduction

Use a dedicated Linux x86_64 development/CI VM with a local Docker daemon at `/var/run/docker.sock`, Docker Compose v2 supporting `up --wait`, Node 24, npm, Python 3.11.8 or later, Git and OpenSSL. The reviewed child-process owner requires `pidfd_open`, `pidfd_send_signal`, and `/proc/<pid>/task/<pid>/children` in the current PID namespace. Docker must already be provisioned; this tool does not install or expose a daemon. Use an otherwise idle host with at least 8 GiB RAM and sufficient image/build disk space. Host tool versions are retained in command logs; they are not hardware/performance qualification.

From the repository root:

```sh
node evaluations/hubs-spoke/scripts/bootstrap.mjs
node evaluations/hubs-spoke/scripts/install-browser.mjs
python3 -B -O evaluations/hubs-spoke/runtime/run.py preflight
python3 -B -O evaluations/hubs-spoke/runtime/run.py diagnose
```

The browser-install command uses the existing pinned Playwright 1.62.1 toolkit and its ignored `evaluations/hubs-spoke/artifacts/browsers` cache. A bare Ubuntu host may need Playwright's documented OS dependencies installed by its operator first. The diagnostic launcher installs the toolkit from its lockfile after auditing it, but does not install system/browser packages. The manual hosted wrapper installs that same pinned browser with OS dependencies and forbids custom executable/fixture overrides. For a local diagnostic with an already verified executable, set `CHROME_EXECUTABLE` explicitly. `evaluate` rejects this override and uses the pinned Playwright browser. The only fixture override is `F03_FIXTURE_ROOT`; every original file must still match the frozen byte hashes and comparison manifest.

The acceptance-oriented automated subset uses:

```sh
python3 -B -O evaluations/hubs-spoke/runtime/run.py evaluate
```

Both modes obtain fresh, real `npm audit --package-lock-only --ignore-scripts --json --audit-level=high` reports for the modern toolkit, pinned Hubs root lock and pinned Dialog lock. Locked public package names/versions are sent to `registry.npmjs.org` under the owner's 2026-10-18 authorization. Source hashes are checked before/after; installs never run `audit fix` or update the lockfiles.

| Mode | A valid high/critical audit failure | Invalid/missing audit or process failure | Final status |
| --- | --- | --- | --- |
| `evaluate` | Stops before images are built or services started. | Stops. | Fails. |
| `diagnose` | Retains the failing report and may continue with isolated synthetic observations. | Stops. | Fails whenever any mandatory audit fails, even if every browser check passes. |
| `preflight` | Does not query registries or start the stack. | Records unavailable prerequisites. | Reports prerequisite success/failure only. |

There is no skip-audit flag, waiver, changed required engine gate, or production deployment path. A successful automated subset still records `qualification: incomplete`: hardware XR, full F03 physics/media/authoring semantics, scale, WAN/TURN, dependency remediation and production authorization remain separate required evidence.

## Inputs and bounded adaptations

`pins.json` fixes all source commits, patch-sensitive source-file hashes, four Linux amd64 image manifests, the Hex/Rebar build bootstraps, four Python wheels needed by mediasoup's native build, the retained Spoke export and the eight raw F03 metadata hashes. Upstream Git subdependencies retain their full commits in the original npm/Mix locks. Images are pulled by digest; observed tags are provenance labels only. Public image manifests and bootstrap bytes were resolved and hash-checked on 2026-10-18 without running an image.

| Input | Exact source | Role |
| --- | --- | --- |
| [Hubs](https://github.com/Hubs-Foundation/hubs/tree/986d07a758e9d1184cb355385c6460391bd238d0) | `986d07a758e9d1184cb355385c6460391bd238d0` | Real browser client and bundled default avatar. |
| [Reticulum](https://github.com/Hubs-Foundation/reticulum/tree/10364b17b50a6801ebceaf760188182e753860ec) | `10364b17b50a6801ebceaf760188182e753860ec` | Real room API, Phoenix state/presence, storage and locked startup migrations. |
| [Dialog](https://github.com/Hubs-Foundation/dialog/tree/9da31c58c35fd9047ff9c52a426a230769c1a1e0) | `9da31c58c35fd9047ff9c52a426a230769c1a1e0` | Real protoo/mediasoup service and native worker. |
| [Hubs Compose](https://github.com/Hubs-Foundation/hubs-compose/tree/54cc996394e715d32aa71c9cf9df4898b1ea1a57) | `54cc996394e715d32aa71c9cf9df4898b1ea1a57` | Retained development wiring/reference; its original `bin/init` is never invoked. |

The launcher checks out fresh exact sources, exports tracked files into fresh build contexts, verifies hashes, and records unified diffs for the following configuration changes:

- **Hubs:** its native ICE-server function returns no external STUN/TURN servers and accepts only the owned `hubs.local:4443` endpoint. Native signaling, media and avatar implementation remain in use. This observation cannot establish NAT/TURN behavior.
- **Dialog:** one real worker and one loopback-announced ICE address replace host-CPU-count allocation and the upstream duplicated listen-IP entries. Its internal container listener remains routable on the private bridge; every published host port is bound to `127.0.0.1`.
- **Reticulum:** compile-time hot reload is disabled for immutable sources. A diagnostic runtime profile uses per-run TLS/RSA/session signing material and the isolated database password. The native application performs its own `ret0` schema/lock/migration sequence. Admin/Spoke aggregate page warming is disabled; development pages are fetched from the real Hubs client on demand.
- **Build transport:** GitHub SSH URLs in the unchanged Hubs lock use an explicit HTTPS Git transport mapping for the same repositories/commits. No SSH agent, user Git config or credentials are inherited.
- **Build tooling:** immutable Docker contexts replace Mutagen hot-sync volumes. The Reticulum image uses the pinned official Elixir 1.16.3/OTP-25 image with build tools, instead of the Compose Alpine development base. Hex 2.2.1 and Rebar 3.23.0 are byte-pinned. Dialog installs pinned pip/setuptools/Meson/Ninja wheels offline into mediasoup's expected directory, then executes the actual native rebuild. Upstream Meson `.wrap` downloads keep their content hashes. There are no floating OS package-install commands.

These backend commits and the alternate Elixir image have **not** been demonstrated compatible together. Build, native-module, TLS, migration, browser/UI or scene-inflation failures in the first compatible replay are real blockers to record and resolve, not evidence of a functioning stack.

## Scene and browser method

The input scene is the immutable `evidence/2026-10-17-portable/spoke-courtyard-export.glb`, which was actually exported by Spoke. It represents the F03 editor scenario after the prop edit to `[2,1,2]`. A generated copy rewrites its six media URLs to the run-specific local asset path. Geometry buffers, skin, animations and other authored content remain unchanged. The template spawn overlaps that edited prop, so the generated copy places the native spawn at floor level below the frozen `walk-through-arch` checkpoint; that adaptation is recorded explicitly. No F03 source, workload, device, scenario or threshold file is edited.

Hubs serves the verified F03 assets and the derived native export from its normal development static directory. The browser records actual canvas frames and named imported objects, native session IDs and peer presence, keyboard-driven local/remote avatar poses, and real incoming RTP packet counters. It uses Chromium's simulated microphone through Hubs' real media manager. It does not measure physical microphones, spatial-audio correctness, animation playback, full physics/collision fidelity, canonical export semantics or headset input.

The native room API and native desktop Join Room / Avatar Setup / Enter Room controls are used. API results exclude creator/embed tokens from retained browser evidence. Browser HTTP/WebSocket routes allow only the declared local origins, service workers are blocked, and no external STUN/TURN server is configured. The two contexts have separate storage; the rejoin reuses the first context after closing its original page.

## Ownership, limits and evidence

The command copies the reviewed sibling `evaluations/vrspace-service/automate.py` process runner and `command-supervisor.py` into a new verified per-run directory, then executes those copies with exact source-hash binding. It does not duplicate their Linux descendant/pidfd logic. A missing or changed original/copy invalidates final evidence. Each stage, including bootstrap downloads and complete HTTPS readiness, has a deadline and a 16 MiB log cap under one 45 minute overall work deadline. Teardown is attempted after work timeout or signals.

Each run owns a unique Compose project, images, network and volumes. Runtime services use an internal network, finite memory/CPU/PID limits, no host network/PID namespace or Docker-socket mount, and no automatic restart. PostgreSQL has no host port. Hubs uses loopback 8080, Reticulum loopback 4000, and Dialog loopback 4443 plus 40000–40050 TCP/UDP. This development stack has broad native local capabilities and known dependency problems; it is scoped to synthetic data on the dedicated diagnostic host.

Before teardown, container/network/volume ownership labels are checked. Failure to collect logs does not skip Compose shutdown. The tool verifies removal of its containers, network, volumes and derived images. Shared base-image caches are retained. Failed ownership/shutdown is fatal and recorded with the project ID; no unrelated process/container or global Docker cache is pruned. If ownership cannot be established, automatic destructive cleanup is refused and the result remains failed for operator investigation.

The printed `artifacts/runtime-runs/f04-*/collection` directory is the review/upload output. It contains allowlisted small JSON/log/PNG files and their manifest hashes. Per-run keys, databases, source checkouts, image layers, node_modules and browser binaries are outside it. The collector rejects private-key markers, ephemeral JWT grants, symlinks, unknown files and oversized artifacts; generated keys are removed after verified shutdown. Application/provider/GitHub/npm credentials are excluded from build contexts and child environments; only named proxy/certificate settings are preserved for downloads, and proxy credentials are rejected. Project npm/yarn configuration in the package or its ancestors and a symlinked node_modules directory are rejected before audits/install. HOME and USERPROFILE are not repurposed. A partially failed startup records `runtimeStartAttempted: true` and `runtimeExecuted: null` until actual execution is established; it does not claim that nothing ran.

Current retained Hubs security evidence is the [2026-10-18 upstream audit](../../../docs/evidence/f04-upstream-audit-2026-10-18/receipt.json): 106 npm package/metavulnerability entries (14 critical, 64 high, 25 moderate, 3 low), with 134 distinct advisory URLs in expanded `via` entries. This is a known failed graph, distinct from the modern toolkit's audit. Every runtime attempt must obtain its own current report. Npm reports do not cover Reticulum Hex dependencies, the bootstrap Python packages, OS packages, native source/binaries or complete transitive-license obligations; those remain explicit qualification work.

## Local validation and next replay

```sh
python3 -B -O evaluations/hubs-spoke/runtime/test/runtime-checks.py
node --test --test-isolation=none evaluations/hubs-spoke/runtime/test/browser-policy.test.mjs
```

The original [preparation receipt](evidence/2026-10-18-preparation/receipt.json) records 20 passing Python methods, two passing Node methods, exact-file source-adaptation rehearsal, and the actual blocked local preflight. Its bytes and original source fingerprints remain unchanged; it predates the hosted wrapper and extracted watchdog. These tests exercise immutable fixture identity, GLB buffer/clip preservation, archive traversal/link rejection, loopback/ownership policy, audit contradictions, late browser/cleanup failures, deadline limits, helper-copy tampering and environment/artifact boundaries. The download test uses a synthetic in-memory response to verify hash/no-overwrite behavior; it is not a successful network or service test.

The [hosted preparation receipt](evidence/2026-10-18-hosted-preparation/receipt.json) binds the current local pure tests and workflow/evidence checks to their actual files. The normal F04 toolkit test stage now requires the original nine editor checks, 20 Python runtime methods, two browser-policy methods and four historical-integrity methods. Separate root tests exercise the exact dispatch policy and contradictory synthetic failure artifacts; those synthetic envelopes are verifier tests, not backend observations. The two new actual watchdog process methods must run without skips on the manual Ubuntu job and have not been executed in this workspace.

The next bounded step is one clean Ubuntu dispatch of `diagnose`, retaining the failed audit alongside the actual build/service/browser outcomes and independent cleanup receipt. Its workflow must fail if an audit fails. A later full-fork authoring/deployment evaluation also needs real Spoke/Admin/PostgREST publication/auth flows. This initial four-service probe leaves those capabilities unverified. The existing engine required workflow and the F06 decision remain unchanged.
