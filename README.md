# Minimaz Monorepo

An npm-workspace-based rewrite of [`minimaz-cli`](https://github.com/zellerindustries/minimaz-cli) into modular, independently-versioned `@minimaz/*` packages.

> **Status:** in progress, **not yet a replacement** for `minimaz-cli` — that remains the stable, published tool. See [`.claude/status.md`](.claude/status.md) for exactly what's working today versus what's still planned, and [`.claude/migration.md`](.claude/migration.md) for the full command-by-command migration checklist.

## Packages

| Package                                          | What it does                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@minimaz/core`](packages/core)                 | Filesystem utilities shared across the ecosystem.                                                                                                    |
| [`@minimaz/logger`](packages/logger)             | Minimal, performance-oriented structured logger.                                                                                                     |
| [`@minimaz/errors`](packages/errors)             | Shared top-level CLI error classification/handling (`KnownError`, `handleCliError`).                                                                 |
| [`@minimaz/markdown`](packages/markdown)         | Dependency-free Markdown parser with HTML/PDF renderers.                                                                                             |
| [`@minimaz/css`](packages/css)                   | Dependency-free CSS minifier and `@import` bundler.                                                                                                  |
| [`@minimaz/js`](packages/js)                     | Dependency-free JavaScript minifier.                                                                                                                 |
| [`@minimaz/ts`](packages/ts)                     | TypeScript/TSX transpiler via the `typescript` compiler.                                                                                             |
| [`@minimaz/json`](packages/json)                 | Dependency-free JSON parse/minify/format.                                                                                                            |
| [`@minimaz/validate`](packages/validate)         | Structural validators for CSS, HTML, JS, TS, and JSON.                                                                                               |
| [`@minimaz/html`](packages/html)                 | HTML minifier, plus `@minimaz/validate`'s HTML validator re-exported.                                                                                |
| [`@minimaz/config`](packages/config)             | Loads and validates `minimaz.config.json`.                                                                                                           |
| [`@minimaz/templates`](packages/templates)       | Manages the global `~/.minimaz` directory and template CRUD.                                                                                         |
| [`@minimaz/bundler`](packages/bundler)           | Zero-dependency relative-import JS/TS module graph resolver. Not yet wired into `@minimaz/cli`'s `build` command.                                    |
| [`@minimaz/local-server`](packages/local-server) | Dependency-free `node:http` static file server with SSE live reload, for serving a built site during development. Not yet wired into `@minimaz/cli`. |
| [`@minimaz/cli`](packages/cli)                   | Library implementing the `minimaz`/`mz` commands — `help`, `version`, `validate`, `init`, `config`, `template`, `docs`, `clear`, `build`.            |
| [`@minimaz/sitekit`](toolkits/sitekit)           | The published `minimaz`/`mz` binary, wrapping `@minimaz/cli`'s commands.                                                                             |

Full detail on what each package actually supports today is in [`.claude/status.md`](.claude/status.md).

## Requirements

- Node.js >= 24
- npm >= 11

## Installation

Each package is published independently to npm. Install only what you need:

```bash
npm install @minimaz/core
npm install -g @minimaz/sitekit   # or: npx @minimaz/sitekit
```

See each package's own README (linked in the table above) for its API. These are early (`0.x`) releases — check
[`.claude/status.md`](.claude/status.md) before depending on a specific command or export.

## Repository layout

```txt
packages/     @minimaz/* library packages
toolkits/     @minimaz/sitekit, the published minimaz/mz CLI binary
tools/        internal, never-published packages supporting the build itself (builder, cleaner)
docs/         CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, architecture.md, getting-started.md
```

## Contributing

To work on this repo itself:

```bash
npm install
npm run build       # builds every package (tsc project references)
npm test              # runs the test suite (vitest)
npm run validate      # lint + format check + typecheck — the full CI gate
```

Each package can also be built/tested individually, e.g. `npm run build --workspace=@minimaz/css`.

See [`CONTRIBUTING.md`](docs/CONTRIBUTING.md) for full development setup, the validation
gate, and how to open a pull request. This project follows a
[Code of Conduct](docs/CODE_OF_CONDUCT.md).

## Security

See [`SECURITY.md`](docs/SECURITY.md) for how to report a vulnerability.

## License

[MIT](LICENSE)
