# Desktop placement during XR preparation

This is a local regression repair based on PR7 head `18418567ea1edeb4758c5e1ec845499f9acea4e3`. The required hosted service job must verify the repaired candidate before acceptance. F05's full common-world and physical-device qualification remains incomplete.

## Observed failure and cause

Hosted run `39152832852` failed before its service browser checks: Alpha's `network.js:13` called `setPlayer` and received `Leave VR before using desktop teleport controls.` Beta joined. The original downloaded report is retained separately by the integration owner; its SHA-256 is `516afed52f114f052afe5e5dfec46e285181b939e480ae4a36b9339c8e6c6153`.

`load()` starts `xr.prepare()` without awaiting its optional capability/helper preparation. `boot()` then publishes `foundationReady`, which permits the service adapter to place its participant. The old `setPlayer` guard rejected `xr.busy`, including this pending preparation task even though no immersive session had been requested.

The deterministic negative control holds the first native `isSessionSupported` result open, then calls the real setter at both service spawn positions. Both reject with the exact reported error while `phase=preparing`, `active=false`, and native session requests remain zero. The browser's native support result is preserved and its methods restored after the observation. This control reproduced the state ordering without changing a browser capability result or adding a timer delay to the service.

## Repair and protected states

`XRSessionController.blocksDesktopPose` excludes capability/helper preparation. It includes the synchronous entry operation, pending entry/end tasks, an active native session and disposal. `setPlayer` and the Home/Center controls use this pose ownership guard. Entry already claims its operation before invoking entry hooks or making a native request.

Independent review found that a synchronous pre-request hook failure could retain that operation. The repair clears the failed operation before publishing a retryable error. A deterministic case covers both `beforeEnter` and requesting-state callback exceptions, zero native requests, desktop unlock, and a successful later entry/disposal.

The local tests also retain protection throughout requesting, cancelling, entering, immersive rendering, ending, unconfirmed native end, end refusal and disposal. The emulated browser calls the actual setter while requesting, cancelling and immersive; each rejects with unchanged camera/body. Import's existing preparation guard is retained because helper creation can allocate scene resources.

## Evidence

| Capture | Outcome | Meaning |
| --- | --- | --- |
| `negative-control`, `run-yHf1aX` | 18/19, exit 1 | Original runtime fails the new deterministic preparation/spawn regression. |
| `before-hook-cleanup-review` | 54 unit, 19 desktop, 10 emulated XR pass | Historical iteration before the independent pre-request cleanup finding. |
| `unit-tests.txt` | 55/55, zero skipped, exit 0 | Current-source registered regression cases. |
| `desktop`, `run-BmvAM7` | 19/19, exit 0 | Current-source desktop checks, including both real service spawn coordinates during held native preparation. |
| `xr`, `run-emwe5u` | 10/10, exit 0 | Current-source, explicitly emulated XR checks and actual setter rejection during session ownership. |

Both final browser reports have zero page errors, failed requests, overflow and finalization errors. `verification.json` records their hashes, run times, source identities and commands. All 23 source fingerprints, 12 build inputs and three output hashes were compared with the current checked files and match both reports. The five implementation/test files were reviewed separately by `asset_research`; the integration owner also reviewed the diff. The baseline credential filename/pattern scan and `git diff --check` passed.

An initial unit invocation after editing correctly rejected the stale compiled bundle. Rebuilding preceded the retained current-source passing results. That earlier invocation is recorded in `verification.json` and does not supply acceptance evidence.

These captures use Chromium `151.0.7922.34`, Playwright `1.62.1`, SwiftShader and the existing pinned test-only IWER runtime for the XR suite. Physical GPU, headset and audio qualification remain false. Dependency locks are unchanged; installed bytes were reused from the identical lock, with no new registry request or provider call. The real released-service integration remains for the required hosted candidate job.

## Reproduce

Run from `evaluations/babylon-vrspace`, with the pinned dependencies and an existing matching Chromium selected through `CHROME_EXECUTABLE`:

```sh
env -i PATH="$PATH" node run.mjs build
env -i PATH="$PATH" node run.mjs test-server
env -i PATH="$PATH" CHROME_EXECUTABLE=/absolute/path/to/chrome-headless-shell node run.mjs test
env -i PATH="$PATH" CHROME_EXECUTABLE=/absolute/path/to/chrome-headless-shell node run.mjs test-xr
```

The required hosted workflow installs its pinned browser and independently binds fresh service/evaluation artifacts to the actual tested candidate. Existing failed and passed captures remain immutable history.
