# Foundation evaluations

These are isolated, runnable comparisons using the frozen F03 contracts and original assets. They are outside the production workspace graph. F06 selects one runtime foundation after the required qualification evidence is available; this directory does not introduce two production engines.

| Evaluation | Demonstrated work | Remaining qualification |
| --- | --- | --- |
| [Hubs / Spoke](hubs-spoke/README.md) | Pinned Hubs typecheck/unit/build; real Spoke loading, numeric editing, correctly attached collision proxies, video dimensions, native GLB export and native-project reload. | Hubs services and common runtime scenario, full multiuser/media/ownership behavior, GLB runtime roundtrip, resolved upstream audit, physical devices and performance. |
| [Babylon / VRSpace](babylon-vrspace/README.md) | Real rendering/animation, local solid physics and interactions, simultaneous spatial tracks, attached video audio, browser edits, limited GLB import/export and actual upstream AssetLoader reuse. | Complete engine lifecycle/world semantics, full shared state/media, physical XR/audio, measured AV offset and target-device workloads. |

Each package has its own pinned dependencies and explicit reproduction instructions. The root dependency audit alone does not cover these separate graphs. The required `engine-evaluations` CI job installs and audits both toolkits, runs F04's mapping/patch/evidence checks against the pinned Spoke source, and builds and executes F05's real Chromium suite. Current CI does not rerun the complete Hubs/Spoke service stack or qualify physical devices. Retained earlier browser/build results remain historical evidence, identified by their original source fingerprints.

Run the same evaluation job locally with `node scripts/ci/evaluate.mjs --local`. An existing Chromium can be selected through `CHROME_EXECUTABLE`; that local reuse is recorded explicitly and cannot establish hosted acceptance. A normal hosted run installs the matching Playwright Chromium. Reports are written under `artifacts/evaluations`, bound to source, nested locks, shared inputs and actual command outcomes.

The synthetic courtyard is a functional comparison fixture. It is not a capacity benchmark for the referenced Acropolis venues, architectural models or detailed animals. Workload/device templates and unperformed requirements remain visible in the F03 protocol and candidate reports. Import, editing, conversion and export remain full engine goals; limits in an isolated evaluation importer do not define the production asset pipeline.
