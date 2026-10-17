# 0001 Engine first workspace

Date: 2026-10-17. Status: accepted sequencing and repository decision.

The owner supplied `neophilism/Browser-VR-Engine` and `neophilism/XLR8` and instructed us to complete the engine before the application layer. The full 145-unit approved plan is retained. C01 receives R12 as an additional sequencing dependency; no engine capability is removed or promoted to completed by this change.

The workspace uses Node 24, npm workspaces, ESM and a pinned TypeScript compiler. Initial SDK exports identify the package; later cards implement the actual runtime. Source packages and services can be added as their prerequisites pass without creating conference dependencies.

The owner of this repository is neophilism. The public repository location does not itself establish an open-source license grant for original code. Original packages are private and marked UNLICENSED at bootstrap; third-party source and binaries retain their own required notices. F07 records selected dependencies and distribution obligations before release. This does not restrict the owner's commercial use or the engine's import/export capabilities.

No services are deployed by F01. An initialization commit establishes the default branch, and implementation proceeds through reviewed PRs.
