# Read cached articles

Click an article title in a feed's post list to open the reader. It displays the article content returned by Tarang's summary API. The reader does not fetch or extract the publisher's page. Open original opens the source URL in a new tab.

The toolbar provides these device-local preferences:

| Control | Choices | Default |
|---|---|---|
| Font | IBM Plex Serif, Inter, iA Writer Duospace | IBM Plex Serif |
| Size | Small (17px), Medium (20px), Large (24px) | Medium |
| Appearance | System, Light, Dark | System |

Appearance is shared with the feed list. Font and size apply to the article body. Code blocks use iA Writer Duospace. All fonts load from the deployment's static files; no font service is contacted. The [font reference](../vendor/reader-fonts/README.md) records sources and licences.

Back to feeds returns to the article's category and importance group. Escape performs the same navigation when focus is outside a select or text input. Browser Back and Forward also work. Article heading and footnote links scroll within the reader without changing its route.

The reader keeps the open article in memory while it is displayed, so periodic summary refreshes cannot remove the text mid-read. Leaving the reader releases that copy. A reloaded or bookmarked reader route (`#!/view/{article-id}`) can only resolve articles in the current summary, which contains the latest ten articles per feed. An absent article displays an unavailable message. Try again refetches the summary, including after an API connection failure.

If cached content is empty, the reader displays the summary and labels it as such. If neither is available, it displays a missing-content message and retains the source link when the URL is valid. The reader does not mark articles read or starred.

## Article formatting

The reader preserves headings, lists, images, tables, quotes, code, and text emphasis. DOMPurify removes scripts, event handlers, publisher styles, forms, SVG, and embedded frames. IDs are rewritten before insertion to prevent conflicts with app elements. Relative links and image URLs resolve against the original article URL. Links accept HTTP, HTTPS, and mailto; images accept HTTP and HTTPS. External links open with no referrer and no opener access. Images can load from their source servers and also omit the referrer.

## Browser checks

Install dependencies and the test browser once:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

Run `pnpm test:browser`. The suite builds and serves the app on port 8097 and mocks Tarang's API. It covers navigation, content sanitization, cache fallback, API failure recovery, font loading, saved preferences, and narrow layouts. Screenshots and failure traces are written to ignored `test-results/`.

An installed browser can be selected through `PLAYWRIGHT_CHANNEL`, for example `msedge`. In PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
pnpm test:browser
```
