# Released-service automation and required hosted execution

`automate.py` and its internal `command-supervisor.py` reuse the exact JAR download/verification, Java 17 launcher, process ownership helpers, browser checks and socket observer. The local automation receipt always keeps its limited local status. The separate repository runner, `scripts/ci/service.py`, supplies the required hosted job, current-event evidence and complete regression gates described below. Adding that job does not mean it has executed successfully.

## Prerequisites and one command

Use Linux with procfs mounted in the runner's PID namespace, the `/proc/<pid>/task/<pid>/children` interface, child-subreaper and Python pidfd support, Python 3.11 or newer, Node 24/npm, Java 17, and curl. A mismatched outer-namespace procfs mount or missing child-enumeration interface is rejected before a tool stage starts. The sibling `evaluations/babylon-vrspace` must already be built against the frozen F03 fixtures. A matching Playwright browser must already be installed. This command installs and audits the service package's locked Playwright toolkit; it does not install a browser or build F05.

From the integrated `evaluations/vrspace-service` package:

```sh
python3 automate.py
```

Optional harness settings remain `F03_FIXTURE_ROOT`, `F05_EVALUATION_ROOT`, and `CHROME_EXECUTABLE`. Relative input paths resolve against the service package. `PLAYWRIGHT_BROWSERS_PATH` can point to an existing browser-cache directory when the browser was installed outside Playwright's default cache. Provider, GitHub, registry-auth and arbitrary Node/Java settings are excluded by the existing service environment allowlist. HOME and USERPROFILE are never reassigned.

The command refuses an occupied service, database or frontend port and refuses concurrent automation in the same package. It does not stop any pre-existing service. It installs with `npm ci --ignore-scripts`, audits that isolated dependency graph, and invokes the original `setup.py` to fetch and verify the official executable. A registry failure or any high/critical advisory stops the run.

The required audit contacts `registry.npmjs.org`. On 2026-10-18 the owner explicitly authorized dependency-inventory audits to that destination, locally and in reviewed CI. The earlier automatic approval rejection is historical. There is no audit-skip option: a real registry result remains required, and authorization alone is not an audit result.

## Owned service and evidence

The wrapper starts the corrected `server-run.py` as its child, then verifies the JVM's parent, pinned command/configuration, creation identity and kernel process handle. It waits for the actual loopback HTTP health endpoint to return `200` and `UP`, runs the nine two-browser checks, records a loopback socket snapshot, and requests bounded shutdown through the launcher. A pinned JVM handle remains available for fallback cleanup if its launcher fails. Fallback or forced cleanup makes the overall result fail.

Each other tool stage runs through a dedicated Linux child subreaper. It adopts orphaned descendants even if they detach into a separate session, verifies each direct child's creation identity and pidfd, and performs bounded TERM/KILL cleanup and reaping. This ownership is isolated from the sibling Java launcher. A command that exits while leaving children, requires forced cleanup, fails, or has no valid process report remains a failure. The original command's exit code is retained separately from the supervisor's exit code.

The service's `source-files.json` remains the browser capture's exact source inventory. The wrapper additionally fingerprints its own runtime source, the sibling source and every safe output in the sibling build manifest, and all frozen F03 metadata/resources before and after execution. The new AudioWorklet output is covered through that manifest. Missing, stale or changed inputs, mismatched server identity, failed checks, requests/errors, missing screenshots, malformed reports and unclean shutdown prevent a passing result.

Every invocation creates a new `artifacts/automation-runs/run-*` directory containing:

- `manifest.json`: local run status, stage commands, source/build/fixture fingerprints, process identity, health, shutdown, failure details, and artifact hashes.
- `logs/` and `reports/`: actual command output, per-stage process ownership/cleanup reports, and the isolated service dependency audit.
- `browser/`: the fresh report and two checked screenshots; failure captures are retained when available.
- `server/`: the actual run metadata, server log, and ownership/network snapshot.

Only this run directory is an upload candidate. It contains no JAR, database, browser binary, dependency directory, source checkout or fixture payload. Downloads, npm files, database state and raw intermediate browser runs remain outside it. Each retained file is capped at 16 MiB; oversized command output fails the run and is explicitly marked as truncated.

The inner manifest always records `mode: local`, `ciAcceptance: false`, and `qualificationStatus: incomplete`, including when CI invokes it. A successful run establishes only the measured released-service presence/pose subset. It does not establish authenticated roles, server-authoritative physics, shared editing, durable identity, conferencing media, physical XR/audio, performance or conference capacity. The outer hosted receipt verifies execution without rewriting these limitations.

## Required hosted service job

The `engine-service-evaluation` job runs on `ubuntu-24.04`, with read-only checkout, the repository's exact Node version and the pinned official `setup-java` action selecting Temurin Java 17. It records the actual Java patch version; it does not claim a fixed JDK binary digest. It has no repository secrets, deployment permission, package cache, provider calls or external service deployment. The aggregator requires success from foundation, evaluation and service jobs.

From the repository root, the job runs:

```sh
python3 -B -O scripts/ci/service.py
```

Ten required stages execute in order: all nine automation test methods, the 14 optimized launcher cases, the 15 finalization cases, Node/Java/npm version observations, locked sibling F05 installation, a fresh sibling build, pinned Playwright Chromium installation with system dependencies, and full `automate.py` execution. The full automation then performs its six stages, including locked service-toolkit installation and the actual service-graph audit, official release verification, nine real two-browser checks, network observation and owned shutdown. The existing evaluation job separately audits the sibling F05 graph.

Every stage uses the existing reviewed subreaper supervisor. Both formerly blocked process-test methods must run and pass; skipped or missing methods fail. A missing `/proc/<pid>/task/<pid>/children` interface fails before command creation, with the process failure retained. Cancellation receives bounded cleanup; a command leak, forced cleanup, failed cleanup or absent receipt prevents success. A forcibly terminated hosted job may not finish writing evidence and cannot pass acceptance.

The runner creates a fresh `artifacts/service/` and retains only small allowlisted logs, reports, screenshots, process records and build metadata. It binds the PR head/base, actual tested commit/tree, workflow SHA/ref, run/attempt, clean source state, CI implementation, all service source, both nested lockfiles, all 11 F05 build inputs and three outputs, and frozen F03 metadata/resources. Only the newly created automation directory from that command can be collected. The declared browser source inventory is now 24 files; the earlier manual 20-file captures remain unchanged and historical.

Local diagnostic execution is available with `python3 -B -O scripts/ci/service.py --local`. It runs the same sequence and can download the locked dependencies, browser and release; it always leaves `complete: false` and cannot satisfy hosted acceptance. It does not substitute an arbitrary local Chrome path for the hosted pinned browser. Both local and hosted invocations reject concurrent runs, pre-existing services and unsafe package/output paths.

After downloading `engine-service-evaluation-<tested SHA>-<run ID>-<attempt>`, use a clean checkout of the exact tested commit and explicitly provide identities freshly observed from GitHub:

```sh
python3 -B -O scripts/ci/verify-service-evidence.py path/to/service-artifact \
  --repository neophilism/Browser-VR-Engine --event pull_request \
  --head CURRENT_HEAD_SHA --base CURRENT_BASE_SHA --tested TESTED_SHA --tree TESTED_TREE_SHA \
  --workflow-sha WORKFLOW_SHA --workflow-ref WORKFLOW_REF --run-id RUN_ID --attempt ATTEMPT
```

Use `--base none` only for a main push. The verifier independently checks file hashes and containment, command/ownership outcomes, complete test IDs, exact source/build/fixture identity, the real registry audit, binary verification output, browser finalization and owned shutdown. A JSON fixture that passes mutation tests is not hosted evidence; inspect the actual GitHub job, artifact identity and reviewed commit as well.

## Focused regression checks

```sh
python3 -B -O test/automation-checks.py
python3 -B -O test/report-automation-checks.py
```

These synthetic verifier and real child-process tests exercise stale/failing report rejection, source changes, image integrity, audit failures, path containment, subprocess failures and bounded cancellation. The lifecycle regressions include a leader that exits first, a TERM-ignoring child, and a detached child that must still be adopted and reaped. They do not substitute for the actual Java server and nine-browser-check run. The existing service launcher tests separately exercise optimized Python integrity, PID ownership, hung-child cleanup and frontend failure cleanup.

The second command runs the same complete suite and emits a unique source-bound per-method JSON report for CI. Current local observations remain limited: seven original verifier methods pass; the two process methods fail before synthetic command creation because the aligned surface lacks the task `children` interface. The new hosted runner's local attempt also stops at that prerequisite, before dependency, audit, JVM or browser stages. Older launcher tests do not cover the new supervisor. No full automation or hosted service result is claimed until the actual job completes and its current-run artifact is verified.

The repository's `scripts/test/service-evidence-checks.py` adds seven no-network methods covering complete synthetic inner/outer receipt validation, stale identities, substituted commands, missing process-method coverage, build inventory, leaked descendants, late browser errors, shutdown failures and artifact containment. Workflow mutations also prove that omitted, skipped, cancelled or failed service jobs cannot make the aggregator succeed. These verifier/policy tests do not substitute for the process methods or real server run.

Integration review also requires the corrected browser runner's finalization record: cleanup must have settled, all final error/request/cleanup counts must be zero, and both final client observations must have empty error lists. The verifier independently rejects fatal or cleanup errors even when the report claims that all nine checks passed. Malformed observations, log entries and error fields are rejected as well. The focused tests retain contradictory-success cases for these boundaries.

`evidence/automation-review/validation-receipt.json` preserves the original overlay observation and original source hashes. `evidence/automation-review/integrated-verifier-review.json` records the later integrated verifier revision and its own actual seven-method result. Neither receipt claims a completed process supervisor, Java/browser automation or hosted CI run.
