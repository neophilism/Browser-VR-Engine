# F04 runtime preparation and manual hosted comparison

This change prepares the first reproducible backend run for the pinned Hubs/Spoke candidate. It does not establish that the backend combination works. The existing Spoke editor evidence and failed Hubs dependency audit retain their original outcomes.

## Prepared behavior

The [runtime guide](../../evaluations/hubs-spoke/runtime/README.md) defines a four-service diagnostic using real Hubs, Reticulum, Dialog and PostgreSQL. Exact source commits, source-file hashes, image digests and bootstrap hashes are pinned. Generated build contexts contain explicit adaptations for local service wiring, locked native builds and the retained Spoke courtyard export. Every runtime attempt must obtain fresh toolkit, Hubs and Dialog npm audits.

The native two-browser harness attempts room creation, scene loading, distinct sessions, mutual presence, real Dialog audio transports and packet counters, keyboard-driven pose exchange, departure and rejoin. These nine prepared checks have not run against this backend profile. They do not measure complete spatial audio, shared-world physics/authoring, physical VR or conference capacity.

The separate manual workflow runs only an explicit dispatch of reviewed `main`. It has read-only repository permissions, pinned official actions, no persisted checkout credentials and no provider secrets. It does not change the three prerequisite jobs or aggregate in `engine-ci.yml`. [The replay guide](../../evaluations/hubs-spoke/runtime/HOSTED_REPLAY.md) specifies the exact operator command and downloaded-artifact verifier.

## Outcomes and cleanup

`evaluate` stops before image builds or service startup when a mandatory audit fails. `diagnose` may continue after a valid failed audit to gather bounded synthetic observations, but the work step, manifest and workflow still fail. Missing/invalid audits, process errors, source changes and cleanup failures cannot become successful results.

Each run owns a unique Compose project and derived images. Services use a private internal network, loopback host ports and finite resource limits. Teardown checks both ownership labels and records actual empty Docker queries after removal. The always-run watchdog identifies the original controller and orphaned stage supervisors by exact argv, PID/start time and held pidfds. It reconstructs the original reviewed cleanup helpers from the dispatch's Git blobs, verifies copies before execution and afterward, and still records changed current source as failure.

Only bounded allowlisted logs, reports and PNGs enter the artifact. Keys, databases, dependency/source trees and image layers remain outside it. The independent verifier checks source/run/workflow identity, exact commands and working directories, process receipts, model and container identities, browser stdout, screenshot bytes and actual absence queries. Runtime/browser claims receive these checks even when the overall audit outcome is failed. Verifying a failed artifact establishes the integrity of that failure; it does not accept F04.

## Actual local evidence

The [original preparation receipt](../../evaluations/hubs-spoke/runtime/evidence/2026-10-18-preparation/receipt.json) retains the blocked local preflight and earlier source-adaptation rehearsal. Its original source identities are unchanged.

The [hosted-wrapper preparation receipt](../../evaluations/hubs-spoke/runtime/evidence/2026-10-18-hosted-preparation/receipt.json) binds the final source and actual local commands: 9 editor checks, 20 Python runtime methods, 2 browser-policy checks, 4 historical-integrity checks, 70 manual-workflow policy cases, the root evidence wrapper and 14 direct optimized Python evidence methods. No check was skipped. Workflow-policy and historical-file verification also passed. The first capture-only parser expected TAP while the nested Node suites emitted their spec format; the original parser-failure receipt is retained, and the final receipt explicitly derives the correct counts from unchanged raw output without a rerun or source change.

The immutable historical capture index still verifies its original bytes. Five changed toolkit sources have exact archived originals with a narrow source map; current-source differences are reported explicitly rather than relabeling old captures as new execution.

Separate [source review](../security/F04-runtime.md) resolved dirty-source cleanup, boolean-only absence claims, failed-diagnostic proof gaps, and lossless handling of unrelated process names/arguments. These are source and verifier results. The two actual watchdog process methods and all backend/browser steps still require hosted execution.

After integration onto main `647240bd5493940f60caaec246970a86a2a4238f`, the [full local foundation sequence](f04-runtime-integration-local-2026-10-18/index.json) passed all six stages: install, checks, examples, packed consumer, sharding and the actual authorized root dependency audit. The check stage passed 39 package tests and 269 tooling tests with zero skips. Its prepared tree and eight original report/log files are retained as a dirty local preview; subsequent documentation corrections do not relabel it as hosted evidence. Current-head hosted prerequisite jobs and artifact verification remain necessary before merge.

## Next required evidence

After this reviewed change merges and its applicable main checks pass, dispatch one `diagnose` run, retain its actual outcome and artifacts, and verify those artifacts from the exact clean dispatched commit. Record build, migration, TLS, native-module and browser failures precisely and repair observed blockers. The known failing legacy Hubs audit remains a remediation requirement; a successful runtime subset cannot clear it. Full F04/F05 comparison, physical devices, shared-world/media semantics and F06 selection remain incomplete. XLR8 still follows complete engine release R12.
