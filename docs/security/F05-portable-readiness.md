# F05 portable media readiness — separate self security review

Review date: 2026-10-18. Reviewer: the primary assistant in a separate review after the actual local browser sequence and changed-path unit/verifier checks. This is an assistant self review, not independent human approval. A parallel source review also checked the observation semantics.

## Reviewed change

PR9's candidate passed its required checks, but subsequent main run `39166555145` failed `portable-media-and-animation-bindings` after twelve seconds. Its original report did not retain the before/last operands. The exact historical failing operand cannot be recovered. The source nevertheless exposed two concrete observation defects: a looping time comparison could become impossible near the clip boundary, and the latest short audio-pulse window had to coincide with otherwise independent animation and clock observations.

The repair records those progress facts independently within the original twelve-second wait. It samples every 50 ms, retains at most 256 plain observations, and preserves the before/last samples and milestone indices. A wall pulse must be an actual complete, fresh, finite paired worklet window after the baseline audio frame, with input RMS above the original `0.01` threshold and no invalid/dropped frames. Physics must advance, the same named animation must advance its native frame and move more than 1 mm, the context must advance more than 0.2 seconds, and the same looping video must advance decoded frames and more than 0.1 seconds of observed media time. The final observation still requires running audio, playing animation and unpaused/non-seeking video.

The elapsed media-time calculation is a bounded functional observation with no seek or playback control during sampling. Missed complete loops can undercount progress. It is not a clock synchronization measurement or evidence for the separate 80 ms audiovisual requirement.

## Identity and checks

| Source | SHA-256 |
| --- | --- |
| `evaluations/babylon-vrspace/test/media-progress.mjs` | `8bdffae6e8fa5e9ebe24d1a9647442929e42d5b09ec20932e4df2c4536c28d00` |
| `evaluations/babylon-vrspace/test/media-progress.test.mjs` | `fdf79b69fd5161892ec213d9cac0356fdf6fbedff127c8e67bd5c14fe78380ec` |
| `evaluations/babylon-vrspace/test/portable-browser-checks.mjs` | `29aa77005d9e74f022e4116821745c3dad5c576377cbb8f756839b2070f1860a` |
| `scripts/ci/evaluate.mjs` | `5ebb0e261c38d2b295a2540109bff4f4167bd0894de9744528e1ac599cbdb00c` |

Fourteen synthetic logic regressions cover the loop boundary, a positive pulse followed by silence, stale/invalid/dropped/nonfinite windows, stalled subsystems, pending metadata, copied observations and the storage ceiling. They test the observer, not a device. The actual canonical local run passed desktop 19/19, emulated XR 10/10, portable 9/9, all 94 evaluation unit cases and both toolkit audits. Fifty-four independent carrier-verifier cases passed. Original reports are in [the local receipt](../evidence/portable-readiness-local-2026-10-18/index.json).

I separately read the final helper, its regressions, the harness diff and the source/command inventory changes after those runs. The native trace retained five samples: the final wall window was silent, while an earlier fresh positive window had been observed. This directly exercises the corrected observation behavior.

## Trust boundaries and result

Only the isolated test harness and its evidence source inventory change. No creator-supplied script, executable carrier content, production credential, permission bypass or external content endpoint is added. The helper samples the existing validated native worklet history and additionally checks finite frame/RMS data. It stores plain copies, releases the returned Playwright handle, and the existing browser/server finalizer remains mandatory. Invalid inputs, observation overflow, timeout and finalization errors remain failures.

Both new helper files are required in the thirty-file current-source binding and the unit command. The fifteen renderer inputs, eight workspace inputs and four outputs retain their existing semantics. The runtime, frozen F03 inputs, required desktop/XR/service lanes, workflow and shared process helpers are unchanged. The 172 original PR9 candidate/main report files are retained byte-for-byte with archive digests and their actual different outcomes.

The final integrated foundation sequence also passed all six stages, 39 package tests and 350 tooling tests with zero skips. The retained report inventory and documentation were rechecked before publication.

**Result:** no remaining blocker within this observation repair. Exact-head hosted checks, downloaded-artifact verification, expected-head merge and subsequent main verification remain required. F04/F05 qualification, physical devices, shared authority and performance remain incomplete.
