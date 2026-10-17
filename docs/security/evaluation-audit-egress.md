# Dependency audit approval blocker

On 2026-10-17 automatic approval review rejected a fresh F05 `npm audit` request. The stated reason was that it would disclose a repository-derived dependency inventory to the public npm registry without an explicit end-user instruction authorizing that destination and payload. The action was not executed. The same audit must not be triggered indirectly through a wrapper or GitHub Actions while this rejection remains unresolved.

An offline inspection of the installed npm 11.9.0 implementation and lockfiles then established the concrete payload. A second, direct audit request supplied that evidence to approval review and was also rejected: public package names and omission of credentials/root-package metadata did not remove its requirement for explicit end-user authorization. No further audit attempt followed.

## Concrete request for approval

Allow the engine's dependency audits to send the locked package names and versions to `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`, with related public-package advisory metadata fetched from that registry. These checks send dependency metadata, not source code, models, meeting content or provider credentials. The scoped evaluation commands use empty npm configuration files and credential-filtered child environments.

The [offline payload record](evaluation-audit-payloads.json) contains the actual proposed name/version inventories from this checkout. It was produced by npm's `AuditReport.prepareBulkData()` over `Arborist.loadVirtual()` with offline mode; no registry request was made for this inspection. It is a payload review, not a vulnerability scan or passing audit.

- F04: 94 bytes, four public package names.
- F05: 1,161 bytes, 35 public package names.
- Foundation workspace: 1,267 bytes, including the five engine/example workspace package names and versions as well as public third-party dependencies. npm omits the root package but does include these workspace packages.

Payload sizes describe npm 11.9.0's uncompressed JSON inspection, not HTTP headers or a promise that another npm version emits byte-identical requests. The intended permission covers this package name/version audit for the engine's evolving lockfiles, locally and in its reviewed CI workflow.

## Work that continues

Local compilation, package/tooling tests, browser checks, source and fixture integrity verification, code review and preparation of a reviewable branch can continue. Diagnostic reports explicitly mark both evaluation audits blocked and overall completion false. Earlier successful audits retain their historical timestamps and source identities.

The required audit stages remain in the workflow. They are not deleted, stubbed, converted to warnings or replaced with old reports. Creating a pull request would trigger that workflow, so PR creation, current-candidate hosted acceptance and merging wait for the specific approval above. This is an audit egress gate; it does not require any new AI-provider credential and does not change engine capabilities.
