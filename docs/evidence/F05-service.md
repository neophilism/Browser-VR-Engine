# Released VRSpace service evaluation

This is a separately reviewable follow-up to the foundation comparison at `64f095d6b65530ca57a97de26f7929593032a51d`. It adds a local service evaluation; it does not accept F05 or select F06. The [runnable package](../../evaluations/vrspace-service/README.md) and [evidence index](../../evaluations/vrspace-service/evidence/index.json) contain the reproduction instructions, exact source identities and observed reports.

## What was exercised

The official VRSpace v0.8.7 executable and matching unmodified browser client are pinned to release commit `ca0e02ce611e1435e87dcec79de05fd2970dfc2d`. The executable's verified SHA-256 is `e5f0ba53f492d07e0f978ae1e15afce9fed2b3632a2d5984c48f3ab27d8004b3`. This is a different upstream revision from the master AssetLoader used by the sibling F05 renderer. [Provenance](../../evaluations/vrspace-service/PROVENANCE.md) records the distinction and the executable's bundled dependency/license inventory.

Two independent Chromium browser contexts loaded the frozen F03 courtyard through the existing Babylon/Rapier renderer and joined one newly created server realm. The nine actual browser checks exercised independent guest sessions, the same loaded venue, visible mutual presence, keyboard-driven pose updates in both directions, departure, manual rejoin, the upstream SDK's reconnect timer with adapter re-entry, and protocol/resource/error observations. The server carried real guest presence and pose messages. Screenshots show the rendered courtyard and labeled remote capsules.

Guest identifiers change after reconnect. The adapter explicitly repeats Enter/Session and rebuilds the peer visuals. This does not establish durable account identity or authorized room resumption. Venue assets, props, physics, editing and media controls remain local to each client; remote capsules are presentation visuals, not authoritative networked rigid bodies.

## Historical manual evidence and corrections

The evidence index identifies the latest corrected manual run and the earlier immutable reports. That manual revision had 20 declared source files, including the shared finalizer and its regression suite. Its optimized launcher report and 15-case deterministic finalization report fingerprint that same inventory; the actual browser report also binds the service source and sibling build. The sibling build manifest is `39c91153603c4c0ae64b90b27ea19721ed672a04e7fe64d6fd273f67bc87e5b4`, with 11 inputs and three outputs, including the paired AudioWorklet meter. These unchanged reports remain tied to the code they exercised; the current CI revision expands the declared inventory to 24 sources, adding automation and its complete-suite reporter.

The corrected actual browser run passed **nine of nine checks** from `2026-10-17T23:01:06.026Z` to `2026-10-17T23:01:32.229Z`. Its finalization records zero browser errors, client-probe errors, failed/blocked requests and cleanup errors after closure settled. All **14 optimized launcher checks** and **15 deterministic finalization cases** also passed against those 20 source files. The owned JVM exited with code 143 after verified SIGTERM and did not require a forced kill. These are actual local observations, not hosted acceptance or a completed automation result.

Launcher regressions cover binary/client/profile integrity, optimized Python checks, process ownership and creation identity, malformed metadata, mismatched procfs identity, ignored TERM, metadata-write failure after child creation, bounded shutdown/reaping, and frontend failure cleanup. These process probes are synthetic; they are separate from the actual Java/server/browser run.

Final review found that a browser error or failed request arriving after the ninth check could be retained while the browser runner still reported success. The correction recomputes final error/request/cleanup state after closure and makes the final status and exit code fail. Focused adversarial cases cover these late failures. The previous retained real run contained no late errors, but is kept as historical rather than used to qualify the corrected runner.

The service binds only to loopback in this evaluation, with optional OAuth, media, AI and Elasticsearch integrations disabled. Actual post-browser process/socket snapshots and owned shutdown records are retained. A socket snapshot is an observation at one time, not an historical egress audit. Java component memory settings are not a total RSS limit, and the observed footprint is not a conference capacity result.

## Initial local automation evidence and hosted integration

The separate [automation entry point](../../evaluations/vrspace-service/AUTOMATION.md) supervises command stages, verifies inputs/reports, and is intended to install/audit the separate service toolkit, start the pinned server, run the browser checks and shut down owned processes. The initial local attempt did not complete that full sequence; the subsequent hosted result is recorded below.

Seven selected verifier methods pass under optimized Python, including contradictory success reports, source/output identity, screenshot integrity, audit-result handling and path containment. A subsequent review added independent rejection of cleanup errors and malformed fatal/cleanup observations; the final integrated receipt records its own source hashes. These audit-result tests use synthetic data and make no registry request.

Two real supervisor lifecycle methods were blocked locally by unavailable Linux process prerequisites: procfs must describe the current PID namespace and expose `/proc/<pid>/task/<pid>/children`, with pidfd and child-subreaper support. The new supervisor rejects unsupported environments before starting a command. Passing the earlier service launcher tests does not qualify this additional supervisor.

The existing evaluation job continues to cover the F04/F05 toolkits. A separate required `engine-service-evaluation` job now invokes the complete nine-method automation suite, 14 optimized launcher cases, 15 finalization cases, observed Node/Java/npm versions, a locked F05 build/browser setup and full service automation. The service's actual registry audit remains part of that full run. The aggregator fails unless all three jobs succeed; no path filter or skipped-method exception bypasses the service gate.

The outer receipt binds the clean tested commit/tree, PR head/base, workflow, run/attempt, implementation and lockfiles, frozen fixtures, all 12 current F05 build inputs and three outputs (the PR6 capture used its then-current 11-input build), the fresh inner automation directory, actual command ownership and final shutdown. Downloaded verification rechecks the current source and artifact bytes through `scripts/ci/verify-service-evidence.py`. The inner automation receipt continues to say `mode: local`, `ciAcceptance: false`, and `qualificationStatus: incomplete`; a verified hosted subset does not change engine qualification.

Current implementation verification includes seven new no-network Python evidence methods under `-O`, including complete synthetic inner/outer receipts and hostile mutations, and 67 targeted Node policy/aggregate/evidence tests. The actual complete-suite reporter preserved all nine original methods with **seven passed, two failed and zero skipped** because the four attempted synthetic supervisor launches lacked the Linux task-children interface before command creation. The [local receipt](../../evaluations/vrspace-service/evidence/service-ci-local-2026-10-18/summary.json) and full failed-method report retain this limitation. A local invocation of the new CI runner also stopped at that prerequisite; no dependency, audit, JVM or browser stage ran. These observations do not close the two real supervisor methods, service audit, full automation or hosted current-candidate gate. That local result remained a prerequisite failure; the later real hosted result does not rewrite it.

## Remaining acceptance

The owner explicitly authorized npm dependency-inventory audits to `registry.npmjs.org`, locally and in reviewed CI, on 2026-10-18. The earlier [automatic approval rejection](../security/evaluation-audit-egress.md) remains historical. Audits are still required, authorization is not a passing audit, and no generation credential is needed for this gate.

F05 remains blocked on physical headset/controller/audio evidence, complete shared-world ownership and physics, shared editing, durable state/identity, SFU/spatial voice/video sharing, measured media synchronization, WAN/restart recovery, target-device performance, conference workloads and sustained resource lifecycle evidence. XLR8 and all generated-NPC/funding implementation remain later work.

## Observed hosted result and subsequent main failure

PR6 head `8c0dd0eb01f5708fea9bbb03b23e043b040afbde` passed all four jobs in `39148921581`; all three downloaded artifacts passed independent verification from the exact tested merge `9fd972c0426973588f143fc5856cf5255ff2595b`. All nine automation methods, 14 launcher cases, 15 finalization cases, six real-service stages and nine two-browser checks ran, with clean owned shutdown. [The complete record](service-evaluation-ci-39148921581/index.json) retains every report and archive identity.

The merged commit is `315b0283f598b1bef7f2c6c38c90c01d562fe6c5`. Its main run `39149232337` passed foundation and service but failed the separate desktop bird-animation observation, so overall main verification failed. The [XR and animation follow-up](F05-XR.md) retains that failure, implements the observation repair, and still requires fresh hosted and successful subsequent main evidence. There is no deployment, full-foundation or production-capacity claim.
