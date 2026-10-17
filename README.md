# Browser VR Engine

A reusable browser world and game engine for desktop and VR. The development plan covers graphics, solid physics, avatars, editable worlds, broad asset conversion, shared state, spatial audio, presentations and media. The separate conference application is [XLR8](https://github.com/neophilism/XLR8).

**Current stage: workspace foundation with F02 CI tooling.** The SDK metadata package builds and can be imported by a standalone consumer. CI/evidence and package-install checks are implemented; hosted acceptance is recorded separately in the progress ledger. Rendering, VR, physics, networking and media remain planned until their implementation and qualification units pass. The engine is completed before XLR8 implementation begins.

## Develop

Use the pinned Node 24 version in `.nvmrc` and npm:

```sh
npm ci --ignore-scripts
npm run check
npm run example:sdk
npm run test:consumer
npm run test:sharding
```

`npm run check` validates the plan and evidence references, checks package/workflow boundaries, performs the baseline credential scan, builds TypeScript and runs required package/tooling tests. `test:consumer` installs the built tarball outside the workspace. `npm run check:dependencies` queries the npm registry; `npm run ci:local` runs the full foundation sequence and records a local preview. See [CI and merge procedure](docs/ci/README.md) for scopes, failure behavior and evidence identity.

## Project records

- [Complete development plan](DEVELOPMENT_PLAN.md): approved units with dependencies and acceptance criteria.
- [Architecture](ARCHITECTURE.md): repository boundaries and the complete approved design.
- [Handoff](HANDOFF.md): current state and next dependency.
- [Acceptance](ACCEPTANCE.md) and [progress](docs/progress.json): verified implementation and release evidence.
- [Deployment](docs/deployment.md) and [security](SECURITY.md): operational and trust-boundary requirements.

## Capability goals

Creators will import, convert, edit, reuse and export assets and entire worlds. Sound emitters can follow birds, avatars, waterfalls, music objects and video screens. Lower graphics profiles preserve traversal, presentation readability and shared state. Engine examples must run without conference accounts or event APIs.

The proposed modular stack is qualified against existing Hubs/Spoke and VRSpace functionality before the final foundation decision. Existing working subsystems are retained when they satisfy the same requirements with less sustainable work.

## Distribution

Original workspace packages are private and UNLICENSED at bootstrap; no public license grant has been added for the owner's code. Third-party components retain their own licenses and notices. Selected source versions, necessary forks and distribution obligations are recorded by F07.
