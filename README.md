# tarangcat

Tarangcat is a web RSS client that uses Fraidycat's interface and Tarang's API. It groups feeds by category and importance, and sorts them by recent activity. Tarang stores feeds and articles; the browser stores display preferences.

## Documentation

- [Tutorial: run locally](docs/tutorial.md)
- [How-to: deploy](docs/deployment.md)
- [How-to: read cached articles](docs/reader.md)
- [Reference: configuration and commands](docs/configuration.md)
- [Explanation: architecture](docs/architecture.md)
- [Reference: vendored Fraidycat files](vendor/fraidycat/VENDORED.md)

## Requirements

Node.js 20.11 or later, pnpm, and a running Tarang instance with the `/tarang/v1` API are required. Tarangcat builds to static files in `dist/`.

## Development checks

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```
