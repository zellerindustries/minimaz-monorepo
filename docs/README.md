# Documentation

- [Getting Started](getting-started.md) — clone, install, build, test, and run the CLI locally.
- [Architecture](architecture.md) — the package graph, build pipeline, config system, and CLI, for developers.
- [Contributing](CONTRIBUTING.md) — code conventions, the validation gate, and how to open a pull request.
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md) — how to report a vulnerability.

## Packages

Each package, toolkit, and internal tool has its own README with install/usage/API detail:

| Package                                       | What it does                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| [`@minimaz/core`](../packages/core)           | Filesystem utilities shared across the ecosystem.                             |
| [`@minimaz/logger`](../packages/logger)       | Minimal, performance-oriented structured logger.                              |
| [`@minimaz/markdown`](../packages/markdown)   | Dependency-free Markdown parser with HTML/PDF renderers.                      |
| [`@minimaz/css`](../packages/css)             | Dependency-free CSS minifier and `@import` bundler.                           |
| [`@minimaz/js`](../packages/js)               | Dependency-free JavaScript minifier.                                          |
| [`@minimaz/ts`](../packages/ts)               | TypeScript/TSX transpiler via the `typescript` compiler.                      |
| [`@minimaz/json`](../packages/json)           | Dependency-free JSON parse/minify/format.                                     |
| [`@minimaz/validate`](../packages/validate)   | Structural validators for CSS, HTML, JS, TS, and JSON.                        |
| [`@minimaz/html`](../packages/html)           | HTML minifier, plus `@minimaz/validate`'s HTML validator re-exported.         |
| [`@minimaz/config`](../packages/config)       | Loads and validates `minimaz.config.json`.                                    |
| [`@minimaz/templates`](../packages/templates) | Manages the global `~/.minimaz` directory and template CRUD.                  |
| [`@minimaz/cli`](../packages/cli)             | Library implementing the `minimaz`/`mz` commands.                             |
| [`@minimaz/sitekit`](../toolkits/sitekit)     | The published `minimaz`/`mz` binary, wrapping `@minimaz/cli`'s commands.      |
| [`@minimaz/builder-tools`](../tools/builder)  | Internal `esbuild` bundler for every package's publish output. Not published. |

Project status and the `minimaz-cli` migration checklist are internal working ledgers, not published docs — see
[`.claude/status.md`](../.claude/status.md) and [`.claude/migration.md`](../.claude/migration.md).
