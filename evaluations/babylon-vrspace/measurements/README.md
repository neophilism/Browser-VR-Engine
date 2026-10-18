# Native coordinate and distance measurements

This isolated F05 extension is prepared from `a017afcfcf10eb1ae188fc883cdd040c1518566d`. It does not change the candidate renderer, F03 fixtures, existing browser subsets, workflow, or service helpers. `profile.json` was written before collecting browser samples. Its exact bytes and the current candidate, measurement, workspace and build sources accompany each run.

The profile describes numerical **loaded static anchors** and **continuous native distance attenuation**. The three imported glTF bars provide the actual vertex buffers and native world matrices for six face-center anchor readings. The reference origin and endpoints are independently declared in the profile; the existing static-anchor limit is 1 mm. Measured bar lengths are retained without inventing an additional scale tolerance.

The four corner sources retain one shared spatial graph. Center calibration measures paired source/post-distance-gain samples before HRTF and retains the frozen 0.1 dB equal-distance balance gate. Actual keyboard-driven physics then moves the listener outward and back through the 10–14 m fade region. The test records native listener/source parameters, simulation/render progress and every paired worklet window. It requires complete in-order windows and route coverage, positive source input, a falling distance-normalized fade envelope, and exact digital zero in complete outside-cutoff windows. Each one-meter bin uses its middle complete window, with an envelope interval derived from native position bounds and the paired sample gain bounds. Adjacent bin intervals must resolve a decrease; overlap is inconclusive and fails the measurement. This is not a chosen numeric error tolerance. The reference-law residual is reported without adding a new curve-error tolerance. A graph source can continue running while its correct spatial gain is zero.

The profile's one-second functional audio warmup is not a performance workload. This test does not execute the frozen 60-second warmup and three 180-second samples, report ordinary-device performance, establish perceived smoothness or localization, or measure physical output latency. Direct `AudioParam.value` updates retain the candidate's observed update cadence; the test does not add ramps to improve a result.

## Commands

From `evaluations/babylon-vrspace` after the ordinary locked install and build:

```sh
node measurements/run.mjs unit
node measurements/run.mjs browser
node measurements/run.mjs verify artifacts/measurement-runs/run-REPLACE
```

The runner uses the existing filtered environment. `CHROME_EXECUTABLE` may select an installed browser; otherwise the existing Playwright browser installation is used. Reports are written to unique ignored `artifacts/measurement-runs/run-*` directories. Browser/API errors, failed requests, missing or overflowing observations, changed source/build/fixture bytes, or incomplete cleanup prevent a passing run. The actual owned browser is force-closed when a native evaluation exceeds its deadline. Final status is taken after browser/server closure and current-source verification. Existing desktop/XR/portable commands remain unchanged.

The six-file evidence set contains the report, summary, raw loaded vertices/matrices, every paired audio window/native pose, a rendered coordinate screenshot and exact build metadata. The independent verifier rejects missing or extra files, symlinks, changed hashes, malformed PNG content, altered current sources, false hardware/A-V claims and discrepancies between the report and recalculated raw measurements. It executes no downloaded artifact code. Failed runs remain in their own directories; a verifier rejection does not delete their observations.

## A/V remains incomplete

The unchanged wall seed has a visible frame number, a 1 kHz pulse in the first tenth of each source second, 30 fps video and 48 kHz Vorbis audio. Its encoded duration is 2.003 seconds, and the generator's volume expression evaluates by audio frame. A nominal timestamp or a `seeked` event therefore cannot supply the actual offset.

A later bounded A/V implementation must identify decoded marker pixels, bind the native element to the wall's rendered frame, and timestamp that wall source after its panner through an analysis-only tap before shared mixing. It must retain actual sample frames, marker epochs, browser output-clock mapping and uncertainty through playback, the prescribed 1-second seek and a real loop. The full supported offset interval must fit within ±80 ms after the declared warmup. Missing marker/clock precision remains incomplete. It must preserve the one native media-element audio route and cannot replace the seed, soundtrack or clock. Physical display/speaker/headphone timing remains a separate gate.

No browser result exists merely because this profile and harness have been prepared. Actual source-bound results and review are reported separately; F05 remains unqualified.
