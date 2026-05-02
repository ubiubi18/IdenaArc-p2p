# Third-Party Notices

This repository is a bundled community research workspace, not a single-license
upstream project. Review this file before preparing a public release.

| Component                                             | Path                               | License / notice                                                                                                            |
| ----------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Active desktop app fork from upstream `idena-desktop` | `main/`, `renderer/`, root scripts | MIT. Keep the original 2020 Idena copyright notice. See `LICENSE` and `LICENSES/MIT.txt`.                                   |
| Community AI benchmark/helper modifications           | `main/`, `renderer/`, root scripts | MIT. Copyright 2026 ubiubi18 and contributors. Created as prompt-driven community research work; not independently audited. |
| Idena node source mirror                              | `idena-go/`                        | LGPL-3.0. Created locally by `npm run setup:sources` from the pinned source manifest.                                        |
| Idena wasm Go binding mirror                          | `idena-wasm-binding/`              | LGPL-3.0. Created locally by `npm run setup:sources` from the pinned source manifest.                                        |
| Idena wasm runtime source mirror                      | `idena-wasm/`                      | Created locally by `npm run setup:sources` from the pinned source manifest. Verify upstream license metadata before release. |
| `idena.social` smart-contract snapshot                | `vendor/idena.social-contract/`    | MIT. Copyright 2025 N3CR0M4NC3R. Keep `vendor/idena.social-contract/LICENCE` in redistributed source bundles.               |
| `idena.social-ui` source snapshot                     | `vendor/idena.social-ui/`          | MIT. Copyright 2025 N3CR0M4NC3R. Used to build the bundled in-app Social view snapshot. Keep its `LICENCE` file in place.  |
| Sample flip data                                      | `samples/flips/`                   | Research sample material bundled for reproducibility. Verify distribution constraints before public dataset redistribution. |

## Release Notes

- Keep component license files in place when distributing this bundle.
- Do not describe the entire repository as MIT-only.
- Do not remove the original Idena MIT copyright notice from upstream desktop
  code.
- The 2026 ubiubi18 MIT notice covers community modifications to the extent the
  contributors own those modifications; it does not relicense LGPL components.
- Large static libraries in `idena-wasm-binding/lib/` are source-mirror outputs,
  not tracked release payloads.
- Chunked FLIP-Challenge rehearsal samples should be generated or imported
  locally with `npm run setup:flips` instead of tracked as public release data.
- Source releases should document `npm run setup:sources` and the pinned
  manifest before asking users to build the managed node runtime.
