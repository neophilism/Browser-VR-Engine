# Browser VR Engine architecture

This repository owns application-neutral world/runtime contracts, rendering, VR, physics, avatars, assets, editing, networking, audio/media, persistence, and service deployment. [XLR8](https://github.com/neophilism/XLR8) is the separate conference application.

The approved default is Babylon.js, Rapier, Colyseus, LiveKit, and an extensible asset conversion pipeline. F04 and F05 qualify complete Hubs/Spoke reuse versus the modular default and VRSpace components. F06 records the final decision. No evaluated or proposed dependency is represented as implemented by the initial workspace.

## Boundaries

| Area | Responsibility |
| --- | --- |
| `packages/core` | General SDK entry point and subsequent runtime integration |
| Future contract/runtime packages | Versioned schemas, rendering, physics, input, avatars, audio, media and editor interfaces |
| Future services | Generic control API, world authority, collaboration, asset workers and media infrastructure |
| `examples` | Standalone consumers proving the engine does not require conference services |
| `docs/plan` and `docs/progress.json` | Full acceptance baseline and evidence-linked implementation status |

World data uses meters, right-handed axes and Y up. Rendered interchange assets and editable world bundles are separate formats. Durable authoring, live simulation, collaborative documents, and media each have a defined authority.

Every sound source can have an entity attachment and a listener-relative mix, including video soundtracks. Media access control is independent of acoustic distance.

See [the complete approved architecture](docs/architecture/approved-architecture.md) and [decisions](docs/decisions/0001-engine-first-workspace.md).

## Generated-object and NPC extension

The owner-requested [NPC generation and funding architecture](docs/architecture/npc-generation-and-funding.md) extends the complete plan by G01–G16 and C27–C41. Runtime identity, memory, spatial speech, provider jobs and metering belong to the engine; prices, wallets, subscriptions, administrator exemptions and operating subsidies belong to XLR8. R12 now includes the engine NPC qualification gate.
