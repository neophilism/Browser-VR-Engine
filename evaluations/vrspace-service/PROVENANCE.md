# Exact candidate provenance

| Item | Pin / observation |
| --- | --- |
| Release | [VRSpace v0.8.7](https://github.com/jalmasi/vrspace/releases/tag/v0.8.7), published 2026-03-03 |
| Release commit | `ca0e02ce611e1435e87dcec79de05fd2970dfc2d` |
| Official binary | [server-0.8.7-executable.jar](https://github.com/jalmasi/vrspace/releases/download/v0.8.7/server-0.8.7-executable.jar), 228,055,892 bytes |
| Binary SHA-256 | `e5f0ba53f492d07e0f978ae1e15afce9fed2b3632a2d5984c48f3ab27d8004b3`, verified against the [official release metadata](https://api.github.com/repos/jalmasi/vrspace/releases/tags/v0.8.7) |
| Client | [babylon/js/client/vrspace.js at the release commit](https://github.com/jalmasi/vrspace/blob/ca0e02ce611e1435e87dcec79de05fd2970dfc2d/babylon/js/client/vrspace.js), copied byte-for-byte as `vendor/vrspace/client.js` |
| Client SHA-256 | `05b50269527e2f55095da07fbc767416477cd7eb788be28ac933354e8d7be867`, 39,785 bytes |
| Upstream source edits | None to the released JAR or client. The local adapter, loopback frontend and sterile Spring profile are separate evaluation code. |
| Binary build metadata | Full commit matches the release commit; `git.dirty=false`; build version 0.8.7; build time 2026-03-03T10:43:21Z |
| Embedded versions | Spring Boot 3.5.8, Neo4j 5.26.21, OpenVidu Java client 2.32.1, Spring AI 1.1.2; unused integrations disabled by the evaluation profile |
| Different F05 candidate | Master AssetLoader commit `61f840a3dd0133fc9d357891f37eb1670b147539` belongs to the earlier module-reuse test. This release test provides no success claim for that master server. |

The official digest binds the downloaded executable. The embedded build commit is upstream self-reporting and corroborates the release tag. An independent reproducible build from source was not performed.

The profile's component boundaries were checked against these release sources:

- [NeoConfig](https://github.com/jalmasi/vrspace/blob/ca0e02ce611e1435e87dcec79de05fd2970dfc2d/server/src/main/java/org/vrspace/server/config/NeoConfig.java): embedded database and local Bolt binding.
- [WebSocketConfig](https://github.com/jalmasi/vrspace/blob/ca0e02ce611e1435e87dcec79de05fd2970dfc2d/server/src/main/java/org/vrspace/server/config/WebSocketConfig.java): socket path, exact allowed origin and HTTP session handshakes.
- [ServerConfig](https://github.com/jalmasi/vrspace/blob/ca0e02ce611e1435e87dcec79de05fd2970dfc2d/server/src/main/java/org/vrspace/server/config/ServerConfig.java): guest/world creation and session limit properties.
- [StreamManager](https://github.com/jalmasi/vrspace/blob/ca0e02ce611e1435e87dcec79de05fd2970dfc2d/server/src/main/java/org/vrspace/server/core/StreamManager.java): OpenVidu disabled when its configured URL/secret are `none`.
- [OllamaConfig](https://github.com/jalmasi/vrspace/blob/ca0e02ce611e1435e87dcec79de05fd2970dfc2d/server/src/main/java/org/vrspace/server/config/OllamaConfig.java) and [ElasticSearchSessionListener](https://github.com/jalmasi/vrspace/blob/ca0e02ce611e1435e87dcec79de05fd2970dfc2d/server/src/main/java/org/vrspace/server/connect/ElasticSearchSessionListener.java): optional integrations are conditional. Spring's otherwise-default Elasticsearch auto-client is also excluded.
- [Enter](https://github.com/jalmasi/vrspace/blob/ca0e02ce611e1435e87dcec79de05fd2970dfc2d/server/src/main/java/org/vrspace/server/dto/Enter.java), [Session](https://github.com/jalmasi/vrspace/blob/ca0e02ce611e1435e87dcec79de05fd2970dfc2d/server/src/main/java/org/vrspace/server/dto/Session.java) and [SessionManager](https://github.com/jalmasi/vrspace/blob/ca0e02ce611e1435e87dcec79de05fd2970dfc2d/server/src/main/java/org/vrspace/server/core/SessionManager.java): actual realm/session command flow and socket cleanup.

## License boundary

The [release repository license](https://github.com/jalmasi/vrspace/blob/ca0e02ce611e1435e87dcec79de05fd2970dfc2d/LICENSE) is Apache-2.0 and is retained beside the vendored client. The executable bundles Neo4j 5.26.21; its own `META-INF/LICENSE.txt` explicitly identifies GNU GPL version 3 and a commercial-agreement alternative. Other transitive libraries carry their own notices. `evidence/release/build-and-license.json` records the exact embedded license-file hashes and `jar-inspection.json` inventories the actual executable dependencies.

The overlay ships only evaluation source, the unmodified client and license, and small evidence files. The server artifact is downloaded separately from upstream and verified. Repository licensing must not be generalized to the complete executable, and this presence evaluation is not a complete redistribution-license or dependency-security clearance.
