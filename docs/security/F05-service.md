# Released-service follow-up review

This record covers the isolated VRSpace released-service evaluation and the proposed local automation supervisor. It supplements the [foundation integration review](F04-F05.md). It is a separate assistant self security review after implementation, informed by additional read-only assistant reviews. It is not independent human approval or full upstream/server security qualification.

## Boundaries reviewed

- The official released executable is fetched from its exact pinned URL and verified before execution. The unmodified client, repository notice and executable dependency/license inventory are retained. The release is distinct from the master AssetLoader test; the repository's Apache-2.0 license does not describe every bundled component.
- The profile binds HTTP, WebSocket and embedded database endpoints to loopback, allows the exact frontend origin, limits synthetic guest sessions, and disables unused authentication, media, AI and Elasticsearch integrations. Guest evaluation behavior is not production authorization.
- The frontend serves the explicit fixture/resource allowlist, including the sibling audio worklet. Unknown files, configuration paths and destination-style escapes fail before an upstream request. Browser requests and CSP are limited to the local frontend and service socket.
- Child environments exclude provider, publishing, GitHub and registry credentials. No secret value or private participant/model content is part of the retained evidence. No paid provider call was made.
- Process operations require compatible Linux interfaces. Recorded shutdown pins a kernel process handle and checks creation identity and the exact task-specific executable/configuration arguments before signaling. It cannot use a stale record to signal a reused PID.
- Retained artifacts contain source, original synthetic test evidence and small reports/images. They exclude executable JARs, browser binaries, dependency directories, upstream checkouts and database state.

## Findings resolved in the implementation

Earlier review found integrity checks implemented with Python assertions, cleanup beginning too late after child creation, interruptible or unbounded shutdown, malformed ownership records being treated as exited processes, and frontend failure paths retaining listeners. The revised manual launcher uses explicit exceptions under optimized Python, establishes ownership immediately after `Popen`, defers repeated signal requests to bounded TERM/KILL cleanup, reaps its child, validates malformed records, checks the process namespace, and attempts both listener closures on failure. `run-clean.py` uses `exec` to preserve the intended signal target. These changes have focused optimized-Python regressions and separate real service/browser evidence.

Final browser-runner review found that late page/socket errors or failed requests could be present after the last check while the final status stayed successful. The corrected runner evaluates final error/request/cleanup state after closure. New deterministic cases exercise late failures; corrected-source actual server/browser evidence is identified by the index.

The proposed automation verifier separately trusted a passed report without inspecting `observed.cleanupErrors`. It now rejects nonempty or malformed cleanup errors, requires fatal errors to be absent/null, validates the observations object and log-entry shape, and tests contradictory reports whose earlier counts/statuses still pass. It also requires the corrected runner's completed finalization with zero error counts and two final client observations with empty error lists. Seven verifier methods are recorded separately from the unperformed supervisor lifecycle methods.

A final read-only assistant review found no remaining blocker in the corrected manual finalization path or the proposed verifier changes. The corrected-source manual results are 14 optimized launcher checks, 15 finalization cases and nine actual two-browser checks, with 20 matching source fingerprints and zero final errors. Review and manual test success do not resolve the separate automation and CI gates below.

## Explicit unresolved gates

The generic command supervisor adds child-subreaper, pidfd and procfs-child enumeration requirements to clean up detached descendants even when a stage leader exits first. Its actual lifecycle test methods have not passed in the available environment. They must execute on a compatible Linux host before this supervisor can be relied on. The completed manual launcher tests do not resolve that gap.

Fresh service dependency auditing and full automation are blocked by the [automatic approval-review rejection](evaluation-audit-egress.md). The separate service graph has no required hosted CI job yet. Before merge, complete the supervisor tests, audit, complete automation, current-candidate required CI evidence, a head-bound review and the ordinary merge/main verification procedure. This review does not waive those gates or convert the proposal into accepted F05 work.

This local guest-presence test has not established upstream authentication/authorization security, resistance to malicious client updates, server-authoritative physics/ownership, tenant isolation, durable world/identity recovery, shared media, real headset behavior or production load. Missing evidence remains in the progress ledger. No audit was bypassed, no credentials were requested for hypothetical integrations, and no XLR8 implementation was started.
