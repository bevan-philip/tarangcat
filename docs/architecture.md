# Architecture

Tarangcat runs as static browser code. The Hyperapp view is vendored from Fraidycat v1.1. The adapter in `src/data/tarang.ts` maps Tarang's summary response into the view's follow and post objects. The [state reference](state-shape.md) defines that contract.

Tarang owns feed, article, and category data in SQLite. Feed and category writes go directly to the API, followed by a summary refetch. The browser keeps the current summary in memory and display preferences in localStorage. Tarang's scheduler fetches feeds independently of the browser. Client refreshes retrieve the current summary every minute and on focus or visibility changes.

A feed has one optional category. Importance maps to its refresh interval. An unassigned feed appears on the home tab. The summary contains up to ten articles per feed; the interface has no article pagination.

Activity sparklines require a per-day aggregate endpoint and remain deferred. OPML import/export and article read/starred state are not implemented. The [in-app reader](reader.md) displays cached content from the summary response. It sanitizes article HTML with DOMPurify and keeps a copy of the open article until the reader closes. It requires no additional API endpoint.
