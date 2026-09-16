# tarangcat

tarangcat is a [vibe-coded](https://simonwillison.net/2025/Mar/19/vibe-coding/) modification of [Fraidycat v1.1](https://github.com/kickscondor/fraidycat) to use [Tarang](https://github.com/bevan-philip/tarang) as the backend, with some additional features thrown on top to make it more convenient for me to use.

Everything here downwards is all LLM-speak. You've been warned.

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
