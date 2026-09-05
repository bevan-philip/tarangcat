# Architecture

Tarangcat runs as static browser code. The Hyperapp view is vendored from Fraidycat v1.1. The adapter in `src/data/tarang.ts` maps Tarang's summary response into the view's follow and post objects.

Tarang owns feed, article, and category data in SQLite. Feed and category writes go directly to the API, followed by a summary refetch. The browser keeps the current summary in memory and display preferences in localStorage. Tarang's scheduler fetches feeds independently of the browser. Feed-list refreshes retrieve the current summary every minute, on focus or visibility changes, and when returning to a feed list. Reader, edit, add, and settings routes skip summary requests.

A feed has one optional category. Importance maps to its refresh interval. An unassigned feed appears on the home tab. The summary contains previews of up to ten articles per feed, without full content or GUIDs; the interface has no article pagination. Edit forms load `/tarang/v1/feed/{id}` directly and resolve assigned category names through `/tarang/v1/category`. The feed endpoint also returns article previews, which the edit form discards.

Activity sparklines require a per-day aggregate endpoint and remain deferred. OPML import/export and article read/starred state are not implemented. The [in-app reader](reader.md) loads cached content on demand from `/tarang/v1/article/{id}`. It sanitizes article HTML with DOMPurify and keeps a copy of the open article until the reader closes. Bookmarked reader routes resolve articles independently of the summary. If the feed is absent from memory, the reader also loads its metadata for the source label and back link.
