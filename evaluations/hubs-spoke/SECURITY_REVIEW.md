# F04 scoped assistant self security review

This is an automated assistant self review of the portable evaluation code and evidence boundaries. It is not independent human approval, a production review of Hubs/Spoke, or F04 acceptance.

## Reviewed boundaries

- Source setup uses full public repository commits and original/patched manifest digests. Existing checkouts are verified and never reset. Unexpected tracked edits and untracked/modified dotenv/npm/Yarn configuration files are rejected. The exact Spoke patch is reproduced against the original files in a test.
- Upstream dependency installs use lockfiles and `--ignore-scripts`; the private toolkit is separate from the engine workspace dependency graph. Historical Git dependencies and a large source archive remain availability and maintenance risks. The Hubs dependency audit is explicitly a timeout, not a passing security result.
- Subprocesses use a named environment allowlist, explicit task npm/Git config files and caches, disabled interactive Git credentials/helpers, and TLS verification for outbound downloads. HOME/USERPROFILE are neither read nor repurposed. Provider keys, GitHub/npm auth variables, inherited Node options and broad process environments are excluded. Proxy and certificate-path variables are retained because the managed network requires them. Tests use synthetic sentinels to prove excluded values do not enter child environments.
- A nonzero exit, process error, signal or timeout cannot yield a passing command record. Logs and results are written to unique run directories, with failed-run evidence preserved. The browser server checks port ownership and verifies a unique project response, preventing an old local instance from being mistaken for the current run.
- The Spoke server binds to loopback. Browser HTTP traffic is restricted to the same local origin plus data/blob URLs, and service workers are disabled. Trust bypass is limited to the local evaluation server's self-signed HTTPS; it is not a global TLS-disable flag. No user/provider account or asset-marketplace credential is used.
- Only the frozen, synthetic F03 metadata and resource bytes are copied into temporary serving directories. Metadata/resource digest checks reject changed inputs and prevent asset symlinks escaping the fixture root. The tool is not advertised as a safe parser for arbitrary uploaded assets.
- The Compose preflight verifies the pinned init file and runs it only when its first missing-tool guard prevents service effects. If the tool exists, preflight stops before unpinned service clones or development credentials are used. No service, cloud resource or deployment is created.
- Evidence retains the observed software renderer, limitations, failed attempt and unresolved audit/service/headset gates. Native `.spoke` reload is distinguished from GLB reimport, and authored panner settings from actual audio/headset testing.

## Fixes made during this review

The original fixture mapping left model collision proxies as root siblings and double-applied video aspect ratio. The portable version parents each proxy beneath its prop and compensates Spoke's internal video-plane scale. Real browser checks cover both mappings before and after native project reload.

The first portable browser attempt used a numeric value selector that became stale when focus changed `0.60` to `0.6`. It failed and closed cleanly. The final runner uses the actual Position group, and the failed result remains separately labeled. The analytic test's template-root handling was also corrected: the native root has no components array.

Before handoff, explicit config/cache paths replaced the first launcher's temporary HOME/USERPROFILE assignment to respect workspace rules. Unexpected project npm/Yarn configuration is also rejected, and Yarn receives `--no-default-rc`, preventing existing local configuration from silently reintroducing credentials. Synthetic hostile-config and environment tests cover these boundaries.

## Remaining limits

Full upstream services, production defaults, authentication/authorization, dependency remediation, transitive-license obligations, untrusted asset isolation, and physical-device behavior are outside the demonstrated subset. The exported native project/GLB uses local media URLs and is not a complete distribution package. Source buildability does not establish production safety. F04 must remain blocked pending the evidence listed in `REUSE_ASSESSMENT.md`.
