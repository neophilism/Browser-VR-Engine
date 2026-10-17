# Released VRSpace service evaluation

This is a separately reviewable follow-up to the foundation comparison at `64f095d6b65530ca57a97de26f7929593032a51d`. It adds a local service evaluation; it does not accept F05 or select F06. The [runnable package](../../evaluations/vrspace-service/README.md) and [evidence index](../../evaluations/vrspace-service/evidence/index.json) contain the reproduction instructions, exact source identities and observed reports.

## What was exercised

The official VRSpace v0.8.7 executable and matching unmodified browser client are pinned to release commit `ca0e02ce611e1435e87dcec79de05fd2970dfc2d`. The executable's verified SHA-256 is `e5f0ba53f492d07e0f978ae1e15afce9fed2b3632a2d5984c48f3ab27d8004b3`. This is a different upstream revision from the master AssetLoader used by the sibling F05 renderer. [Provenance](../../evaluations/vrspace-service/PROVENANCE.md) records the distinction and the executable's bundled dependency/license inventory.

Two independent Chromium browser contexts loaded the frozen F03 courtyard through the existing Babylon/Rapier renderer and joined one newly created server realm. The nine actual browser checks exercised independent guest sessions, the same loaded venue, visible mutual presence, keyboard-driven pose updates in both directions, departure, manual rejoin, the upstream SDK's reconnect timer with adapter re-entry, and protocol/resource/error observations. The server carried real guest presence and pose messages. Screenshots show the rendered courtyard and labeled remote capsules.

Guest identifiers change after reconnect. The adapter explicitly repeats Enter/Session and rebuilds the peer visuals. This does not establish durable account identity or authorized room resumption. Venue assets, props, physics, editing and media controls remain local to each client; remote capsules are presentation visuals, not authoritative networked rigid bodies.

## Current-source evidence and corrections

The evidence index identifies the latest corrected manual run and the earlier immutable reports. The corrected revision has 20 declared source files, including the shared finalizer and its regression suite. Its optimized launcher report and 15-case deterministic finalization report fingerprint that same inventory; the actual browser report also binds the service source and sibling build. The sibling build manifest is `39c91153603c4c0ae64b90b27ea19721ed672a04e7fe64d6fd273f67bc87e5b4`, with 11 inputs and three outputs, including the paired AudioWorklet meter. Historical reports remain tied to the code they exercised.

The corrected actual browser run passed **nine of nine checks** from `2026-10-17T23:01:06.026Z` to `2026-10-17T23:01:32.229Z`. Its finalization records zero browser errors, client-probe errors, failed/blocked requests and cleanup errors after closure settled. All **14 optimized launcher checks** and **15 deterministic finalization cases** also passed against those 20 source files. The owned JVM exited with code 143 after verified SIGTERM and did not require a forced kill. These are actual local observations, not hosted acceptance or a completed automation result.

Launcher regressions cover binary/client/profile integrity, optimized Python checks, process ownership and creation identity, malformed metadata, mismatched procfs identity, ignored TERM, metadata-write failure after child creation, bounded shutdown/reaping, and frontend failure cleanup. These process probes are synthetic; they are separate from the actual Java/server/browser run.

Final review found that a browser error or failed request arriving after the ninth check could be retained while the browser runner still reported success. The correction recomputes final error/request/cleanup state after closure and makes the final status and exit code fail. Focused adversarial cases cover these late failures. The previous retained real run contained no late errors, but is kept as historical rather than used to qualify the corrected runner.

The service binds only to loopback in this evaluation, with optional OAuth, media, AI and Elasticsearch integrations disabled. Actual post-browser process/socket snapshots and owned shutdown records are retained. A socket snapshot is an observation at one time, not an historical egress audit. Java component memory settings are not a total RSS limit, and the observed footprint is not a conference capacity result.

## Automation remains a proposal

The separate [automation entry point](../../evaluations/vrspace-service/AUTOMATION.md) supervises command stages, verifies inputs/reports, and is intended to install/audit the separate service toolkit, start the pinned server, run the browser checks and shut down owned processes. It has not completed that full sequence.

Seven selected verifier methods pass under optimized Python, including contradictory success reports, source/output identity, screenshot integrity, audit-result handling and path containment. A subsequent review added independent rejection of cleanup errors and malformed fatal/cleanup observations; the final integrated receipt records its own source hashes. These audit-result tests use synthetic data and make no registry request.

Two real supervisor lifecycle methods remain blocked by unavailable Linux process prerequisites on the available execution surfaces: procfs must describe the current PID namespace and expose `/proc/<pid>/task/<pid>/children`, with pidfd and child-subreaper support. The new supervisor rejects unsupported environments before starting a command. Passing the earlier service launcher tests does not qualify this additional supervisor.

The existing required evaluation CI job covers the F04 and F05 toolkits only. It does not install or audit this third service dependency graph and does not exercise this new automation. A complete process-suite run, fresh service audit, full automation run, and required current-candidate service CI evidence are still required before merging this follow-up. No workflow has been added to imply that these gates already exist or passed.

## Remaining acceptance

The [automatic audit-approval rejection](../security/evaluation-audit-egress.md) also applies here. Required audits remain intact, and no audit or PR-triggered workflow was used to work around the rejection. No generation credential is needed for this gate.

F05 remains blocked on actual immersive-session implementation and headset/controller/audio evidence, complete shared-world ownership and physics, shared editing, durable state/identity, SFU/spatial voice/video sharing, measured media synchronization, WAN/restart recovery, target-device performance, conference workloads and sustained resource lifecycle evidence. XLR8 and all generated-NPC/funding implementation remain later work. There is no hosted-CI, merge, deployment or production qualification claim for this branch.
