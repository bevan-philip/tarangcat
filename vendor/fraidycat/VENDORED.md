# Vendored: Fraidycat v1.1

The tarangcat interface *is* Fraidycat's interface. These files are copied from upstream
rather than reimplemented, so the diff against upstream stays legible.

Seeded from `boocat`'s already-modernized copy (CommonJS→ESM, Parcel→esbuild,
node-sass→dart-sass), not fetched fresh from upstream — see "Re-vendoring" below for why
that matters. `js/view.js` then received a second, smaller round of edits on top of
boocat's, replacing the Miniflux/Boocat-specific bits with Tarang equivalents (or removing
them, where Tarang has no equivalent). Every edit is marked `MODIFIED (boocat)` or
`MODIFIED (tarangcat)` at its site, so both rounds stay legible independently.

| | |
|---|---|
| Upstream | <https://github.com/kickscondor/fraidycat> |
| Branch | `v1.1` (**not** `master` — master is an abandoned, incomplete "Fraidycat 2" rewrite) |
| Commit | `dd011d15c82f6d09e647d5fed016a769e31a681c` |
| Upstream version | 1.1.10 |
| Vendored via boocat on | 2026-07-30 |
| Re-vendored into tarangcat on | 2026-08-15 |
| Licence | Blue Oak Model License 1.0.0 — see `LICENSE.md` (copied verbatim from upstream) |

Images are stored with git-lfs upstream. They were fetched at the pinned commit through
`media.githubusercontent.com` (the endpoint that resolves LFS pointers) by boocat's original
vendoring pass, so the files here are real image bytes, not pointer stubs.

## Files taken

| Path here | Upstream path | Modified? |
|---|---|---|
| `LICENSE.md` | `LICENSE.md` | no |
| `js/view.js` | `src/js/view.js` | yes (boocat, then tarangcat) |
| `js/sparkline.js` | `src/js/sparkline.js` | yes (export form only, via boocat) |
| `js/util.js` | `src/js/util.js` | yes (via boocat) |
| `js/compare.js` | `src/js/compare.js` | yes (export form only, via boocat) |
| `js/frago.js` | `src/js/frago.js` | yes (export form only, via boocat) |
| `css/fraidy.scss` | `src/css/fraidy.scss` | no |
| `fonts/*.woff2` (8 files) | `src/fonts/*` | no |
| `images/*` (25 files) | `src/images/*` | no |

Deliberately **not** taken (same set boocat excluded): `storage.js`, `js/webext/*`,
`js/electron/*`, `js/dat/*`, `background.js`, `popup.js`, `manifest.json`,
`defs/social.json`, and anything referencing `fraidyscrape`, `electron-*` or `parcel`.

## Modifications

### `js/view.js` — inherited from boocat

See `js/view.js`'s `MODIFIED (boocat)` comments for the full list (module system, glob
imports, emoji picker, the reader route, keyed route roots, and the Miniflux
import/export UI). The short version: everything needed to run this file outside a Parcel
1 / desktop-app build, plus a reader pane and a Miniflux-settings backup/restore flow that
boocat added on its own backend.

### `js/view.js` — tarangcat's own changes, on top of boocat's

1. **Reader pane removed.** The `#app/reader/pane.js` import and the
   `<Route path="/view/:id" render={ReaderPane} />` line are gone, and `CAN_ARCHIVE` is
   `false` (hiding the "Read here?" checkbox). Tarang stores full article content per
   entry, so a reader pane is feasible later, but it is out of scope for this MVP —
   see `docs/state-shape.md`.
2. **Import/Export section removed from Settings.** `ChangeSettings` no longer renders
   the JSON/OPML/HTML export buttons, the Miniflux-settings backup/restore block, or the
   file-import UI boocat had already stripped. None of it applies to Tarang and clicking
   an unwired button would have thrown (no `actions.follows.exportTo` etc. in
   `src/store/follows.js`). Settings is now just credits.
3. **Add-follow copy rewritten.** Boocat (via Miniflux) discovers a feed from a site's
   homepage URL; Tarang's `POST /tarang/v1/feed` fetches whatever URL it is given
   directly, as a feed. The blurb and the URL field's note now say so.
4. **Credits rebranded.** "Boocat" → "tarangcat", the Miniflux link → a mention of Tarang.
5. **Single optional category.** The original multi-tag form was reduced to one optional
   category because current Tarang stores one nullable `category_id` per feed. Blank input
   leaves the feed unassigned; the home tab remains the view fallback.

### `js/util.js`, `js/frago.js`, `js/sparkline.js`, `js/compare.js`

Unmodified from boocat's copies (see boocat's own `VENDORED.md` for boocat's edits to
these — module-system conversion only, no logic changes). `compare.js` is vendored for
parity with upstream's file set; nothing in this view imports it, same as in boocat.

### `css/fraidy.scss`, `fonts/*`, `images/*`

Unmodified. `src/styles/overrides.scss` is compiled after the vendored stylesheet, so this
file stays byte-identical to upstream.

## Re-vendoring

Re-vendor from boocat, not from upstream directly — upstream is CommonJS/Parcel 1 and
would need the whole module-system conversion redone before tarangcat's edits would even
apply cleanly.

```sh
# from boocat's repo, at the commit noted above:
cp -r boocat/vendor/fraidycat/{js,css,fonts,images,LICENSE.md} tarangcat/vendor/fraidycat/
# then re-apply the tarangcat-only edits to js/view.js (each marked
# `MODIFIED (tarangcat)` in the current file).
```
