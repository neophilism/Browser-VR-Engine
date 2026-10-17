# CI and acceptance evidence

F02 supplies the foundation checks and the procedural merge gate. It does not supply rendering, browser/VR qualification, live services, migrations, or deployment. Their applicability is recorded in [scopes.json](scopes.json). A missing required external system is a blocker; an unimplemented future suite is not a passing test.

## Commands

Use the exact Node version in `.nvmrc`. Install dependencies with `npm ci --ignore-scripts`; the current dependency set needs no lifecycle scripts. Revisit that policy explicitly if a future dependency requires one.

| Command | What it verifies |
|---|---|
| `npm run check` | Plan/progress structure and evidence references, static engine/application boundaries, workflow policy, baseline credential exposure, TypeScript build, required core-package tests and tooling mutation tests. |
| `npm run example:sdk` | The standalone workspace host can import the public SDK. |
| `npm run test:consumer` | The already built SDK tarball installs outside the repository; runtime and declaration exports resolve inside that installation. No package is published. |
| `npm run test:sharding` | Two actual Node test-runner shards cover named assertion cases without omission, duplication or an empty shard. An intentional failing assertion must exit nonzero in the same unsharded and sharded runner modes. These fixtures qualify the test mechanism. |
| `npm run check:dependencies` | The actual npm registry audit for the lockfile, including development dependencies. Registry/network failures remain blocked scans. |
| `npm run ci:local` | A clean dependency reinstall and the complete foundation command sequence, producing a local preview manifest and reports. Local evidence cannot establish hosted acceptance. |

`test:consumer` follows `npm run check` or `npm run build`. Required commands and the core test script are explicit: removal of a required script cannot become an `--if-present` pass. No browser or provider package is installed merely to create an empty CI job.

The static import checker uses the scanner exported by the exact pinned TypeScript 7 package. It checks literal imports, re-exports, dynamic-import literals and require calls in engine packages, plus root/package dependency names and alias, file or Git targets, while ignoring comment and ordinary string contents. It is not a control for computed import targets or arbitrary creator code; those need the later runtime capability boundaries and review. Its use of TypeScript's explicitly unstable scanner API is covered by the tooling tests on every compiler upgrade.

## Workflow and failure behavior

The [Engine CI workflow](../../.github/workflows/engine-ci.yml) runs on pull requests targeting main, main pushes and merge-group checks. Its `engine-foundation` job receives read-only checkout permission and no deployment credentials. It executes a fixed command list, records each exit code, and preserves failure. The `engine-required` job always evaluates the prerequisite result and fails unless it is exactly `success`.

The workflow has no path filters. Action references are full commit SHAs verified against upstream releases and `action.yml`; their source references are in [action-pins.json](action-pins.json). Updates run through the same review/check process. Dependency-update PRs are configured without automatic merge. [GitHub action security guidance](https://docs.github.com/en/actions/reference/security/secure-use)

An installation failure marks dependent commands `not_run`, not passed. Command errors, signals, timeouts, registry outages, missing reports and artifact-upload failure prevent complete acceptance. The local runner does not ignore a process error even when an environment happens to return an exit status as well. This matters in restricted local execution environments.

The workflow YAML validator checks actual parsed mappings, pin values, minimal permissions, main-targeting triggers, bounded execution, the required checkout/toolchain/hosted-run/upload steps and their conditions, artifact settings and the final failure gate. It rejects substituting a local preview for the hosted runner. It is a regression check, not an access-control barrier against a malicious author who edits both the workflow and its validator. Workflow and policy changes still require review.

## Evidence identity and retention

Each run writes `artifacts/ci/manifest.json`, one log per required command, and the full structured dependency-audit result. Records include repository, event, run ID/attempt, workflow ref/SHA, PR head/base, actual tested commit/tree, source cleanliness, lockfile/plan digests, observed Node/npm/OS/architecture and runner image, command argv/outcomes/durations, scope decisions and report hashes.

For a pull request, GitHub's default checkout tests a synthetic merge commit. The PR head, base, and tested checkout are separate fields. Main-push evidence identifies the actual main commit. A merge-group run has its own tested commit. Do not infer the checkout from a workflow run's `head_sha` alone. [GitHub workflow event semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

Artifacts are named with tested SHA, run ID and attempt. Reports use an allowlisted path, exclude hidden files, fail when missing, and retain for 30 days. The upload's archive digest/ID is obtained after upload; put that identity in the acceptance receipt rather than recursively inside the archive. Preserve small accepted receipts under `docs/evidence/` and retain needed release evidence beyond ordinary artifact expiry. [GitHub workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data)

After downloading a candidate's report archive, verify its manifest and report bytes against identities freshly observed from GitHub:

```sh
node scripts/ci/verify-evidence.mjs path/to/manifest.json CURRENT_HEAD_SHA TESTED_SHA CURRENT_BASE_SHA
```

The last argument is required for PR evidence. Run/attempt, workflow, lockfile and plan digests are retained for independent comparison. A correctly shaped JSON file is not proof that CI or review occurred; inspect the actual run, expected jobs, conclusions, source revision and review independently. The verifier rejects mismatched current head/base/tested SHA, incomplete results, local/dirty evidence, substituted command vectors, missing commands/reports and altered report bytes.

The runner removes only its own generated `artifacts/ci/` output and previous dependency-audit file before starting, avoiding stale reports from earlier attempts. Logs omit full environment dumps and redact known credential patterns plus assignment-style API-key, token, secret and password values. Structured reports redact strings before serialization to preserve valid JSON. Unlabelled unknown secrets cannot be reliably identified by these rules. Ordinary PR fixtures must remain synthetic; private models, documents, audio and signed asset URLs do not belong in these artifacts.

## Review and merge procedure

1. Complete the implementation and meaningful local checks. Create the final candidate commit.
2. Perform and record a separate self security review after implementation/testing; fix blocking findings. A remediation commit needs fresh checks and review.
3. Confirm the actual required checks pass for the current candidate. Record the PR head, integration base, tested checkout, run/attempt, reports and review identity. Preserve any additional reviews required by the repository.
4. Immediately before merge, fetch the current head/base, check results, review state and mergeability again. A changed head invalidates prior candidate evidence. A changed base requires fresh integration evidence. Use the expected-head condition in the merge API when available.
5. Merge only the verified candidate, then confirm the observed merge commit and applicable main-branch check results. Update the historical progress receipt afterward.

A review that names its exact commit cannot be written into that same commit without changing its SHA. Keep the findings/method narrative in the PR, then record a head-bound receipt outside that commit, such as a GitHub COMMENT review tied to its `commit_id`. Self review is not an independent approval. Preserve review ID, reviewed SHA, author, timestamps and content digest in the eventual acceptance record. [GitHub review API](https://docs.github.com/en/rest/pulls/reviews)

For F02 acceptance, demonstrate that a deliberately failing `engine-required` prevents acceptance and that no merge occurs until a repaired new candidate has fresh passing checks. Local mutations also demonstrate stale-evidence and failure rejection. Preserve all actual repository protections; report their observed state honestly. Workflow files do not configure server-side branch protection, and unavailable administration is not an additional F02 prerequisite. GitHub can treat skipped/neutral checks as acceptable under some branch-protection configurations, so the explicit aggregator also guards the procedural acceptance path. [Protected-branch semantics](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

## Progress states

The existing ledger schema remains supported. `implemented` means code exists; `verified` requires referenced evidence and a separate review; `accepted` additionally requires the observed PR merge and accepted prerequisites. Local reference validation checks files exist within the repository; it does not authenticate the facts stated inside them. A later bookkeeping commit can reference earlier accepted commits without invalidating historical evidence.

`deployment` and `qualification` remain independent optional records. Their completed states require `sourceSha`, a named `target`, and separate `evidence` references. Pending, failed, blocked and not-applicable states remain explicit; blocked/not-applicable records need a reason. Neither is inferred from `accepted`. A historical F01 accepted receipt does not have to match the head of an F02 candidate. New card namespaces and plan revisions do not require a fixed total-card count.

## Security scope and later lanes

Tool subprocesses receive an explicit allowlist of executable paths, operating-system/home/temp settings, locale, proxy/certificate configuration and the isolated consumer's npm-cache path. Provider keys, GitHub/runtime tokens, registry-auth variables, `NODE_OPTIONS`, `NODE_PATH` and arbitrary npm configuration are excluded without reading their values. Synthetic environment fixtures exercise both the helper and actual child processes. This prevents accidental environment propagation; it is not a sandbox for hostile local code with filesystem access. Run proposed code only in an appropriate isolated environment. General PR/main CI references no repository secrets and makes no live Meshy or other provider calls. Future provider qualification belongs in a separate reviewed job on a trusted branch when its implementation is ready.

The source-exposure scan checks recognizable credential patterns and filenames, reporting only path/line/rule. It is a baseline, not comprehensive secret discovery. Audit fails on high/critical advisories; lower-severity findings remain in the structured report for disposition. There is no automatic `npm audit fix` or unreviewed exception mechanism. Invalid registry output and contradictory counts/exit status fail as blocked scans. [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/)

Browser, service-integration and migration scopes activate with actual fixtures and their implementation. Add their real jobs to the aggregator and evidence contract together. For a future Playwright lane, pin its npm dependency, install matching browsers using the installed CLI, report every shard, verify shard completeness, and retain reports in the same unprivileged workflow. A successfully merged HTML report cannot override a failed shard. [Playwright CI](https://playwright.dev/docs/ci-intro), [Playwright sharding](https://playwright.dev/docs/test-sharding)

F02 has no deployment workflow. Future deployment preflight must verify an immutable artifact from a successful trusted main/release run before credential use. The owner has placed `MESHY_API_KEY` in repository Actions secrets; F02 neither references nor validates its value. A future dedicated provider integration job may reference that existing secret on a reviewed trusted branch or controlled manual run when the implementation is ready. Moving it to an environment is not an F02 prerequisite. Ordinary PR/main CI must remain credential-free; PR jobs receive no publishing/deployment secrets or `id-token: write`.

Workflow YAML and its policy checker cannot make a repository secret inaccessible to a collaborator who can modify trusted workflows. Preserve the actual repository/workflow write controls and review proposed credential use; do not claim stronger external protection from a local validator. Where configured, environment controls or provider-supported OIDC can provide additional boundaries. Preserve those actual rules and require deployment smoke evidence before marking deployed. [GitHub environment controls](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [OIDC reference](https://docs.github.com/en/actions/reference/security/oidc)
