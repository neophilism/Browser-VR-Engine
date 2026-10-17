# Browser VR Engine

A reusable browser world and game engine for desktop and VR. The development plan covers graphics, solid physics, avatars, editable worlds, broad asset conversion, shared state, spatial audio, presentations and media. The separate conference application is [XLR8](https://github.com/neophilism/XLR8).

**Current stage: F01 workspace foundation.** The SDK metadata package builds and can be imported by a standalone consumer. Rendering, VR, physics, networking and media remain planned until their implementation and qualification units pass. The engine is completed before XLR8 implementation begins.

## Develop

Use Node 24 and npm:

```sh
npm ci
npm run check
npm run example:sdk
```

`npm run check` validates the complete plan, checks package boundaries, builds TypeScript and runs available implementation tests. F02 adds hosted CI and immutable evidence retention.

## Project records

- [Complete development plan](DEVELOPMENT_PLAN.md): all 145 units with dependencies and acceptance criteria.
- [Architecture](ARCHITECTURE.md): repository boundaries and the complete approved design.
- [Handoff](HANDOFF.md): current state and next dependency.
- [Acceptance](ACCEPTANCE.md) and [progress](docs/progress.json): verified implementation and release evidence.
- [Deployment](docs/deployment.md) and [security](SECURITY.md): operational and trust-boundary requirements.

## Capability goals

Creators will import, convert, edit, reuse and export assets and entire worlds. Sound emitters can follow birds, avatars, waterfalls, music objects and video screens. Lower graphics profiles preserve traversal, presentation readability and shared state. Engine examples must run without conference accounts or event APIs.

The proposed modular stack is qualified against existing Hubs/Spoke and VRSpace functionality before the final foundation decision. Existing working subsystems are retained when they satisfy the same requirements with less sustainable work.

## Distribution

Original workspace packages are private and UNLICENSED at bootstrap; no public license grant has been added for the owner's code. Third-party components retain their own licenses and notices. Selected source versions, necessary forks and distribution obligations are recorded by F07.
