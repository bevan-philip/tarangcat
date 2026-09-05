# Configuration and commands

| Setting | Default | Meaning |
|---|---|---|
| `TARANG_API_BASE` | Empty string | Build-time API origin. Empty uses the page origin. API requests append `/tarang/v1/...`. |
| `tarangcat.settings` | Empty object | Browser localStorage key for display preferences. Never sent to Tarang. |
| Refresh interval | 60 seconds | Summary refetch interval in `src/store/follows.js`. Also refreshes on window focus and when the document becomes visible. |

| Command | Result |
|---|---|
| `pnpm build` | Replaces `dist/` with a minified production build. |
| `pnpm dev` | Builds with source maps and watches source and vendored JS/CSS. Reload the page after changes. |
| `pnpm serve` | Serves `dist/` on port 8080. |
| `node serve.mjs 9000` | Serves `dist/` on a custom port. |
| `pnpm test` | Runs the adapter tests. |
| `pnpm typecheck` | Checks TypeScript without emitting files. |

The build uses esbuild and Dart Sass. Output consists of `index.html`, content-hashed JavaScript and CSS under `assets/`, and copied `images/` and `fonts/`. The build targets Safari 15, Chrome 100, and Firefox 100 or later.
