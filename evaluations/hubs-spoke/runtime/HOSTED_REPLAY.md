# Manual Ubuntu replay and downloaded failure evidence

This is the reproducible hosted path for the prepared F04 runtime diagnostic. The workflow is separate from the three required engine prerequisite jobs and their aggregator. It is dispatched explicitly on reviewed `main`; pull requests and pushes do not start this stack. No hosted result is implied by committing the workflow.

## Start one reviewed run

After the change is reviewed and merged, select **F04 Hubs runtime diagnostic** in the repository's Actions page, select `main`, choose `diagnose`, and run the workflow. The corresponding operator CLI is:

```sh
gh workflow run f04-hubs-runtime.yml --ref main -f mode=diagnose
```

The entry point rejects any other repository, event, branch, workflow path, workflow commit, dirty checkout, custom browser or fixture override. Its manifest records the exact dispatched commit, Git tree, workflow commit/ref, run ID, attempt, operation, source hashes, frozen F03 hashes, upstream pins and toolchain. `head`, `tested` and workflow SHA must be the same commit. There is no pull-request merge/base identity for this main-only dispatch.

The workflow uses the already reviewed commit pins for official checkout, setup-node and upload-artifact actions. It has only `contents: read`, does not persist checkout credentials, and uses an ephemeral Ubuntu 24.04 x86_64 runner. It supplies no application/provider secrets. Public source/image/bootstrap downloads and locked npm package metadata are the authorized external inputs/egress; services and browser observations use only generated credentials, synthetic assets and loopback endpoints. No server or paid provider is deployed.

`diagnose` always obtains the real mandatory toolkit, Hubs and Dialog npm audit reports. A valid high/critical failure may allow the remaining controlled observations, but the work step, final manifest and workflow remain failed. Invalid/missing audit JSON, changed lockfiles, unexpected process failures and incomplete cleanup are failures too. `evaluate` stops before container startup on a failed audit. Neither operation has a skip or waiver option, and even a clean automated subset retains `qualificationStatus: incomplete`.

## What the job executes

| Phase | Required behavior | Bound |
| --- | --- | --- |
| Setup | Verify Linux/Docker/procfs prerequisites and pinned Node; run 20 Python and two Node pure checks; run both real watchdog process methods; install the locked toolkit and its pinned Playwright Chromium with OS dependencies. | Eight-minute shared setup deadline, smaller per-stage limits. |
| Runtime | Run the existing pinned-source/audit/build/readiness launcher; attempt the nine native two-browser Hubs checks only after real service readiness. | One 45-minute work deadline. |
| Runtime teardown | Stop and remove this run's dual-label-owned containers, network, volumes and derived images; retain command receipts and absence queries. | Six-minute aggregate cleanup deadline. |
| Independent watchdog | Always attempt controller/orphan-supervisor shutdown using held pidfds and exact creation/argv identities; then repeat owned Docker cleanup and prove absence. | Bounded TERM/KILL intervals and a separate six-minute Docker deadline. |
| Finalization and upload | Always collect only allowlisted logs, reports and PNGs; recompute the actual outcome; upload an immutable run/attempt artifact. | 16 MiB per file, 64 MiB total; 70-minute whole-job timeout. |

The two actual watchdog methods require the same-namespace Linux `/proc/<pid>/task/<pid>/children` API and pidfds. One checks refusal of stale/unrelated owners and bounded TERM/KILL behavior. The other creates a real orphaned stage owner with a TERM-ignoring descendant and verifies that the reviewed supervisor drains and reaps it. A missing prerequisite is a failure, not a skip. These methods have not run in the restricted local workspace.

The wrapper and ordinary toolkit installer both use `evaluations/hubs-spoke/artifacts/browsers`. Hosted setup uses the locked Playwright executable and `install --with-deps chromium`; it never substitutes `CHROME_EXECUTABLE`. Package configurations and caches use explicit paths. HOME and USERPROFILE are not repurposed, project npm/yarn configuration is rejected, and provider/GitHub/npm credentials are absent from child environments.

Cleanup does not trust a changed working helper. It reads the exact original helper blobs from the recorded Git commit, checks their hashes against the original input map and shared-supervisor pins, writes private verified copies, and executes those copies. The current source difference remains a fatal outcome. Receipt/bootstrap imports do not execute current runtime helpers before this recovery decision. Lossless process-argument handling prevents an unrelated non-UTF-8 argument from aborting the owner scan. Both project and custom ownership labels remain required before Docker removal; an unproven owner is not removed.

An entire runner/VM loss can prevent the `always()` steps or upload. That leaves missing evidence and cannot qualify this run. No successful cleanup is inferred from the absence of a final artifact. If source changes prevent safe finalization, the uploaded phase receipts are explicitly marked unverifiable and the verifier rejects them.

## Verify the downloaded artifact

Download the artifact named:

```text
f04-hubs-runtime-<tested-commit>-<run-id>-<attempt>
```

Retain its GitHub artifact ID/digest and run URL when retrieving it. Check that transport digest using the repository's artifact-download procedure, then run the standalone verifier from a clean checkout of the exact tested commit. The directory argument must be the extracted directory containing `manifest.json`:

```sh
python3 -B -O scripts/ci/verify-f04-runtime-evidence.py /absolute/path/to/extracted-artifact \
  --head <tested-commit> --tested <tested-commit> \
  --run-id <run-id> --attempt <attempt> \
  --operation diagnose --expected-outcome failed
```

The expected outcome is explicit. Exit zero for this command means the failed artifact's integrity and declared failure were verified. Its JSON still reports `runStatus: failed`, `complete: false` and `acceptancePassed: false`. It does not make the workflow green or accept F04. Use `--expected-outcome passed` only when the actual limited run passed every mandatory audit, stage, check and cleanup boundary.

The verifier checks exact command argument lists/CWDs, process exit/ownership receipts, ordered time bounds, source/fixture/model hashes, generated Compose/build identities, actual owned-resource absence queries, browser command stdout, exact nine check IDs and screenshot bytes. Runtime/browser claims receive these checks even when the final diagnostic is failed by an audit. Empty cleanup command lists, late browser/cleanup errors, substituted commands, stale sources, incomplete uploads and contradictory success fields are rejected.

## Current evidence boundary

The source-bound local preparation receipt is [here](evidence/2026-10-18-hosted-preparation/receipt.json). It records only actual pure checks, policy/evidence tests and retained-artifact integrity. The original editor captures and preparation receipt are immutable historical evidence; current source changes are reported separately. Docker builds, this backend version combination, the new process methods, real native room/rejoin behavior and this manual workflow have no execution claim until their hosted receipts exist.

The known legacy Hubs audit remains failed. Native/OS/Hex/Python dependency review, full authoring/publication, WAN/TURN behavior, scale, spatial-audio measurements and physical-headset qualification remain separate. A successful nine-check runtime observation supplies a bounded adaptation result for F04/F06; it does not resolve those requirements.
