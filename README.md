# tarangcat

Fraidycat's interface, fed from Tarang's API — a headless RSS reader (Axum + SQLite).
Validates that Fraidycat's recency-sorted, tag/importance-grouped follow list can sit
directly on top of Tarang's feed/article/category model, with no intermediate service.

The view layer is vendored from Fraidycat v1.1 (`vendor/fraidycat/`, seeded from
[boocat](../boocat)'s already-modernized ESM/esbuild copy — see
`vendor/fraidycat/VENDORED.md`), unchanged except for removing the pieces that only
made sense against a Miniflux backend (a reader pane, OPML import/export, a multi-feed
discovery picker). `src/data/tarang.ts` is the only real new code: it maps Tarang's
`GET /tarang/v1/summary` response onto the shape the vendored view expects
(`docs/state-shape.md`), and turns the view's `save`/`remove` calls into Tarang API calls.

Unlike boocat, there is no snapshot-rebuild service, no `follows.json` CAS sidecar, and no
service-worker cache-merge layer: Tarang's feed/category CRUD is synchronous against
SQLite, so a write followed by a refetch of `GET /summary` always sees the write. The client
just refetches on an interval and on tab focus.

## Prerequisites

A running Tarang instance (see the `tarang` repo). By default this build assumes it will
be served from the same origin as Tarang; for local development, point it at a
separately-running Tarang instance instead (Tarang's CORS is permissive).

## Develop

```sh
pnpm install
TARANG_API_BASE=http://127.0.0.1:3000 pnpm dev     # rebuilds dist/ on change
pnpm serve                                          # serves dist/ at :8080
```

## Build

```sh
pnpm build      # writes dist/ (TARANG_API_BASE defaults to '' — same-origin)
```

## Out of scope for this MVP

Activity sparklines (needs a per-day-count aggregate endpoint Tarang doesn't have yet),
OPML import/export, article read/starred state (the schema exists in Tarang but is unused
here — it's not a Fraidycat concept), and the in-app reader (Tarang stores full article
content per entry, so this is feasible later, just not built here). See
`docs/state-shape.md`, "What's deliberately unreachable".
