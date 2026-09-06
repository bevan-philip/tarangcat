# Read cached articles

Click an article title in a feed's post list to open the reader. It displays the article content returned by Tarang's `/tarang/v1/article/{id}` API. The reader does not fetch or extract the publisher's page. Open original opens the source URL in a new tab.

Middle-click or Ctrl/Cmd-click an article title to open the original URL in a new tab. The link's context-menu actions and Copy link address also use the original URL. An ordinary click or Enter opens the internal reader.

The toolbar provides these device-local preferences:

| Control | Choices | Default |
|---|---|---|
| Font | IBM Plex Serif, Inter, iA Writer Duospace | IBM Plex Serif |
| Size | Small (17px), Medium (20px), Large (24px) | Medium |
| Appearance | System, Light, Dark | System |

Appearance is shared with the feed list. Font and size apply to the article body. Code blocks use iA Writer Duospace. All fonts load from the deployment's static files; no font service is contacted. The [font reference](../vendor/reader-fonts/README.md) records sources and licences.

Back to feeds returns to the article's category and importance group. Escape performs the same navigation when focus is outside a select or text input. Browser Back and Forward also work. Article heading and footnote links scroll within the reader without changing its route.

The reader keeps the open article in memory while it is displayed, so periodic summary refreshes cannot remove the text mid-read. Leaving the reader releases that copy. A reloaded or bookmarked reader route (`#!/view/{article-id}`) loads the article directly, including articles outside the latest ten previews per feed. Loading displays a progress message. An absent article displays an unavailable message. Try again retries the article request after a failure. Leaving the route prevents a pending request from replacing the next article.

If cached content is empty, the reader displays the summary and labels it as such. If neither is available, it displays a missing-content message and retains the source link when the URL is valid.

## Read state and starred articles

Opening an article in the reader marks it read through `PATCH /tarang/v1/article/{id}`. Middle-click and modifier-click on an article title also mark it read when opening the original URL. Browser context-menu navigation cannot be observed by the app and does not update read state. Article link dimming follows Tarang's read flag. Browser history does not determine the colour.

The star button beside each article title and in the reader toggles its saved state. The top-right star opens the starred list at `#!/starred`. This list uses `GET /tarang/v1/starred`, including older articles outside the feed summary. The API must return `article_id`, `feed_id`, feed name, preview fields, and read/starred flags. Opening a saved article fetches its content through the article endpoint. Back to starred articles and Escape return to the saved list.

Read and starred state remain in Tarang across devices. Visible lists refresh every minute, on navigation, and when the browser regains focus or visibility. Failed state updates retain the last confirmed state and show a retry button. Writes to the same article run in sequence so a read update cannot overwrite a star update.

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
