# Monorepo architecture

## Layout

```
packages/     @minimaz/* library packages (published, independently versioned)
toolkits/     @minimaz/sitekit — the published minimaz/mz CLI binary (see below)
scripts/      repo scripts, not packages: bundle.mjs (the esbuild step of every package's build)
docs/         CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, architecture.md, getting-started.md — published/
              user-facing
.claude/      status.md, migration.md, superpowers/specs, superpowers/plans — internal working ledgers/design
              docs, not published/user-facing
```

`toolkits/sitekit` is a bin-only passthrough: it publishes the `minimaz`/`mz` executable by wrapping `@minimaz/cli`'s
`runCli()` (`@minimaz/cli` itself has no `bin`). The old `site-builder`/`docs-builder` toolkits were folded into
`@minimaz/cli`.

The root `tsconfig.json` references every `packages/*` package plus `toolkits/sitekit`; it drives
`npm run typecheck:watch` and type-checks `vitest.config.ts`. There is no root `tsconfig.build.json`: root `build`
delegates to each package's own `tsconfig.build.json`, which references its dependencies' build configs. Build order always comes from project references, not from `package.json` dependencies.

Every package's `build` is `tsc -b tsconfig.build.json && node ../../scripts/bundle.mjs`. `scripts/bundle.mjs` is a
plain ESM script (no package, no build step, run from the package directory): it reads `main`/`bin` from
`package.json`, bundles each `dist/<name>.js` from `src/<name>.ts` with esbuild (a root devDependency — minified,
ESM, `node24`, dependencies/devDependencies + Node built-ins external so `@minimaz/*` imports still resolve through
the workspace at runtime), then deletes stray `*.test`/`*.spec` output from `dist/`. Keep it dependency-free of the
workspace packages — importing one would mean building that package before anything can be bundled.

## Package dependency graph

```
@minimaz/sitekit (minimaz/mz bin) → @minimaz/cli
@minimaz/cli (implements help/version/validate/init/config/template/docs/clear/build/serve — full command parity)
  → @minimaz/config, @minimaz/core, @minimaz/logger, @minimaz/markdown, @minimaz/templates,
    @minimaz/validate, @minimaz/css, @minimaz/js, @minimaz/html, @minimaz/ts, @minimaz/local-server,
    @minimaz/bundler
@minimaz/bundler      → @minimaz/ts (JS/TS import-graph resolver; backs @minimaz/cli's build when output.js.bundling is true)
@minimaz/local-server → @minimaz/logger (dev HTTP server; backs @minimaz/cli's `serve` command)
@minimaz/config       → @minimaz/json, @minimaz/logger
@minimaz/html         → @minimaz/validate
@minimaz/templates    → @minimaz/core, @minimaz/logger
@minimaz/core         → @minimaz/logger
@minimaz/css          → @minimaz/core
@minimaz/validate     → @minimaz/logger, typescript
@minimaz/ts           → typescript
@minimaz/logger, @minimaz/js, @minimaz/json, @minimaz/markdown — zero-dep, standalone
```

`@minimaz/logger` also owns the shared top-level CLI error handling (`src/errors.ts`: `KnownError`,
`handleCliError`), consumed by `@minimaz/cli`, `@minimaz/config`, `@minimaz/templates`, `@minimaz/validate`,
and `@minimaz/local-server`. It exists so those consumers don't hand-roll their
own top-level `catch`-and-`process.exitCode = 1` logic — see `errors.ts` before adding another ad hoc error
handler in a CLI entry point. It used to be a separate `@minimaz/errors` package (never published); it was folded
into logger because `handleCliError` only needs `log`, and libraries that throw `KnownError` already sit on top
of logger.

`handleCliError` prints a plain `Error` as "This looks like a bug — please report it", so a user mistake (bad
argument, missing file, bad `@import`) must be thrown as a `KnownError`. `@minimaz/css` has no logger dependency, so
its deliberate `bundleCss: …` errors are wrapped into `KnownError` at the CLI boundary (`bundleCssForBuild` in
`cli/src/commands/build/processors/css.ts`) while anything else still propagates as a bug. The stack trace is shown
only with `--verbose` or `DEBUG=true`; `--verbose` sets `VERBOSE` via `initEnv`, which overwrites any ambient value.

`@minimaz/local-server` (`packages/local-server`) is a dependency-free `node:http` static file server with
SSE-based live reload (`startLocalServer`), for serving a built site directory during development, exposed to users
as `@minimaz/cli`'s `serve` command. Live reload re-arms itself when the served directory is deleted or swapped
(`build` swaps its output directory in; see below). Redirect `Location` headers are built from the resolved
directory, never the raw request path (an encoded `//evil.com` once produced an open redirect). Its
path-traversal guard (in `static-handler.ts`) is defense-in-depth: `core.ts`'s own `new URL(req.url, ...)`
parsing already collapses every dot-segment shape (literal `..`, `%2e%2e`, mixed case) per the WHATWG URL spec
before the guard ever runs, so no request can reach it through the real HTTP server — verified, not assumed;
see the package's design spec under `.claude/superpowers/specs/` before "fixing" the guard to be reachable.

`@minimaz/core` owns path containment: use `isPathInside(child, parent)` (strict descendant) and
`pathsOverlap(a, b)` (case-insensitive on Windows/macOS) rather than string-prefix checks, which are wrong for
sibling directories. `build` and `clear` use them to validate `output.dir` against the project, `input.dir` and local
`input.externals`. `build` does not wipe `output.dir` up front: it builds into `<output.dir>.minimaz-tmp`, moves the
old output aside to `<output.dir>.minimaz-old`, renames the new build into place (with retry on Windows
EPERM/EACCES/EBUSY) and restores the old output if that fails, so a failed build keeps the last good one. `docs build`
writes to `<output.dir>-docs/{html,pdf}`, a sibling that `build`/`clear` never touch. `@minimaz/cli`'s `init` normalizes `--provider` and the interactive answer through the single
`isProviderKeyword` helper (`commands/init/core.ts`); don't add a second `.toLowerCase()` site.

Several packages (`@minimaz/css`, `@minimaz/js`, `@minimaz/json`) are **deliberately dependency-free** — see their
design docs under `.claude/superpowers/specs/` before adding a dependency to one of them. Do not assume a shared
helper package exists for every cross-cutting concern (e.g. wrapped JSON-parse error handling is intentionally
duplicated in `@minimaz/core`, `@minimaz/json`, and `@minimaz/validate` rather than factored out — see the "Known
cleanup opportunities" section of `.claude/status.md` for why, and check that section before "fixing" duplication).

`site-builder`'s `init`/`config`/`template` and `docs-builder`'s standalone `docs init|build` were both retired
and folded into `@minimaz/cli` as regular subcommands — `@minimaz/cli` now has full `minimaz-cli` command-name
parity, including `build` and `clear`. `build` ports `minimaz-cli`'s two-pass discovery/processing pipeline using
`@minimaz/css`/`@minimaz/js`/`@minimaz/html`/`@minimaz/ts` instead of `esbuild`. JS/TS "bundling"
(`output.js.bundling: true`) is native-ESM import rewriting via `@minimaz/bundler`'s `resolveFileImports`: each
source file still produces one output file, there is no single-file concatenation and no npm inlining (bare
specifiers are left untouched). `runCli()`
(`packages/cli/src/cli/main.ts`) bootstraps `~/.minimaz/` on `npm postinstall`
(detected via `npm_lifecycle_event`), wrapped so a failure there never fails the install itself. Only
`@minimaz/sitekit` declares the `postinstall` script (`node dist/cli/main.js || exit 0`); its `main.ts` is a thin
`runCli()` passthrough.

`@minimaz/config`'s `loadConfig` understands **both** schemas: the docs-builder shape (`docs.input.dir`,
`docs.output.bundle`, `docs.output.formats`) and the build-oriented schema (`input`/`output`, `mapping`,
externals, exclude, CSS/JS/HTML processing options) ported from `minimaz-cli` — both sections are always present
in `loadConfig`'s result, independently defaulted. `init` writes the chosen template's own config (a build config by
default, docs-only for the `docs` template) and `docs init` writes a docs-only one; each bails if
`minimaz.config.json` already exists, so running both leaves one section un-populated by either — harmless today since
`loadConfig` defaults whichever section is missing, but see `.claude/status.md`'s "Known cleanup opportunities" before
assuming this is unified.

Every ported function fixes silent-failure bugs found in the original `minimaz-cli` (e.g. swallowed validation
errors, wrong version reporting, unknown commands exiting 0, minifiers falling back to unminified output on
failure) rather than replicating them — see `.claude/status.md`'s "Known bugs found (and fixed) while porting"
section for the full list before porting new code from `minimaz-cli`.

## Per-package layout convention

Each package follows a consistent internal structure: `core.ts` (logic) / `main.ts` (entry, where applicable) /
`types.ts` / `index.ts` (barrel, named exports only — no default exports). `@minimaz/cli` additionally has a
`src/commands/` directory with one subdirectory per command (`help`, `version`, `validate`, `init`, `config`,
`template`, `docs`, `build`, `clear`, `serve`) and a `src/cli/` directory for the dispatch table, arg parsing, and postinstall hook.
`@minimaz/sitekit` (`toolkits/sitekit`) deviates deliberately — no `core.ts`/`types.ts`/
`index.ts`, just a single bin/entry `main.ts`.
