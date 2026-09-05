# View state and API mapping

`src/data/tarang.ts` maps Tarang's wire format to the objects consumed by `vendor/fraidycat/js/view.js` and `js/util.js`.

## Top-level state

Hyperapp state contains the `follows` module from `src/store/follows.js` and router `location` with `pathname`, `previous`, `rendered`, and `hashRouting`. Hash routing keeps navigation within the static page.

| `state.follows` key | Meaning |
|---|---|
| `started` | False displays the loading screen. Set after the initial refresh attempt. |
| `all` | Follow objects keyed by string feed ID. |
| `settings` | Device-local display preferences. |
| `baseHref` | Empty string; assets use absolute paths. |
| `editing` | Follow draft used by the edit form. |
| `feeds` | Null; the multi-feed discovery picker is unused. |
| `updating` | Empty object; Tarang performs feed fetching. |
| `urgent` | Null; no upstream update prompt. |

## Settings

All settings are optional and stored under `tarangcat.settings` in localStorage.

| Key | Values | Effect |
|---|---|---|
| `sort-follows` | Unset, `createdAt`, `title` | Unset sorts by most recent post. The adapter supplies no `createdAt`, so that choice treats follows as equal. |
| `mode-updates` | Unset, `updatedAt` | Chooses the post date; both dates are equal in this adapter. |
| `mode-reposts` | Unset, `hide` | No effect because posts have no author field. |
| `mode-expand` | Unset, `all` | Expands every follow or truncates post lists. |
| `mode-theme` | Unset, `dark`, `light` | Automatic, dark, or light theme. |
| `mode-tab` | Unset, `_blank` | Link target; the control is hidden because `IS_WEBEXT` is false. |

## Follow

| Field | Tarang source or value |
|---|---|
| `id` | `String(feed.pk)`, also used in edit routes. |
| `url`, `feed` | Both use `feed.url`, the feed URL. |
| `title` | `feed.name`. |
| `category` | `feed.category.name`; omitted when category is null. |
| `importance` | Nearest refresh-interval tier. |
| `fetchesContent` | False; reader mode is not yet implemented. |
| `posts` | `feed.articles` mapped to Post objects; at most ten in the summary. |
| `activity` | Empty array; the view skips the sparkline. |

`isValidFollow` requires `url`, `feed`, and `id`. A Tarang integer primary key is safe in the edit route. An absent category places the follow on the home tab. Posts are always an array, including for an empty feed. `frago.sort` mutates `posts` and sets `sortedBy`, so follows must remain mutable. Every summary fetch creates a fresh object graph.

## Post

| Field | Tarang source or value |
|---|---|
| `id` | `String(article.pk)`. |
| `title` | `article.title`, with `(untitled)` for empty or null titles. |
| `url` | `article.url`. |
| `publishedAt` | `new Date((published_at ?? retrieved_at) * 1000)`. |
| `updatedAt` | Same Date as `publishedAt`. |

Tarang timestamps use Unix seconds. The view requires Date objects for sorting and time display. Streaming status badges are not emitted because Tarang parses feeds without the upstream scraping layer.

## Writes and refresh intervals

Feed creation uses `POST /tarang/v1/feed`. A category name is resolved with `POST /tarang/v1/category/{name}`; a 409 triggers a category-list lookup. Blank category input produces `category_id: null`. Feed edits use `PATCH /tarang/v1/feed/{id}` with the category ID and refresh interval. A blank edit title leaves the existing name unchanged. Deletion uses `DELETE /tarang/v1/feed/{id}`.

| Importance | Refresh interval in seconds |
|---|---|
| `0` | 300 |
| `1` | 3600 |
| `7` | 21600 |
| `30` | 43200 |
| `365` | 86400 |

The adapter displays the nearest tier for intervals set by another client. Tarang's scheduler uses `refresh_interval` and `next_poll_at` for polling. Writes are followed by `GET /tarang/v1/summary`. No client sync bookkeeping or separate snapshot service is required.

## Unused view paths

The multi-feed discovery picker, `/add-feed` route, and `actions.follows.subscribe` are not reached because Tarang accepts an exact feed URL. `state.follows.feeds` remains null. `CAN_ARCHIVE` is false and the reader route is removed because there is no per-feed content-fetch setting wired to the view.

Activity sparklines require a per-day aggregate endpoint. A paginated article endpoint would not supply that aggregate. OPML import/export and article read/starred state are not implemented.
