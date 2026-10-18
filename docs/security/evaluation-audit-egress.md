# Dependency audit authorization

## Authorization granted on 2026-10-18

The owner answered **Yes** to the explicit request authorizing the engine's dependency audits to send package names and versions from its evolving lockfiles to `https://registry.npmjs.org`, both locally and in reviewed GitHub Actions CI. This resolves the destination/payload approval blocker recorded below. The authorization covers the foundation workspace and isolated engine evaluation/service graphs. It does not supply a passing audit result or waive any required CI, review, merge or qualification gate.

## Historical rejection and payload inspection

On 2026-10-17 automatic approval review rejected a fresh F05 `npm audit` request. The stated reason was that it would disclose a repository-derived dependency inventory to the public npm registry without an explicit end-user instruction authorizing that destination and payload. The action was not executed. No wrapper or GitHub Actions run was used to bypass that rejection before the owner's authorization.

An offline inspection of the installed npm 11.9.0 implementation and lockfiles then established the concrete payload. A second, direct audit request supplied that evidence to approval review and was also rejected: public package names and omission of credentials/root-package metadata did not remove its requirement for explicit end-user authorization. No further audit attempt followed during that blocked session.

## Approved destination and payload

The engine's dependency audits may send locked package names and versions to `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`, with related public-package advisory metadata fetched from that registry. The reviewed audit payload is dependency metadata. The scoped evaluation commands use empty npm configuration files and credential-filtered child environments; source code, models, meeting content and provider credentials are outside the approved payload.

The [offline payload record](evaluation-audit-payloads.json) contains the actual proposed name/version inventories from this checkout. It was produced by npm's `AuditReport.prepareBulkData()` over `Arborist.loadVirtual()` with offline mode; no registry request was made for this inspection. It is a payload review, not a vulnerability scan or passing audit.

- F04: 94 bytes, four public package names.
- F05: 1,161 bytes, 35 public package names.
- Foundation workspace: 1,267 bytes, including the five engine/example workspace package names and versions as well as public third-party dependencies. npm omits the root package but does include these workspace packages.

Payload sizes describe npm 11.9.0's uncompressed JSON inspection, not HTTP headers or a promise that another npm version emits byte-identical requests. The intended permission covers this package name/version audit for the engine's evolving lockfiles, locally and in its reviewed CI workflow.

## Execution and evidence

Fresh local and reviewed-CI audits can now run alongside compilation, package/tooling tests, browser checks, source and fixture integrity verification and code review. The earlier diagnostic reports retain their accurate blocked outcomes and incomplete status. Earlier successful audits retain their historical timestamps and source identities; new execution must produce new evidence.

The required audit stages remain in the workflow. They are not deleted, stubbed, converted to warnings or replaced with old reports. PR creation can trigger those authorized checks. Current-candidate hosted acceptance and merging still require actual successful results, a separate head-bound review, fresh mergeability checks and applicable main verification. This authorization requires no new AI-provider credential and changes no engine capability goal.
