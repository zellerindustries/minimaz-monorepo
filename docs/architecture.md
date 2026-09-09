# Architecture

An overview of how `minimaz-monorepo` fits together — the package graph, the build pipeline, the config system,
and the CLI. For what's actually implemented vs. planned, see [`.claude/status.md`](../.claude/status.md); this
document is about how the pieces work, not which ones exist yet.

## Repository layout

```txt
packages/     @minimaz/* library packages — published, independently versioned
toolkits/     @minimaz/sitekit — the published minimaz/mz bin, wrapping @minimaz/cli
tools/        internal, never-published workspace packages that support the build itself (builder)
config/       shared eslint/prettier/vitest config, kept out of the workspace root on purpose
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
  → @minimaz/core, @minimaz/logger, @minimaz/config, @minimaz/markdown, @minimaz/templates, @minimaz/validate
@minimaz/config    → @minimaz/json
@minimaz/html      → @minimaz/validate
@minimaz/templates → @minimaz/core, @minimaz/logger
@minimaz/core      → @minimaz/logger
@minimaz/css       → @minimaz/core
@minimaz/logger, @minimaz/js, @minimaz/json, @minimaz/markdown — zero-dep, standalone
@minimaz/ts, @minimaz/validate → typescript
```

`@minimaz/css`, `@minimaz/js`, and `@minimaz/json` are **deliberately dependency-free** — see the design docs
under `.claude/superpowers/specs/` before adding a dependency to one of them. Some logic is intentionally
duplicated rather than factored into a shared helper, to keep those packages standalone (e.g. wrapped
JSON-parse-error handling appears independently in `@minimaz/core`, `@minimaz/json`, and `@minimaz/validate`) —
see `.claude/status.md`'s "Known cleanup opportunities" before "fixing" that duplication.

TypeScript project references (root `tsconfig.json`) declare `packages/*` + `tools/builder`; build order comes
from those references, not from `package.json` dependencies directly.

## Per-package layout convention

Each package follows the same internal shape: `core.ts` (logic) / `main.ts` (entry point, where applicable) /
`types.ts` / `index.ts` (a barrel of named exports only — no default exports). `@minimaz/cli` additionally has a
`src/commands/` directory with one subdirectory per command (`help`, `version`, `validate`, `init`, `config`,
`template`, `docs`) and a `src/cli/` directory for argument parsing, the dispatch table, and the postinstall hook.

## Build pipeline

Each package's own `build` script is:

```bash
tsc -p tsconfig.json && node ../../tools/builder/dist/cli.js
```

`tsc` type-checks and emits declarations; `tools/builder` (internally `@minimaz/builder-tools`, never published to
npm) then resolves the package's `main`/`bin` fields from `package.json`, maps the `dist/*.js` path back to its
`src/*.ts` source, and bundles it with esbuild into a single minified ESM file targeting `node24`.
Dependencies/devDependencies and `node:*` imports are externalized, so cross-package `@minimaz/*` imports still
resolve the normal workspace way at runtime — only a package's _own_ source gets bundled.

`tools/builder` also cleans up after `tsc`'s declaration emit: it deletes stray `*.test.d.ts`/`.d.ts.map` files
that leak into `dist` from colocated test files, and — whenever it deletes any — removes that package's
`.tsbuildinfo` (cached under `node_modules/.cache/tsc/`, not `dist/`) to force a clean rebuild instead of a
`tsc -b` incremental-state mismatch (TS6305).

The root `build` script runs this once for the whole graph: `tsc -b` (all project references), then
`tools/builder`'s CLI with `--all` (bundles every package), then a script that copies `@minimaz/templates`'
bundled seed templates from `src/seeds` into `dist/seeds`.

## Config system

`@minimaz/config`'s `loadConfig(cwd)` reads `minimaz.config.json` and understands **two** schemas at once,
independently defaulted:

- **docs schema** — `docs.input.dir`, `docs.output.bundle`, `docs.output.formats` — consumed by `minimaz docs
init`/`minimaz docs build`.
- **build schema** — `input`/`output` (`mapping`, `externals`, `exclude`, CSS/JS/HTML processing options) — ported
  from `minimaz-cli`, for the future `build`/`clear` commands.

Both sections are always present in `loadConfig`'s result regardless of which one the file actually provided.
`minimaz init` (build-only template) and `minimaz docs init` (docs-only template) each write only their own half
of the file and refuse to run if it already exists, so running both leaves one section unpopulated by either —
harmless today since `loadConfig` fills in defaults, but see `.claude/status.md`'s "Known cleanup opportunities"
before assuming the two are unified.

## The CLI

`@minimaz/cli` implements the `minimaz`/`mz` commands — `help`, `version`, `validate`, `init`, `config`,
`template`, and `docs` — full `minimaz-cli` command-name parity except `build`/`clear`, which are blocked on JS
dependency-graph bundling (deferred out of `@minimaz/js`/`@minimaz/ts` — real module resolution is a much bigger
undertaking than CSS's `@import` text-inlining). `@minimaz/sitekit` is the actual published `minimaz`/`mz`
binary — a thin passthrough that calls `@minimaz/cli`'s exported `runCli()`. See each package's own README, or
run `minimaz help`, for per-command usage.

`@minimaz/sitekit` runs `config(false)` on `npm postinstall` to bootstrap `~/.minimaz/` (global settings + bundled
templates) on install, wrapped so a postinstall failure never fails the install itself. `@minimaz/cli` no longer
has its own postinstall script — it isn't published with a bin, so there's nothing for it to bootstrap.

Every function ported from `minimaz-cli` fixes a silent-failure bug found in the original rather than replicating
it (swallowed validation errors, wrong version reporting, unknown commands exiting 0, minifiers silently falling
back to unminified output, `--key=value` parsing dropping everything after a second `=`, and more) — see
`.claude/status.md`'s "Known bugs found (and fixed) while porting" for the full list before porting new code from
`minimaz-cli`.

## Testing

Tests are colocated `*.test.ts` files alongside the code they cover. `config/vitest.config.ts`'s include pattern
is built from:

```ts
["packages/*/src", "toolkits/*/src", "tools/*/src", "app/src"].map(
    (dir) => `${dir}/**/*.{test,spec}.ts`,
);
```

`toolkits/*` now matches `@minimaz/sitekit`; `app/src` still matches nothing (`passWithNoTests` keeps that
harmless).

## Releases

Per-package versioning and changelogs are managed by [Changesets](https://github.com/changesets/changesets), not
manual version bumps — see [`CONTRIBUTING.md`](CONTRIBUTING.md#releasing) for the full flow.
