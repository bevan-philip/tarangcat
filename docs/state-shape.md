# State shape: what the vendored view expects

Derived by reading `vendor/fraidycat/js/view.js` line by line, plus `js/util.js` where the
view delegates. This is the contract `src/data/tarang.ts` has to satisfy. Adapted from
boocat's `docs/state-shape.md` (same upstream view, different backend); the "How Tarang
maps onto this" section below is the tarangcat-specific part.

## Top-level hyperapp state

```js
{
  follows: { … },   // the module below, src/store/follows.js
  location: { pathname, previous, rendered, hashRouting }   // @kickscondor/router
}
```

`location` comes from `@kickscondor/router`'s `location({hashRouting: true})`. Hash
routing keeps the app a single static file.

### `state.follows`

| Key | Type | Used by | Notes |
|---|---|---|---|
| `started` | boolean | root view | Falsy renders the loading screen and nothing else. |
| `all` | `{[id]: Follow}` | `ListFollow`, `EditFollowById` | The whole follow list, keyed by id. |
| `settings` | object | `Setting`, `ListFollow` | Device-local display prefs; see below. Never sent to Tarang. |
| `baseHref` | string | every `<img>` | Prefix for asset URLs. tarangcat uses `''` (assets are absolute paths). |
| `editing` | Follow draft | `FollowForm` | Mutated in place by the form; `save` receives it. |
| `feeds` | `{list, site}` | `AddFeed` | Upstream's multi-feed discovery picker. **Never populated** — see "What's deliberately unreachable" below. |
| `updating` | `{[id]: {done, startedAt}}` | root view | Drives the progress bar. tarangcat leaves it `{}`; the server does the fetching. |
| `urgent` | `{note, approve()}` \| null | root view | Upstream's auto-update nag. tarangcat leaves it null — there's no token to expire. |

`settings` keys the view reads (all optional, all client-local, all `localStorage`):

| Key | Values | Effect |
|---|---|---|
| `sort-follows` | unset \| `createdAt` \| `title` | Sort order within an importance bucket. Unset = most recent post first. tarangcat never sets `createdAt` on a follow, so this option sorts everything as equal. |
| `mode-updates` | unset \| `updatedAt` | Which post date to sort/display by. Tarang has no separate "updated" time, so `updatedAt` always equals `publishedAt` — this setting is a no-op here, kept only because the view reads it unconditionally. |
| `mode-reposts` | unset \| `hide` | Hide posts whose `author` differs from the follow's `author`. tarangcat never sets `author` on a post, so this is also inert. |
| `mode-expand` | unset \| `all` | `all` expands every follow's post list; unset uses the `trunc` class. |
| `mode-theme` | unset \| `dark` \| `light` | Sets `theme--auto` / `theme--dark` / `theme--light` on the root element. |
| `mode-tab` | unset \| `_blank` | Link target. Only offered when `IS_WEBEXT`, which is false here. |

### Follow

```js
{
  id:            "42",              // string; the Tarang feed's pk. Appears in #!/edit/:id.
  url:           "https://…/feed",  // Tarang's feed.url (the feed XML, not a site homepage)
  feed:          "https://…/feed",  // same value — see "id/url/feed" below
  title:         "Hacker News",     // feed.name; always set, there is no separate "site's own title"
  category:      "news",            // feed.category.name; absent means the home tab
  importance:    0,                 // nearest tier to feed.refresh_interval; see below
  fetchesContent: false,            // always false — no reader pane in this MVP
  posts:         [Post, …],         // feed.articles, already capped at 10 by GET /summary
  activity:      []                 // deferred — see "activity" below
}
```

Notes that bite:

- **Dates must be `Date` objects, not numbers or ISO strings.** `timeAgo`/`timeDarkness`
  do `Math.floor(from_time / 1000)`, and sorting compares with `>`. Tarang's
  `published_at`/`retrieved_at` are Unix *seconds*
  (`sqlx`'s `unixepoch()`); `src/data/tarang.ts` converts to `Date` on the way in.
- **`follow.category` must be absent when the feed is unassigned.** The view treats an
  absent category as belonging to the home tab. `toFollow()` only sets the key when
  Tarang's joined `feed.category` is non-null.
- **`follow.id` must be URL-safe**: it lands in `#!/edit/:id` unescaped. A Tarang `pk` is
  a positive integer, so `String(feed.pk)` is always safe.
- **`isValidFollow`** (`util.js`) requires `follow.url && follow.feed && follow.id` — all
  three, not just `url`. tarangcat sets `feed` to the same string as `url` since Tarang
  has only one URL per feed (no separate site-URL vs. feed-URL the way Miniflux/boocat
  distinguish `site_url` from `feed_url`).
- A follow whose `posts` is not an array is fine; it renders with no post list. tarangcat
  always sends an array (possibly empty).
- `frago.sort` mutates `follow.posts` in place and stamps `follow.sortedBy`. The state
  passed to the view must therefore be mutable plain objects, not frozen ones —
  `fetchSummary()` returns a fresh object graph on every call, so this is automatic.

### Post

```js
{
  id:          "9",          // Tarang article pk, as a string
  title:       "…",          // falls back to "(untitled)" — Tarang allows a null title
  url:         "https://…",
  publishedAt: Date,
  updatedAt:   Date          // always equal to publishedAt — see settings['mode-updates'] above
}
```

`Status` (upstream's "currently streaming" badges, from its scraping layer) is never
emitted — Tarang has no scraping layer, only RSS/Atom/JSON Feed parsing.

## How Tarang maps onto this

This is the mapping the implementation plan worked out; `src/data/tarang.ts` is the code
that carries it out.

| Fraidycat concept | Tarang equivalent | Notes |
|---|---|---|
| `follow` | a `feed` row (via `GET /tarang/v1/summary`) | `follow.id` ↔ `feed.pk`, `follow.url`/`follow.feed` ↔ `feed.url` |
| `follow.title` | `feed.name` | One field, no separate "feed's own title" fallback. Editing the title PATCHes `feed.name`. Leaving the edit form's title blank means "don't change the name" (see `editFollow` in `tarang.ts`), not "revert to a discovered title" — Tarang never discovered one. |
| `follow.category` | the joined `category` in `GET /tarang/v1/summary` | Tarang permits at most one optional category per feed. Creates resolve the category and send `category_id`; edits PATCH `category_id`, including `null` to clear it. |
| `follow.importance` | `feed.refresh_interval` (seconds) | `0→300s, 1→3600s, 7→21600s, 30→43200s, 365→86400s`, adapter-side only (`IMPORTANCE_TO_INTERVAL` in `tarang.ts`). The *displayed* importance is the nearest tier to whatever `refresh_interval` currently is, so a value set some other way (direct DB edit, a future bulk-import tool) still displays sensibly instead of erroring. Tarang's scheduler (`src/sync.rs` in the `tarang` repo) already keys off `refresh_interval`/`next_poll_at`, so this tier actually drives polling — unlike Miniflux, which has no per-feed interval. |
| `follow.posts[]` | `articles[]` embedded per feed in `GET /tarang/v1/summary` | Already capped at 10 server-side, matching Fraidycat's own `POSTS_IN_MAIN_INDEX` — no gap to paper over. |
| `follow.activity` | — | **Deferred.** `toFollow()` always sets `activity: []`; `sparkpoints()` in `view.js` treats a missing/empty array as "nothing to draw" and skips the sparkline rather than erroring. A follow-up would add a dedicated aggregate endpoint (`GROUP BY date(published_at)` per feed) rather than a paginated article-listing endpoint — nothing in this UI browses articles page-by-page. |
| `follow.editedAt`, sync bookkeeping | — | Not needed. Tarang's DB is the only copy of the follow list; there is no multi-device sync layer or CAS sidecar to reconcile against. |

## What's deliberately unreachable

The vendored `view.js` still contains a couple of upstream/boocat code paths that
tarangcat's adapter never triggers, left in place because removing them would mean
forking more of the view than necessary:

- **`AddFeed` (the multi-feed discovery picker) and `actions.follows.subscribe`.**
  Boocat's Miniflux backend can return "this site has several feeds, pick one" from a
  single site-URL POST. `POST /tarang/v1/feed` has no such concept — it fetches the exact
  URL you give it as a feed, full stop. `addFollow()` in `tarang.ts` therefore never
  produces an "ambiguous" result, `state.follows.feeds` is never populated, and the
  `/add-feed` route is never navigated to. The `AddFollow` form's copy was rewritten to
  say so plainly (`vendor/fraidycat/VENDORED.md`, tarangcat modification #3).
- **`follow.fetchesContent`** stays `false` for every follow (`CAN_ARCHIVE = false` in
  `view.js` hides the "Read here?" checkbox), and the reader route (`/view/:id`) and its
  `#app/reader/pane.js` import are removed outright rather than left dark, since Tarang
  has no per-feed setting to drive a checkbox that would otherwise do nothing.
