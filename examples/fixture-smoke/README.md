# Standalone fixture consumer

From the repository root, run `npm run build` followed by `npm run example:fixtures`.

This small Node consumer imports the public contracts, fixture helper API and fixture-data subpath exports. It validates a world and scenario, resolves the real glTF file through an explicit local asset catalog, verifies its content digest, replays the scenario, and checks resource cleanup.

Its expected qualification result is `incomplete`: a logical tracing adapter does not establish browser, service, physical-audio or headset evidence. The example neither starts a renderer nor connects to an application account or provider. The same `index.mjs` can run in a separate directory with the two packed packages installed.
