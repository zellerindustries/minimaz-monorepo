# Migration doc: `minimaz-cli` → `minimaz-monorepo`

Purpose: a complete inventory of every module, command, and shared utility
in `minimaz-cli`, mapped to its target `@minimaz/*` package, so nothing gets
forgotten on the way to feature parity. `.claude/status.md` is the up-to-date
summary of what's done; this doc is the detailed checklist behind it —
update both together.

Legend: ✅ done · 🟡 partial · ⬜ not started

## Commands (`src/commands/*`)

| Command    | `minimaz-cli` source     | Target                                           | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------ | ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `help`     | `commands/help/`         | `@minimaz/cli`                                   | ✅     | Ported as-is. `commandsHelp` now lists all 10 entries (`help`/`version`/`validate`/`init`/`config`/`template`/`docs`/`clear`/`build`/`serve`) — full command-name parity with `minimaz-cli`.                                                                                                                                                                                                                                                               |
| `version`  | `commands/version/`      | `@minimaz/cli`                                   | ✅     | Fixed: reports the CLI's own version, not cwd's (original bug).                                                                                                                                                                                                                                                                                                                                                                                   |
| `validate` | `commands/validate/`     | `@minimaz/cli`                                   | 🟡     | **Gap:** original validates a **file or directory recursively** (`isDirectory` branch walks children in parallel) and supports `.jsx` in addition to what we cover, via one generic `esbuildSupportedExtensions` list. Ours is single-file only, and doesn't cover `.jsx` (`.json` is covered). See "Known gaps" below.                                                                                                                               |
| `build`    | `commands/build/`        | `@minimaz/cli`                                   | ✅     | Two-pass strategy ported: discovery pass populates `ignoredFiles` (only for CSS `@import` partials, unlike the original which also — buggily — blacklisted JS/TS dependency files even with bundling off), then `walkFolder` processes/writes everything via `@minimaz/css`/`@minimaz/js`/`@minimaz/html`/`@minimaz/ts` instead of `esbuild`. JS/TS "bundling" (`output.js.bundling: true`) rewrites relative imports to emitted `.js` paths via `@minimaz/bundler` (native ESM, one file per source file, no concatenation).                |
| `clear`    | `commands/clear/`        | `@minimaz/cli`                                   | ✅     | Thin wrapper: reads `config.output.dir`, refuses to delete if the resolved path isn't strictly inside `cwd` (`@minimaz/core`'s `isPathInside`, a `KnownError`), otherwise removes it.                                                                                                                                                                                                                                                                                        |
| `config`   | `commands/config/`       | `@minimaz/cli`                                   | ✅     | **Not the same thing as `@minimaz/config`'s `loadConfig`.** This manages _global, user-level_ state at `~/.minimaz/`: creates the global dir, copies default templates from the installed package into `~/.minimaz/templates`, and creates/patches `~/.minimaz/settings.json` (adds missing keys, warns on unknown ones, never auto-removes). Folded in from `@minimaz/site-builder`'s `config` command.                                          |
| `init`     | `commands/init/`         | `@minimaz/cli`                                   | ✅     | Scaffolds a new project from a global template, writes `minimaz.config.json`, optionally runs `npm i` and/or `git init` — including **GitHub (`gh`) / GitLab (`glab`) remote repo creation**, or connecting an existing remote URL. Interactive (`askQuestion`) when flags aren't passed. Real external-process orchestration (`executeCommand` wraps `cross-spawn`), not just file I/O. Folded in from `@minimaz/site-builder`'s `init` command. |
| `template` | `commands/template/`     | `@minimaz/cli`                                   | ✅     | Manages `~/.minimaz/templates/`: list, save (current or given folder), delete, update (a single template from cwd, or all templates from the installed package's defaults). All destructive actions gated behind `askQuestion` confirmation prompts. Folded in from `@minimaz/site-builder`'s `template` command.                                                                                                                                 |
| `docs`     | _(none — monorepo-only)_ | `@minimaz/cli`                                   | ✅     | Reads `minimaz.config.json`'s `docs` section, converts a directory of Markdown into HTML/PDF (`minimaz docs init`/`minimaz docs build`). Folded in from `@minimaz/docs-builder`'s standalone `docs-builder init\|build` binary, which no longer exists as a separate package.                                                                                                                                                                     |

## Shared utilities (`src/shared/*`)

| Module                                                                                                                                                  | Target                                               | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/fs/core.ts`                                                                                                                                     | `@minimaz/core`                                      | ✅     | Full 1:1 port — `pathExists`, `readJsonFile`, `getDirElements`, `remove`, `ensureDir`, `copy`, `outputFile`, `isDirectory`, `getFileContent`. Bug fixed: `writeFile(path, data, options \|\| 'utf8')`→`?? 'utf8'`; `overwrite: boolean = false` param → inferred (`overwrite = false`). |
| `shared/logger/*`                                                                                                                                       | `@minimaz/logger`                                    | ✅     | Full port (`createLogger`, `log`, `LogType`, `emit`/`formatTs`/etc. internals).                                                                                                                                                                                                                                                                                                                |
| `shared/validate/core.ts`'s `validateHTML`/`validateWithEsbuild`                                                                                        | `@minimaz/validate`                                  | ✅     | Reimplemented (not a literal port — no `esbuild`/`html-minifier-terser` dependency for the validators themselves; `validateHtml` is a from-scratch structural checker, `validateJs`/`validateTs` use the `typescript` package instead of `esbuild`). Bug fixed: original swallows `ConfigValidationError`/its own try/catch and only logs — every `@minimaz/validate` function throws instead. |
| `shared/validate/core.ts`'s `validateConfig`                                                                                                            | `@minimaz/config`                                    | 🟡     | Deliberately **not** duplicated into `@minimaz/validate` — config validation stays exclusively in `@minimaz/config`. Still not ported (unchanged); `@minimaz/config`'s schema redesign is done (see `.claude/status.md`) and `loadConfig` now type-checks every known field (`ConfigValidationError`).                                                                                                                 |
| `shared/functions.ts`'s `loadConfig`                                                                                                                    | `@minimaz/config`                                    | ✅     | Now `@minimaz/config`'s `loadConfig`, understands both schemas (this plan's Task 1).                                                                                                                                                                                                                                                                                                           |
| `shared/functions.ts`'s `applyReplacements`                                                                                                             | `@minimaz/core`                                      | ✅     | Now `@minimaz/core`'s `applyReplacements(content, replacements)` — plain literal-substring replacement (not regex). Used by `build`'s `walkFolder`/`processExternals` (applied once upfront per processable file) and `processCss` (applied a second time to bundled CSS output, since `bundleCss` reads dependency files fresh from disk).                                                    |
| `shared/functions.ts`'s `getFile` (cached read + replacements)                                                                                          | _(none — superseded)_                                | ✅     | Not ported as a caching wrapper. `build`'s `core.ts` reads processable files directly via `node:fs/promises`'s `readFile` + `applyReplacements`, no caching layer — a read failure now throws instead of `getFile`'s original swallow-and-return-empty behavior. `rawFileCache` (below) was never wired to anything beyond this, so nothing depends on porting it either.                        |
| `shared/functions.ts`'s `resolveCurrentPath`                                                                                                            | `@minimaz/cli`                                       | ✅     | Now inline in `packages/cli/src/cli/main.ts` (`process.env['CLI_WORKDIR'] ?? process.cwd()`).                                                                                                                                                                                                                                                                                                  |
| `shared/functions.ts`'s `askQuestion`                                                                                                                   | `@minimaz/cli`                                       | ✅     | Now `packages/cli/src/cli/core.ts`.                                                                                                                                                                                                                                                                                                                                                            |
| `shared/functions.ts`'s `executeCommand`                                                                                                                | `@minimaz/cli`                                       | ✅     | Now `packages/cli/src/cli/core.ts`.                                                                                                                                                                                                                                                                                                                                                            |
| `shared/functions.ts`'s `getGlobalNodeModulesPath`/`getGlobalDirPath`/`getGlobalTemplatesDirPath`/`getGlobalTemplatePath`/`getNodeModulesTemplatesPath` | `@minimaz/templates`                                 | ✅     | Now `getGlobalDir`/`getTemplatesDir`/`getTemplatePath` in `@minimaz/templates`.                                                                                                                                                                                                                                                                                                                |
| `shared/functions.ts`'s `createFileFromTemplate`                                                                                                        | `@minimaz/cli` + `@minimaz/templates`                | ✅     | Now inline `outputFile(path, JSON.stringify(...))` calls in `packages/cli/src/commands/{init,docs}/main.ts` and `@minimaz/templates`'s `writeSettings`.                                                                                                                                                                                                                                        |
| `shared/functions.ts`'s `getSettingsTemplate`/`parseBooleanFlag`                                                                                        | `@minimaz/cli` + `@minimaz/templates`                | ✅     | `parseBooleanFlag` is in `packages/cli/src/cli/core.ts`; `getSettingsTemplate`'s equivalent is `@minimaz/templates`'s `writeSettings`.                                                                                                                                                                                                                                                         |
| `shared/cache/main.ts` (`rawFileCache`)                                                                                                                 | _(none yet — `@minimaz/cache` per `.claude/status.md`)_ | ⬜     | **Barely exists in the original either** — it's a bare `Map<string, string>` with a `// TODO` comment, no eviction/expiry logic at all. The actual "caching strategy" lives in `getFile` (above), not in this module. Porting this is nearly trivial once `getFile`'s build-orchestration home is decided — don't over-build it.                                                               |
| `shared/types.ts` (`MinimazConfig`, `Defaults`, `FileHandler`, `Settings`)                                                                              | `@minimaz/config` + `@minimaz/templates`             | 🟡     | `MinimazConfig` now lives in `@minimaz/config`'s `types.ts`; `Settings` now lives in `@minimaz/templates`'s `types.ts`. `FileHandler` (build-orchestration-specific) still has no home — not needed until `build` is tackled.                                                                                                                                                                  |
| `shared/constants.ts` (`defaults`, `minimazConfigTemplate`)                                                                                             | `@minimaz/config`                                    | ✅     | Now `defaultBuildConfig` in `@minimaz/config`.                                                                                                                                                                                                                                                                                                                                               |
| `src/templates/{default,simple}/` (plus new `docs` seed)                                                                                                                       | `@minimaz/templates`                                 | ✅     | Now `packages/templates/src/seeds/{default,simple}/`; `docs` is a monorepo-only addition.                                                                                                                                                                                                                                                                                                                                          |

## `cli/` entry point

| Piece                                 | Target         | Status | Notes                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli/core.ts`'s `parseArgs`           | `@minimaz/cli` | ✅     | Ported with two bug fixes: flag _values_/positional args no longer lowercased (only flag names are); `--key=value` splits on the first `=` only, not every `=`.                                                                                                                                                                                                         |
| `cli/core.ts`'s `initEnv`             | `@minimaz/cli` | ✅     | Ported as-is (`VERBOSE`/`CLI_WORKDIR` env vars).                                                                                                                                                                                                                                                                                                                        |
| `cli/core.ts`'s `postInstall`         | `@minimaz/cli` | ✅     | Runs `config(false)` during `npm postinstall` to bootstrap `~/.minimaz/` on install. Now in `packages/cli/src/cli/main.ts`.                                                                                                                                                                                                                                             |
| `cli/main.ts` dispatch/error handling | `@minimaz/cli` | ✅     | Ported with two more bug fixes: unknown command now exits `1` (was `0`); caught errors with an `errors: string[]` property (any `@minimaz/validate` error) now print each collected detail, not just the generic class message (found via manual testing, not in the original at all — the original never had structured validation errors to lose in the first place). |

## Known gaps beyond what's already tracked in `.claude/status.md`

These didn't have an obvious one-line home in `.claude/status.md`'s existing
categories, so they're recorded here in full:

1. **`validate` doesn't recurse into directories.** `minimaz-cli`'s
   `validate` command accepts a file _or_ a directory (crawls and
   validates every child in parallel via `Promise.all`). `@minimaz/cli`'s
   `validate` only accepts a single file path today.
2. **`validate` doesn't cover `.jsx`.** The original routes any extension in
   one shared `esbuildSupportedExtensions` list (`.js`, `.cjs`, `.mjs`,
   `.ts`, `.cts`, `.mts`, `.jsx`, `.tsx`, `.json`, `.css`) through
   `esbuild`'s transform. `@minimaz/validate` has no `.jsx` handling (JSX
   support only exists in `validateTs`'s `{ jsx: true }` option, i.e.
   `.tsx`). ~~`.json` validation~~ — done: `@minimaz/validate` now has
   `validateJson`/`JsonValidationError`, and `@minimaz/cli`'s `validate`
   command dispatches `.json` to it.
3. ~~The `config`/`init`/`template` commands' shared machinery has no
   package home at all yet~~ — done: global `~/.minimaz/` path resolution
   and `Settings` type/template live in `@minimaz/templates`; `askQuestion`,
   `executeCommand`, and template-writing helpers live in `@minimaz/cli`'s
   `cli/core.ts` and the `init`/`config`/`template`/`docs` commands
   themselves.
4. ~~Template file trees (`src/templates/default/`, `src/templates/simple/`)
   have no destination decided~~ — done: `packages/templates/src/seeds/{default,simple}/`.
5. ~~`build`'s JS/TS bundling isn't wired up~~ — done: `build` calls
   `@minimaz/bundler`'s `resolveFileImports` per file (native ESM import
   rewriting, one output per source file, no concatenation). Known
   limitations (rewritten imports can 404 when the target is excluded, outside
   `input.dir` or remapped) are listed in `status.md`.

## Suggested order for the remaining work

Roughly cheapest/most-unblocked first, but this is a suggestion, not a plan —
each item still needs its own brainstorm before implementation:

1. ~~`.json` validation in `@minimaz/validate`~~ — done.
2. Directory recursion + `.jsx` in `@minimaz/cli`'s `validate` command
   (closes gap 1 and the rest of gap 2 above without needing anything new
   designed).
3. ~~Finish the paused `@minimaz/config` redesign~~ — done: `loadConfig`
   understands both the `docs` and build-oriented schemas.
   `validateConfig` still has no real home (see the row above).
4. ~~`config`/`init`/`template` commands~~ — done, folded in from the
   now-deleted `@minimaz/site-builder` toolkit.
5. ~~`docs` command~~ — done, folded in from the now-deleted
   `@minimaz/docs-builder` toolkit.
6. ~~`clear` command~~ — done: ports `removeOutDir`'s logic 1:1, refuses
   to delete an unsafe `output.dir`.
7. ~~`build`~~ — done: ties
   `@minimaz/css`/`@minimaz/js`/`@minimaz/ts`/`@minimaz/html` together into
   the two-pass discovery/processing pipeline they were built for.
   `output.js.bundling: true` rewrites relative imports via
   `@minimaz/bundler`'s `resolveFileImports` (native ESM, no concatenation).
8. `@minimaz/sitekit` — done: a bin-only `toolkits/` package publishing
   `minimaz`/`mz`, wrapping `@minimaz/cli`'s `runCli()`. Sitekit wraps
   whatever commands `@minimaz/cli` has today, nothing more — now the full
   command set.
9. `tools/test-suite` migration (already designed, never executed) —
   arguably should happen _before_ #6–7 add more untested surface area, but
   is listed last here since it's orthogonal to closing `minimaz-cli`
   parity specifically.

## Keeping this doc honest

Same rule as `.claude/status.md`: update this file whenever a row's status
changes, and keep the two docs consistent with each other — `.claude/status.md`
is the summary a newcomer reads first; this doc is the detail they check
before starting work on any specific piece.
