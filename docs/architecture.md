# Architecture

An overview of how `minimaz-monorepo` fits together — the package graph, the build pipeline, the config system,
and the CLI. For what's actually implemented vs. planned, see [`.claude/status.md`](../.claude/status.md); this
document is about how the pieces work, not which ones exist yet.

## Repository layout

```txt
packages/     @minimaz/* library packages — published, independently versioned
toolkits/     @minimaz/sitekit — the published minimaz/mz bin, wrapping @minimaz/cli
scripts/      repo scripts, not packages: bundle.mjs (the esbuild step of every package's build)
docs/         this documentation
.claude/      status.md / migration.md (internal working ledgers) and superpowers/ design specs and plans
```

`toolkits/` holds one package today, `@minimaz/sitekit` — a bin-only passthrough that publishes `minimaz`/`mz`
and wraps `@minimaz/cli`'s `runCli()`. `site-builder` and `docs-builder` used to live there as separate binaries
but were folded into `@minimaz/cli` and retired before `sitekit` took their place.

## Package dependency graph

```txt
@minimaz/sitekit (the minimaz/mz bin) → @minimaz/cli
@minimaz/cli (library implementing the minimaz/mz commands)
  → @minimaz/config, @minimaz/core, @minimaz/logger, @minimaz/markdown, @minimaz/templates,
    @minimaz/validate, @minimaz/css, @minimaz/js, @minimaz/html, @minimaz/ts, @minimaz/local-server
@minimaz/bundler      → @minimaz/ts (JS/TS import-graph resolver — not yet a @minimaz/cli dependency)
@minimaz/local-server → @minimaz/logger (dev HTTP server, wired into @minimaz/cli's serve command)
@minimaz/config       → @minimaz/json, @minimaz/logger
@minimaz/html         → @minimaz/validate
@minimaz/templates    → @minimaz/core, @minimaz/logger
@minimaz/validate     → @minimaz/logger, typescript
@minimaz/core         → @minimaz/logger
@minimaz/css          → @minimaz/core
@minimaz/ts           → typescript
@minimaz/logger, @minimaz/js, @minimaz/json, @minimaz/markdown — zero-dep, standalone
```

`@minimaz/css`, `@minimaz/js`, and `@minimaz/json` are **deliberately dependency-free** — see the design docs
under `.claude/superpowers/specs/` before adding a dependency to one of them. Some logic is intentionally
duplicated rather than factored into a shared helper, to keep those packages standalone (e.g. wrapped
JSON-parse-error handling appears independently in `@minimaz/core`, `@minimaz/json`, and `@minimaz/validate`) —
see `.claude/status.md`'s "Known cleanup opportunities" before "fixing" that duplication.

TypeScript project references (root `tsconfig.json`) declare `packages/*` and `toolkits/sitekit`; build order comes
from those references, not from `package.json` dependencies directly.

## Per-package layout convention

Each package follows the same internal shape: `core.ts` (logic) / `main.ts` (entry point, where applicable) /
`types.ts` / `index.ts` (a barrel of named exports only — no default exports). `@minimaz/cli` additionally has a
`src/commands/` directory with one subdirectory per command (`help`, `version`, `validate`, `init`, `config`,
`template`, `docs`, `build`, `clear`) and a `src/cli/` directory for argument parsing, the dispatch table, and the postinstall hook.

## Build pipeline

Each package's own `build` script is:

```bash
tsc -b tsconfig.build.json && node ../../scripts/bundle.mjs
```

`tsc -b` type-checks and emits the package (building its referenced dependencies first). `scripts/bundle.mjs` — a
plain script, not a package, run from the package directory — then reads the package's `main`/`bin` fields, maps each
`dist/*.js` path back to its `src/*.ts` source, and bundles it with esbuild into a single minified ESM file targeting
`node24`.
Dependencies/devDependencies and `node:*` imports are externalized, so cross-package `@minimaz/*` imports still
resolve the normal workspace way at runtime — only a package's _own_ source gets bundled.

It also deletes stray `*.test`/`*.spec` output (`.js`, `.d.ts`, `.map`) that a plain `tsc -b` (`npm run typecheck`)
leaves in `dist` from the `__tests__/` files, so it never ends up in a published package.

The root `build` script runs every workspace's own
`build` (`npm run build --workspaces --if-present`). npm runs workspaces alphabetically rather than in dependency
order, which is safe because each package's `tsc -b tsconfig.build.json` builds its referenced dependencies first.
`@minimaz/templates`' own build also copies its bundled seed templates from `src/seeds` into `dist/seeds`. The
root `clean`, `typecheck`, `lint` and `test` scripts delegate to each workspace the same way.

`npm run clean` runs each workspace's own `clean` (its `dist/` and `node_modules/.cache/tsc/`), then removes the
root `node_modules/.cache` (root tsbuildinfo, coverage).

## Config system

`@minimaz/config`'s `loadConfig(cwd)` reads `minimaz.config.json` and understands **two** schemas at once,
independently defaulted:

- **docs schema** — `docs.input.dir`, `docs.output.bundle`, `docs.output.formats` — consumed by `minimaz docs
init`/`minimaz docs build`.
- **build schema** — `input`/`output` (`mapping`, `externals`, `exclude`, CSS/JS/HTML processing options) — ported
  from `minimaz-cli`, consumed by the `build` and `clear` commands.

Both sections are always present in `loadConfig`'s result regardless of which one the file actually provided.
`minimaz init` (build-only template) and `minimaz docs init` (docs-only template) each write only their own half
of the file and refuse to run if it already exists, so running both leaves one section unpopulated by either —
harmless today since `loadConfig` fills in defaults, but see `.claude/status.md`'s "Known cleanup opportunities"
before assuming the two are unified.

## The CLI

`@minimaz/cli` implements the `minimaz`/`mz` commands — `help`, `version`, `validate`, `init`, `config`,
`template`, `docs`, `clear`, and `build` — full `minimaz-cli` command-name parity. `build` ports `minimaz-cli`'s
two-pass discovery/processing pipeline onto `@minimaz/css`/`@minimaz/js`/`@minimaz/html`/`@minimaz/ts` instead of
`esbuild`; JS/TS import-graph bundling is the one piece not yet wired in (`output.js.bundling: true` throws
rather than resolving the graph via the separate `@minimaz/bundler` package). `@minimaz/sitekit` is the actual
published `minimaz`/`mz` binary — a thin passthrough that calls `@minimaz/cli`'s exported `runCli()`. See each
package's own README, or run `minimaz help`, for per-command usage.

`@minimaz/sitekit` runs `config(false)` on `npm postinstall` to bootstrap `~/.minimaz/` (global settings + bundled
templates) on install, wrapped so a postinstall failure never fails the install itself. `@minimaz/cli` no longer
has its own postinstall script — it isn't published with a bin, so there's nothing for it to bootstrap.

Every function ported from `minimaz-cli` fixes a silent-failure bug found in the original rather than replicating
it (swallowed validation errors, wrong version reporting, unknown commands exiting 0, minifiers silently falling
back to unminified output, `--key=value` parsing dropping everything after a second `=`, and more) — see
`.claude/status.md`'s "Known bugs found (and fixed) while porting" for the full list before porting new code from
`minimaz-cli`.

## Testing

Tests live in a `__tests__/` directory next to the code they cover (e.g. `src/__tests__/core.test.ts` for
`src/core.ts`). The root `vitest.config.ts` builds one Vitest project per package directory under `packages/`,
and `toolkits/`, named after that package's `package.json` `name`. Each project is an
inline config with `extends: true`, which is what makes the root `test` options (`clearMocks`, `mockReset`,
`restoreMocks`, the `**/dist/**` exclude) apply to it — a plain directory-glob project entry would not inherit
them.

`npm test` runs every project; a package's own `npm test` runs `vitest run --root ../.. --project <package-name>`.
To run a single file: `npx vitest run packages/css/src/__tests__/minify.test.ts` from the repo root.

## Releases

Per-package versioning and changelogs are managed by [Changesets](https://github.com/changesets/changesets), not
manual version bumps — see [`CONTRIBUTING.md`](CONTRIBUTING.md#releasing) for the full flow.
