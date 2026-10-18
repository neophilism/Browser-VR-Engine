# F05 native measurements: current local capture

The actual run `run-ajfa0U` passed all four declared checks on 2026-10-18, from 21:41:36.672Z to 21:41:50.016Z. It used Chrome 151.0.7922.34, Playwright 1.62.1 and SwiftShader. The profile was frozen before execution at SHA-256 `e86e58b943282bdf4f6becfb07a4309ffa0811dc96153066dc78e097103f1616`; the eight source files match published checkpoint `93ca0356e3f8a5347c6c645ecb51bc03f50db09a` / tree `a037293919b01da0cdf9985fe768daf2c9383518`.

## Observed result

| Measurement | Actual observation | Declared gate |
|---|---|---|
| Loaded coordinates | All three native mesh bars measured 1 m; maximum endpoint error 0.0000000238418579 m | At most 0.001 m |
| Four-corner balance | 22 overlapping paired windows; maximum measured difference 0.0000208767 dB and maximum per-sample bound 0.0000218237 dB | At most 0.1 dB |
| Outward / return fade | Native KeyW / KeyS movement crossed every 1 m interval between 10 and 14 m; each interval had 11–24 complete windows; representative conservative gain intervals resolved a decreasing fade with distance | Frozen bins; no added curve-error tolerance |
| Cutoff and source continuity | 43 complete outside-cutoff windows had exact digital zero, 175 complete inside windows remained positive, and 3 boundary-straddling windows were retained separately | Exact zero at and beyond 14 m; no premature inside silence |
| Native cleanup | Observer removed; nodes, bodies, URLs, sources, videos and held keys zero; AudioContext closed, scene disposed and physics freed | All owned resources released |

The raw record contains 361 consecutive paired windows for each of the four corner sources, 84 native pose observations and 73 rendered-frame observations at an actual 44,100 Hz audio sample rate. The largest native distance update was about 0.400 m, which is retained as a diagnostic. It is not a claim of perceptually smooth motion or audio. The measured native interval, including the terminal window flush, was 6,495 ms. The latest delivered window ended at frame 277248, before the final native clock at frame 277888.

There were no page errors, failed requests, observation overflows or finalization errors. The native activation record confirms an active user gesture and a completed transition from suspended to running. The runner closed its owned browser and loopback server before final status and source verification.

## Verification and history

The independent local verifier returned exit 0. It checked six fixed raw files, all leaf hashes and PNG structure, then recomputed all four results against 28 base sources, eight measurement sources, eight workspace inputs and the unchanged 15-input/four-output renderer build. It executes no downloaded artifact code. `measurement-verification-ajfa0U.json`, `browser-command.json` and `verify-command.json` retain the actual results and command timing. The 25-case focused unit receipt is preserved in the earlier development checkpoint; its source hashes match this capture.

Earlier outcomes remain unchanged in `../native-measurement-development/`: the initial sandbox loopback failure `run-1JPn3o`, the historical four-check success `run-IYy9uO`, and the later two-check failure `run-uwyHL0` caused by an immediate post-click read while native asynchronous activation was pending. The current readiness repair waits boundedly for observed running before the unchanged one-second warmup. It adds no runtime audio route, source, smoothing or tolerance.

## Scope still incomplete

This is a local software-rendered functional measurement, not full F05 qualification. Physical headset scale, physical headphone/speaker localization or latency, device-specific graphics/performance and the frozen full F03 performance workload remain unqualified. The unchanged 80 ms timed-marker picture/audio offset has not been measured and is not reported as zero. The same source video, native wall element and single audio route remain intact; a later A/V slice still needs actual picture-marker identification, wall-render timing, the isolated wall audio signal and a defensible clock/uncertainty interval.

No existing desktop19, emulated XR10, portable9, service helper, frozen F03 fixture, dependency graph or required workflow source was modified by this isolated measurement slice. Integration with later accepted sources and any hosted measurement gate require a new current-source build and execution.
