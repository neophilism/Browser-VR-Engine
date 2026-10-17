# Local released-service automation

This next-PR overlay adds `automate.py`, its internal `command-supervisor.py`, and focused tests beside the corrected VRSpace service scripts. It reuses their exact JAR download/verification, Java 17 launcher, process ownership helpers, browser checks and socket observer. It adds no workflow and cannot establish hosted CI acceptance.

## Prerequisites and one command

Use Linux with procfs mounted in the runner's PID namespace, the `/proc/<pid>/task/<pid>/children` interface, child-subreaper and Python pidfd support, Python 3.11 or newer, Node 24/npm, Java 17, and curl. A mismatched outer-namespace procfs mount or missing child-enumeration interface is rejected before a tool stage starts. The sibling `evaluations/babylon-vrspace` must already be built against the frozen F03 fixtures. A matching Playwright browser must already be installed. This command installs and audits the service package's locked Playwright toolkit; it does not install a browser or build F05.

From the integrated `evaluations/vrspace-service` package:

```sh
python3 automate.py
```

Optional harness settings remain `F03_FIXTURE_ROOT`, `F05_EVALUATION_ROOT`, and `CHROME_EXECUTABLE`. Relative input paths resolve against the service package. `PLAYWRIGHT_BROWSERS_PATH` can point to an existing browser-cache directory when the browser was installed outside Playwright's default cache. Provider, GitHub, registry-auth and arbitrary Node/Java settings are excluded by the existing service environment allowlist. HOME and USERPROFILE are never reassigned.

The command refuses an occupied service, database or frontend port and refuses concurrent automation in the same package. It does not stop any pre-existing service. It installs with `npm ci --ignore-scripts`, audits that isolated dependency graph, and invokes the original `setup.py` to fetch and verify the official executable. A registry failure or any high/critical advisory stops the run.

The required audit contacts `registry.npmjs.org`. End-to-end execution is currently held because automatic approval review rejected sending the repository-derived dependency inventory to that destination without specific owner authorization. The next integration must resolve that gate; this overlay has no audit-skip option and retains no claim of a completed automation run.

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

The manifest always records `mode: local`, `ciAcceptance: false`, and `qualificationStatus: incomplete`. A successful run establishes only the measured released-service presence/pose subset. It does not establish authenticated roles, server-authoritative physics, shared editing, durable identity, conferencing media, physical XR/audio, performance or conference capacity. Root must integrate and exercise this entry point before adding any service CI acceptance path.

## Focused regression checks

```sh
python3 -B -O test/automation-checks.py
```

These synthetic verifier and real child-process tests exercise stale/failing report rejection, source changes, image integrity, audit failures, path containment, subprocess failures and bounded cancellation. The lifecycle regressions include a leader that exits first, a TERM-ignoring child, and a detached child that must still be adopted and reaped. They do not substitute for the actual Java server and nine-browser-check run. The existing service launcher tests separately exercise optimized Python integrity, PID ownership, hung-child cleanup and frontend failure cleanup.

Current overlay validation: the seven verifier, source, image, audit-result and path-containment test methods pass under optimized Python. The two process-test methods are blocked before synthetic command creation on the available execution surfaces: one exposes an outer-namespace procfs mount; the aligned surface lacks the task `children` interface. The new supervisor therefore still needs an actual run of the complete nine-test-method suite on a Linux host satisfying those prerequisites. Older launcher tests do not cover this new supervisor. No full automation or hosted CI result is claimed.

Integration review also requires the corrected browser runner's finalization record: cleanup must have settled, all final error/request/cleanup counts must be zero, and both final client observations must have empty error lists. The verifier independently rejects fatal or cleanup errors even when the report claims that all nine checks passed. Malformed observations, log entries and error fields are rejected as well. The focused tests retain contradictory-success cases for these boundaries.

`evidence/automation-review/validation-receipt.json` preserves the original overlay observation and original source hashes. `evidence/automation-review/integrated-verifier-review.json` records the later integrated verifier revision and its own actual seven-method result. Neither receipt claims a completed process supervisor, Java/browser automation or hosted CI run.
