# Accepted foundation evaluation tooling

[PR #5](https://github.com/neophilism/Browser-VR-Engine/pull/5) integrated the isolated foundation toolkits after separate security review, current-candidate checks and downloaded-artifact verification. It was merged on 2026-10-18. This accepts the tooling integration; F04/F05 remain blocked on their complete qualification requirements and F06 is not selected.

| Receipt | Identity |
| --- | --- |
| Reviewed head | `dbc55adbcecfdb83d0e53c7c2a1e0b3e6510f863` |
| Base | `64c3dbfc8818c4ebaac64f94103f26815e539c96` |
| Tested merge | `b55a9132f929b17265d283a3cde1ca65a47d86a7` |
| Tested tree | `3d810a00fac0ce671cce6fc5551f1bc6282743e8` |
| Passing PR run / attempt | [39147840501](https://github.com/neophilism/Browser-VR-Engine/actions/runs/39147840501) / 1 |
| Separate head-bound self review | `5563983238`, no unresolved blocking source finding |
| Observed squash merge | `bec6cb1f36256c9bafd8504bb6111733c8e6f858` |
| Passing main run / attempt | [39148025401](https://github.com/neophilism/Browser-VR-Engine/actions/runs/39148025401) / 1 |

All six foundation stages and all eleven evaluation stages passed. This includes 39 package tests, 136 tooling tests, two standalone hosts, an external consumer of three packed packages, sharding, nine F04 toolkit tests, the 68-file historical-integrity check, 30 F05 tests and 19 actual Chromium checks. The root and both toolkit audits reported zero advisories. The separate upstream Hubs graph was not covered by those three audits.

Both artifacts were downloaded, their archive digests checked against GitHub, and their files verified with the checked-in verifiers from the clean reviewed checkout. The tested merge's two parents and tree were independently read from GitHub. Before merging, current head/base, all three required jobs and artifact-upload outcomes, review state and clean mergeability were rechecked. Main's resulting tree matched the reviewed tree, and all three applicable main jobs completed successfully.

The [retained acceptance receipt and unchanged artifact contents](foundation-evaluations-ci-39147840501/index.json) include foundation artifact `12144012002` (SHA-256 `a18720c9d3834cfe14435de55827c4d43672ebb66754e37247a0217236487683`) and evaluation artifact `12144003393` (SHA-256 `96f4345533217ab2337ab8dce9b4dda2c6a865d62bbc9c2dbed5c71efc18f703`). The actual browser run `run-ga5ya8` completed 2026-10-18T17:04:29.516Z–17:04:46.659Z, with report SHA-256 `0b428c3b1b41c870187de7efae89bce3e04a12f0f74667fdf77ddd904e60d042`: 19 passed, zero failures/page errors/failed requests, 19 source fingerprints, 11 build inputs and three build outputs.

The [first hosted run](foundation-evaluations-ci-39147325398/index.json) failed one keyboard movement check and correctly blocked acceptance. The revised check records real key delivery and simulation progress without changing its movement requirement. Its [diagnostic record](../../evaluations/babylon-vrspace/REVIEW_FIX.md) distinguishes the unknown exact cause from the improved observation. Neither failed nor passing historical artifacts were relabeled as another source revision.

The owner-authorized registry egress is resolved. Actual service automation, full shared-world/media/ownership/roundtrip behavior, target-device workloads and physical headset/audio observations retain their own gates. This integration supplies no deployment, physical hardware, live provider or production-capacity qualification. XLR8 and all generation/funding implementation remain later work.
