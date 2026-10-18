# Third-party code and notices

The evaluation's authored project files retain the engine repository's current `UNLICENSED` package designation. That designation does not replace the licenses of bundled or installed third-party code.

| Component | Pinned version/source | License and retained notices |
| --- | --- | --- |
| Babylon core, loaders, serializers | 9.30.0 | Apache-2.0; `licenses/Babylon-LICENSE.md` and the core package's `licenses/Babylon-NOTICE.md`. |
| Rapier compatibility package | 0.21.0 | Apache-2.0; `licenses/Rapier-LICENSE`. |
| VRSpace AssetLoader | Commit `61f840a3dd0133fc9d357891f37eb1670b147539`, `babylon/js/core/asset-loader.js` | Apache-2.0; upstream `vendor/vrspace/LICENSE`, unmodified module, and exact provenance in the same directory. |
| esbuild | 0.28.2 | MIT; `licenses/esbuild-LICENSE.md`. Build tool only. |
| IWER and gl-matrix | IWER 2.6.0; gl-matrix 3.4.4 | MIT; `licenses/IWER-LICENSE` and `licenses/gl-matrix-LICENSE.md`. Test-only injected runtime; its reference-offset adapter is disclosed in `XR_SESSION.md`. |
| WebXR Layers Polyfill | 1.1.0 | Apache-2.0; `licenses/webxr-layers-polyfill-LICENSE`. Transitive IWER test dependency; layer installation is disabled in this harness. |
| Playwright | 1.62.1 | Apache-2.0; `licenses/Playwright-LICENSE`, `licenses/Playwright-NOTICE`, `licenses/Playwright-ThirdPartyNotices.txt`. Test tool only. |

The complete npm graph is pinned in `package-lock.json`; installed packages retain their own notices. No browser binary is distributed in this source bundle. The historical Chrome archive URL, version and digest are metadata, not a browser redistribution. F03's original synthetic fixtures are read from their owning engine package and are not duplicated here.

The VRSpace module is the only vendored runtime source. Its bytes are unchanged from the recorded commit. The adaptation changes the importing URL and supplies the evaluated Babylon namespace at one explicit compatibility boundary; it does not claim that the remainder of VRSpace was extracted, tested or relicensed.

The portable-world evaluation explicitly bundles the public checked contracts source with TypeBox 0.34.52 (MIT). Its exact package URL and integrity are in `source-pins.json`; the complete installed upstream license is retained in `licenses/TypeBox-LICENSE`. Carrier test content is derived only from the repository-generated frozen F03 fixtures; no privately obtained model or provider output is included.
