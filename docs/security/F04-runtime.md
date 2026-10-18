# Separate self security review: F04 manual runtime diagnostic

This is an assistant self-review of the prepared runtime integration, with separately identified automated peer reviews. It is not independent human approval, production-security certification or evidence of an executed backend. The final GitHub review must bind the published head after current required checks.

## Boundaries reviewed

The runtime remains an isolated evaluation. It uses exact public source/image/bootstrap pins, synthetic assets, generated local keys, private container networking and loopback host ports. Child environments use explicit package/Git/Docker configuration and omit provider/GitHub/npm credentials. Builds do not receive the Docker socket or host process/network namespace. Artifact collection excludes work trees, dependency caches, databases and private key material; unknown, linked, oversized or credential-bearing output is rejected.

The manual workflow is restricted to an explicit reviewed-main dispatch with exact event, source, workflow, run and attempt identities. The policy validates its six steps, official action pins, permissions, input choices, cleanup/finalization conditions and immutable artifact settings. The existing required engine workflow is byte-for-byte unchanged. A failed mandatory audit cannot become a passed diagnostic or accepted foundation through this separate workflow.

## Findings resolved

Review found that a changed working source could previously prevent all teardown before entering the cleanup handler. The corrected path validates the original dispatch, retrieves original helper Git blobs, checks them against recorded hashes and shared-supervisor pins, and executes private verified copies. Receipt/bootstrap code defers current runtime imports. The copy is checked again after teardown; dirty current source remains fatal evidence.

The first verifier accepted cleanup booleans without observing commands. It now requires the original controller observation and actual run-bound Docker commands, process receipts and successful empty output for containers, networks, volumes and derived images. Missing observations, forced termination, stale process identity or incomplete cleanup remain failures.

The first verifier applied some runtime/browser checks only to an overall passed result. It now validates claimed runtime/browser subsets independently of the final audit failure: exact stage order, argv/CWD, source and model hashes, running container identities, readiness and browser stdout, the nine checks and screenshot integrity remain mandatory. The regression suite mutates these fields while preserving outer hashes to test the intended boundary.

A separate read-only review also found that unrelated non-UTF-8 process argv and process names could abort owner discovery. The watchdog now parses the numeric stat tail as bytes and preserves argv losslessly. Its exact owner path, immutable process creation identity and held pidfd checks remain intact. A deterministic case covers both byte sequences without signaling unrelated processes.

## Reviewed source identities

| Source | SHA-256 |
| --- | --- |
| `scripts/ci/f04-runtime.py` | `aa0fcbbd867b92f7bf898339df3dafaaeb4205d7c5ebd730cd3729ab92cc8100` |
| `scripts/ci/f04_runtime_evidence.py` | `333909d29448d13d246a740699c246885bab51ed5ef5066aadb285dbe9317ba1` |
| `scripts/ci/verify-f04-runtime-evidence.py` | `4e8224abdb9a4a787ed25b04016b43d79744c847e20c84b4c0188e8ba0947028` |
| `runtime/cleanup.py` | `7b1b0f723068bbb92603a94b3bfd4c99933ed3b38209948bdf28d28c689f160a` |
| `runtime/watchdog.py` | `a1b61a93b4fdada6bef0091fb818d8938bd82ad83b22bcfe85275905e3dafd40` |
| `scripts/test/f04-runtime-evidence-checks.py` | `53a73ec1d10994a4f2f852f5f693d787126e80ce52fe9363ff63eb822da5e1f4` |

The `runtime/` entries are under `evaluations/hubs-spoke/`. The [preparation receipt](../../evaluations/hubs-spoke/runtime/evidence/2026-10-18-hosted-preparation/receipt.json) contains the complete input hashes and each review's scope. Root reviewed the policy and wrapper/proof changes separately from their authors; the asset reviewer covered history, extracted cleanup and watchdog. No remaining blocker was found in those source-review scopes.

## Verification limits

Actual local pure/policy/history results are recorded in [the evidence guide](../evidence/F04-runtime.md). The integrated foundation sequence passed all six stages, including 39 package tests, 269 tooling tests and the real authorized root audit. A separate bookkeeping review verified every one of the 156 retained PR7 candidate/main files, their hashes, linked documents and explicit qualification limits; the identified historical-tense and scope-label corrections were applied without changing raw evidence. The two real watchdog process methods and the backend/browser combination remain unexecuted until the compatible hosted run. Current-head prerequisite CI, artifact verification, head-bound review, safe merge and main verification are still required for this tooling integration. The manual runtime's later result must retain its separate identity and outcome.

The known legacy Hubs audit remains failed. Hex/Python/OS/native dependencies, complete software obligations, full authorization/media/authoring behavior, physical VR/audio and target-device workloads remain qualification work. No provider credential or paid API was used. No marketplace policy limits the engine's planned import, conversion, editing or export capabilities.
