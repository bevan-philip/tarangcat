# Vendored Fraidycat v1.1

Tarangcat uses Fraidycat's view, stylesheet, fonts, and images. The JavaScript contains local adaptations for ESM, esbuild, and Tarang. Local changes are marked `MODIFIED (tarangcat)`.

| Property | Value |
|---|---|
| Upstream | https://github.com/kickscondor/fraidycat |
| Branch | `v1.1` |
| Commit | `dd011d15c82f6d09e647d5fed016a769e31a681c` |
| Version | 1.1.10 |
| Vendored on | 2026-08-15 |
| Licence | Blue Oak Model License 1.0.0; `LICENSE.md` is copied verbatim. |

The upstream `master` branch contains an incomplete Fraidycat 2 rewrite. Use the pinned v1.1 commit when comparing or updating files. Images are real image files, resolved from upstream Git LFS through `media.githubusercontent.com`.

## Files and modifications

| Local path | Upstream path | Local changes |
|---|---|---|
| `LICENSE.md` | `LICENSE.md` | None. |
| `js/view.js` | `src/js/view.js` | ESM imports, app asset maps, local emoji picker, keyed route roots, Tarang forms and settings, direct feed loading for edit routes, article state controls, starred-list navigation, and the category bulk-feed panel. |
| `js/util.js` | `src/js/util.js` | ESM imports and browser URL resolution. |
| `js/sparkline.js` | `src/js/sparkline.js` | ESM export and comment wording. |
| `js/compare.js` | `src/js/compare.js` | ESM export; currently unused. |
| `js/frago.js` | `src/js/frago.js` | ESM export. |
| `css/fraidy.scss` | `src/css/fraidy.scss` | None. |
| `fonts/*.woff2` | `src/fonts/*` | None; eight files. |
| `images/*` | `src/images/*` | None; 25 files. |

Storage, browser-extension, Electron, Dat, background, popup, manifest, social definitions, and scraping modules are excluded. The build uses esbuild and Dart Sass in place of Parcel and node-sass.

The view accepts one optional category per feed. Add Follow accepts a feed URL or a discoverable website/profile URL; Tarang resolves it and supplies the saved feed metadata. The settings route contains credits; unsupported import/export controls are removed. The `/view/:id` route renders the app reader outside the Fraidycat page layout. `CAN_ARCHIVE` remains false, hiding the per-feed content checkbox. Tarang provides article content through its article endpoint but has no per-feed crawler setting. Keyed route roots force lifecycle hooks to run when routes change. Post links open the reader for follows with `fetchesContent`, which the adapter sets to true. Reader fonts are separately vendored under `vendor/reader-fonts/`.

App-specific style changes belong in `src/styles/overrides.scss`, which compiles after the upstream stylesheet.

## Update the vendored files

1. Fetch the pinned upstream commit into a separate checkout. Resolve Git LFS assets before copying images.
2. Compare the upstream paths listed above with the current vendored files.
3. Apply the ESM, URL resolution, asset, emoji, route, and Tarang adaptations to updated JavaScript. Copying upstream JavaScript alone does not produce a working build.
4. Keep the upstream licence and verify fonts and images are binary files, not LFS pointer text.
5. Run `pnpm test`, `pnpm typecheck`, and `pnpm build`. Check feed lists, category navigation, add/edit forms, and settings in a browser.
6. Update the pinned commit and modification table when the upstream version changes.
