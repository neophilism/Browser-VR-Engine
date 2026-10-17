# VRSpace released-service evaluation

This isolated evaluation runs the **actual VRSpace v0.8.7 executable server and its matching, unmodified browser client** on loopback. Two independent Playwright browser contexts load the frozen F03 courtyard through the sibling Babylon evaluation, enter one server realm, exchange real pose messages, and exercise disconnect/reconnect. The final v3 run on 2026-10-17 passed **9/9 real service checks**, with zero final browser errors, probe errors, failed or blocked browser requests, and cleanup failures. The optimized-Python regression suite passed **14/14 checks**, and the deterministic finalization suite passed **15/15 cases**. All three reports match the same 20 declared source files.

**Qualification remains incomplete.** This is bounded presence/pose evidence, not acceptance of F05, production authentication, server authority, conference media, physical XR, or conference capacity. The earlier F05 AssetLoader test uses master commit `61f840a3dd0133fc9d357891f37eb1670b147539`; that master server was not built or exercised here.

## Prerequisites

- Java 17. The observed runtime was OpenJDK `17.0.20+8-1-24.04`; the released server classes target major version 61. This runner deliberately checks for Java 17.
- Linux with `/proc` mounted for the same PID namespace as the runner, and kernel process-descriptor support (`pidfd_open` and `pidfd_send_signal` exposed by Python). The process observer and stop helper deliberately require this platform; cross-platform process control is not implemented.
- Node 24 and Python 3.11 or newer; `curl` with normal TLS validation for the public release download. The recorded environment used Node 24.19.0, npm 11.9.0 and Python 3.12.14.
- The generated repository F03 fixture set and an already-built sibling `evaluations/babylon-vrspace` evaluation. Follow that evaluation's installation/build instructions first. This package reuses its verified rendering bundle; it does not copy F03 assets.
- This package's exact Playwright 1.62.1 lockfile. Supply `CHROME_EXECUTABLE` for an installed Chromium, or have the matching Playwright browser already installed. The recorded run used Chrome headless shell 151.0.7922.34 with SwiftShader, at a 1280×800 viewport and hardware scaling 2. No physical GPU or headset was present.
- Approximately 228 MB for the executable JAR, plus scratch database and browser artifacts. No Maven, Docker, external database, OpenVidu, AI provider, OAuth account, or cloud service is required for this test.

## Reproduce

Run the following from `evaluations/vrspace-service`. The Python launcher builds a subprocess environment from an explicit allowlist, uses task-local temporary files and explicit empty npm configuration files, and does not override `HOME` or `USERPROFILE`. It never forwards provider or repository credentials. `run-clean.py` replaces its own process with the requested command, preserving the signal target instead of leaving an intermediate wrapper. The JVM also builds this environment itself if launched directly.

```bash
python3 run-clean.py npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/
python3 run-clean.py python3 -B -O setup.py
python3 run-clean.py python3 -B -O server-run.py
```

Leave the server runner in that terminal. It verifies the official binary digest and pinned sterile profile, creates a fresh database directory, and records its exact command, Java version, configuration, process ID and process creation identity under `artifacts/server-*`. These checks remain active with Python `-O`. Startup took about 10–15 seconds here. The server health endpoint is `http://127.0.0.1:18180/actuator/health`.

In another terminal, from the same directory:

```bash
python3 run-clean.py node browser-checks.mjs
python3 run-clean.py python3 -B -O observe-server.py
python3 run-clean.py python3 -B -O stop-server.py
```

`browser-checks.mjs` starts and closes its own frontend and browser contexts. Its production finalizer waits for page disposal, browser/frontend closure and metadata reads before deciding status. A pass requires all nine checks and zero final browser/probe errors, failed or blocked requests, cleanup failures and fatal observations. Page disposal failures are recorded instead of being swallowed. The finalizer sets a nonzero exit code for any failure and writes detailed wire observations and screenshots to a new `artifacts/browser-runs/run-*` directory. The existing nine-check counts and stdout shape are unchanged; final error totals appear separately under `finalization`. `stop-server.py` first pins a kernel process handle and verifies the exact JAR argument, task-specific configuration and creation identity recorded by this run. It sends SIGTERM, waits at most 20 seconds, then escalates to SIGKILL with a further five-second deadline. A stale record cannot redirect a signal to a reused PID. Normal Java shutdown after SIGTERM was recorded with exit code 143.

The launcher owns cleanup immediately after `Popen`. Its SIGINT/SIGTERM handlers request bounded shutdown instead of interrupting cleanup, and a subsequent metadata-write failure still terminates and reaps that child. Run the focused regression suite separately:

```bash
python3 run-clean.py python3 -O test/launcher-checks.py
python3 run-clean.py node test/finalization-checks.mjs
```

This suite exercises corrupted binaries/profile/client data, mismatched process ownership, malformed records, stale creation identity, mismatched procfs identity, a child that ignores SIGTERM, a failure writing metadata after child creation, and frontend failures after opening a real loopback listener. Its synthetic Java executable tests process lifecycle only. It never substitutes for the actual released server and the nine browser service checks. The real hanging-child probe deliberately exercises the production 20-second termination deadline. The observer's negative socket tests use synthetic snapshots and do not open a non-loopback listener. The namespace-mismatch probe changes only a synthetic reported identity; it does not alter namespace controls.

The separate finalization suite runs the production finalizer in child Node processes. Its 15 deterministic cases inject late console/page/socket errors, failed or blocked requests, final probe errors, cleanup rejections and an observation during metadata collection; they also retain the existing fatal/incomplete/failed-check gates. Each case checks the written result and actual process exit code, and confirms that other cleanup callbacks still settle. These callbacks are status/lifecycle test doubles only; no synthetic server or browser is counted as real service evidence.

Environment overrides are optional:

| Variable | Default / purpose |
| --- | --- |
| `F03_FIXTURE_ROOT` | `../../packages/qualification-fixtures/fixtures`, relative to this package |
| `F05_EVALUATION_ROOT` | `../babylon-vrspace`, relative to this package |
| `CHROME_EXECUTABLE` | Omit to use Playwright's installed browser; otherwise supply an existing executable |

These override paths configure the harness only. They do not enter the world descriptor. No workspace-specific executable or source paths are hardcoded in the runnable files. Historical evidence retains the paths actually observed in its isolated run.

## Process and network boundaries

The HTTP server binds `127.0.0.1:18180`; embedded Neo4j Bolt binds `127.0.0.1:17687`. The frontend binds `127.0.0.1:4176`; its private fixture backend chooses an ephemeral loopback port. The server allows the exact frontend origin. Process socket snapshots verified that the JVM's listeners and observed established connections were local. This is a snapshot, not a complete historical egress audit.

The runner sets `-Xms128m`, `-Xmx768m`, `-XX:MaxDirectMemorySize=256m`, `-XX:MaxMetaspaceSize=256m`, `-XX:ActiveProcessorCount=2`, and Neo4j's verified `-Ddbms.pagecache.memory.default.override=128m`. It includes the Java module opens required by the upstream run script. These component limits are not a total RSS cap. The v3 run's post-browser snapshot recorded JVM RSS of 628,908 KiB, about 614.2 MiB; no memory-capacity or stability threshold is claimed. That snapshot was taken after both browser contexts closed, before JVM shutdown, and is not a concurrent-client socket census.

The pinned profile replaces the bundled Spring configuration completely. OAuth/default web authentication, OpenVidu, Ollama/AI/vector-store configuration and Elasticsearch auto-clients are disabled. No bots or external event sinks are configured. Guest sessions are allowed only for this local evaluation, with a maximum of four sessions. API docs and general actuator endpoints are disabled; health remains available. This profile must not be presented as production authentication or authorization.

The frontend relays only its frozen resource allowlist, including the exact `/dist/audio-meter.js` worklet added by the corrected sibling renderer. It rejects unknown files, configuration paths, and an encoded `//` destination with 404 before making any upstream request. Browser request routing and CSP limit application traffic to the local fixture frontend and the one local service WebSocket.

## What the observed checks establish

| Check | Evidence |
| --- | --- |
| Independent sessions | Distinct server-assigned guest IDs in separate cookie contexts; real Enter and Session commands and acknowledgements |
| Shared requested realm | Server log records creation of the unique requested realm; both Enter acknowledgements succeed; each user receives the other through Add events |
| Same venue | Both real canvases load the same frozen F03 hashes, 55 world entities, WebGL 2 and right-handed coordinates |
| Pose updates | Keyboard input moves the local physics player; the other page's visible capsule follows positions received from the server in both directions |
| Departure | Disconnect produces a server Remove event and removes the peer visual |
| Manual rejoin | The same browser opens a new real session, re-enters the realm, and restores pose flow |
| SDK retry | The unmodified client's retry timer reconnects a deliberately closed native WebSocket; the adapter re-enters and starts the session |
| Wire and errors | Real sent/received frames are recorded; both pages receive Add and pose events; zero browser, SDK, request or socket errors |
| Resource boundary | Three unknown/escape-style resource requests receive 404 |

The release's Welcome response does not expose `worldId`. The test therefore correlates the acknowledged Enter request, actual server world creation and mutual presence, rather than asserting a field absent from this protocol.

**Guest IDs changed after both reconnects.** The SDK restores the socket; `network.js` explicitly repeats Enter/Session, republishes current local pose, and reconstructs remote visuals. Durable account identity and resuming authorized room membership need an engine-level identity/session contract. The latest observed automatic-close/reconnect check took 6,847 ms including re-entry and the subsequent pose check; this is not a reconnect SLO.

The F03 assets and colliders are loaded locally by both clients. The server realm carries guest presence and poses; this test does not upload the F03 world descriptor to a durable world service. Remote capsules are presentation visuals, not networked rigid bodies. The retained local physics, media, editor and import controls are inherited from the sibling evaluation and are not shared through this service adapter.

## Evidence and remaining work

`evidence/2026-10-17-finalization-v3/` contains the current 15-case finalization regression, 14-check optimized regression, nine-check browser report, screenshots, setup verification, exact server run record, post-browser socket snapshot, stop result and summary. The browser run was 23:01:06.026–23:01:32.229 UTC on 2026-10-17, with all final error counters zero after cleanup settled. The browser run used the verified main F05 build with 11 inputs and three outputs. Both screenshots were visually inspected. The JVM exited with code 143 after SIGTERM, with no forced kill; the log records zero remaining sessions and completed database shutdown.

`evidence/2026-10-17-portable/` preserves the earlier portable run unchanged. `evidence/2026-10-17-hardened/` retains the earlier 12-check regression snapshot before the two final ownership-record/namespace checks. These are historical evidence. `evidence/2026-10-17-hardened-final/` preserves the preceding v2 run and all its files unchanged; its observed errors were zero, but its runner did not independently gate late observations after the last check. The corrected v3 revision uses `source-files.json` as the common list hashed by all three current suites. New runs create new artifact directories; they do not overwrite retained evidence. `evidence/release/` contains executable dependency inventory and embedded build/license metadata.

The first v3 finalization attempt on the restricted process surface supplied no child stdout, even for a separate trivial output diagnostic, and was rejected by the verifier. The same final source passed on the approved process-capable surface; no namespace controls were changed. This environment limitation is not a passing regression result.

No fresh registry audit was invoked for this rerun; audit destination authorization is a separate pending gate. This manual run also does not qualify the separately prepared automation supervisor: its additional `/proc/<pid>/task/<pid>/children` prerequisite was unavailable in this runtime. Neither limitation is converted into a hosted CI or full F05 acceptance claim.

Still unverified: authenticated roles and authorization; malformed or unauthorized client updates; server-authoritative movement/physics, shared editing and ownership; durable world state and source originals; SFU/spatial voice/video sharing; simultaneous audible playback across clients; WAN failure, server restart and loss recovery; physical headset/controller/locomotion/recenter/audio behavior; multi-device graphics performance; conference load and capacity; long-running resource cleanup. The F05 master server and full-stack compatibility remain separate candidates for later work.

The initial diagnostic run found that an unused Elasticsearch auto-health client made the otherwise working service report DOWN; the final profile excludes that integration, and health was HTTP 200. An early browser assertion expected the absent `worldId` field; the final protocol-aware assertion and portable rerun passed. These were harness/configuration corrections, not changes to the upstream server or client.

## Source and license provenance

See `source-pins.json` and `PROVENANCE.md`. The JAR is fetched only from the exact official release URL and verified before execution. This overlay contains no JAR, browser binary, dependency directory, source checkout or database, and adds no CI workflow. The VRSpace repository/client is Apache-2.0; the executable also bundles components under other licenses, including Neo4j GPLv3. This evaluation does not establish the complete server redistribution obligations.
