# Browser VR Engine

A reusable browser world and game engine for desktop and VR. The development plan covers graphics, solid physics, avatars, editable worlds, broad asset conversion, shared state, spatial audio, presentations and media. The separate conference application is [XLR8](https://github.com/neophilism/XLR8).

**Current stage: F03 is accepted; the F04/F05 foundation comparisons are in progress.** Three packages provide SDK metadata, versioned contracts/reference math, and an original reproducible test world. The isolated [foundation evaluations](evaluations/README.md) add real editor, rendering, physics, spatial-audio and import/export experiments. Their remaining service, world-semantics and physical-device requirements are recorded explicitly; they are not yet the selected production engine. The engine is completed before XLR8 implementation begins.

## Develop

Use the pinned Node 24 version in `.nvmrc` and npm:

```sh
npm ci --ignore-scripts
npm run check
npm run example:all
npm run test:consumer
npm run test:sharding
```

`npm run check` validates the plan and evidence references, checks package/workflow boundaries, performs the baseline credential scan, builds TypeScript and runs required package/tooling tests. `test:consumer` installs all three built tarballs outside the workspace and verifies the locked validation dependency before installation. `npm run check:dependencies` queries the npm registry; `npm run ci:local` runs the full foundation sequence and records a local preview. See [CI and merge procedure](docs/ci/README.md) for scopes, failure behavior and evidence identity.

The [qualification protocol](docs/qualification/f03.md) defines the shared courtyard, animated creature, movable props, four audio corners, wall video and required observation methods. `npm run example:fixtures` verifies assets and logical scenario replay. It deliberately reports qualification as incomplete because logical replay cannot establish browser, service or headset behavior.

The separate required `engine-evaluations` job installs and audits both evaluation toolkits, checks the pinned Spoke adaptation, and builds and runs the current Babylon/VRSpace desktop, emulated XR and portable-world subsets in thirteen explicit stages. `node scripts/ci/evaluate.mjs --local` reproduces its diagnostic stages using an existing browser selected through `CHROME_EXECUTABLE`. Local execution records its browser-install omission and cannot produce hosted acceptance evidence. See each evaluation's README for full upstream reproduction and missing qualification.

The [Hubs runtime diagnostic](docs/evidence/F04-runtime.md) adds a separate manual Ubuntu workflow for the pinned Hubs, Reticulum, Dialog and PostgreSQL combination. PR8's integration and main checks passed, and all six candidate/main artifacts were independently verified. It retains failed audits and independently checks owned-resource cleanup. Its backend and nine native two-browser checks remain unexecuted until an actual signed-in manual dispatch; committing the runner does not qualify that foundation.

The [released VRSpace service follow-up](evaluations/vrspace-service/README.md) retains historical two-browser guest presence, pose and reconnect observations. Its separate required `engine-service-evaluation` job runs all nine automation methods, 14 launcher cases, 15 finalization cases, a fresh renderer build and the full released-server automation, including this third package's actual dependency audit. [PR7's reviewed XR, observation and startup corrections](docs/evidence/F05-XR.md) passed all four required jobs on both the corrected candidate and subsequent main run. All three artifacts from each run were downloaded, digest-checked and independently verified. The earlier PR6 main failure, first PR7 integration failure and local process-interface limitation remain recorded. These passed subsets do not complete foundation or physical-device qualification.

The [portable authored-world follow-up](docs/evidence/F05-portable.md) reconstructs an edited world in a fresh browser context from one bounded carrier containing all original assets, hierarchy, colliders, animation and spatial media bindings. PR9 passed its candidate checks and merged, but its subsequent main run failed one media-readiness observation (portable 8/9). The [readiness repair](docs/evidence/F05-portable-readiness.md) retains all original failed reports and passed a new local sequence of 19 desktop, ten emulated XR and nine portable checks. Its current-head hosted checks and main verification remain required. This evaluation format and its bounded media catalog do not limit the planned general import/conversion pipeline.

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

## Generated objects and NPCs

The [generation and funding design](docs/architecture/npc-generation-and-funding.md) covers multiview images, Rodin model generation, Meshy rigging/animation, conversational personas, private persistent memory, spatial speech and freeze/resume. G01–G16 implement the general engine mechanisms. C27–C41 implement XLR8 credits, subscriptions, admin exemptions, NPC slots and subscriber operating subsidies after the complete engine release. These are planned capabilities.
