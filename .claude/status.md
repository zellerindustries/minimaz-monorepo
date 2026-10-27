# Project status

`minimaz-monorepo` is an in-progress, npm-workspace-based rewrite of
[`minimaz-cli`](../../minimaz-cli) into modular, independently-versioned
`@minimaz/*` packages. It is **not yet a replacement** for `minimaz-cli` —
`minimaz-cli` remains the stable, published tool. This document is the
single source of truth for what's actually working here today versus what's
still in progress or only planned, so contributors don't have to guess.

**Release state:** `release/0.3.0` is merged into `develop` and `main` (versions bumped, changelogs written) and tagged per package (e.g. `@minimaz/cli@0.3.0`, `@minimaz/config@0.3.0`); there is no repo-wide `v0.3.0` tag.

## Working today

| Package                             | What it does                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@minimaz/core`                     | Filesystem utilities (path checks, JSON reads, copy/remove/output helpers) shared across the ecosystem.                                                                                                                                                                                                                                                                       |
| `@minimaz/logger`                   | Minimal, performance-oriented structured logger, plus the shared CLI error handling (`KnownError`, `handleCliError`) that used to be the separate, never-published `@minimaz/errors`.                                                                                                                                                                                                                                                                                                                              |
| `@minimaz/markdown`                 | Dependency-free Markdown parser with HTML and PDF renderers (`mdToHtml`, `mdToPdf`, `validateMd`).                                                                                                                                                                                                                                                                            |
| `@minimaz/css`                      | Dependency-free CSS minifier (`minifyCss`) and `@import` bundler (`bundleCss`) — no `esbuild`.                                                                                                                                                                                                                                                                                |
| `@minimaz/js`                       | Dependency-free JavaScript minifier (`minifyJs(code, { mangle? })`) — own parser (ESTree AST), scope analysis, scope-aware renamer and minimal printer: renames locals (top level only in modules, never exports, nothing that can see `eval`/`with`), drops comments/whitespace, minimal `;` and parentheses, safe literal rewrites only. Falls back to the old token minifier (whitespace/comments only) on a parse/early error, stack overflow on deep nesting, or top-level `await` without module syntax. Unterminated string/template/regex/comment throws `minifyJs: …` (mapped to `KnownError` in `@minimaz/cli`). No bundling (deferred). |
| `@minimaz/ts`                       | TypeScript/TSX transpiler (`transpileTs`) via the `typescript` compiler — type-stripping and JSX transform only, no type-checking.                                                                                                                                                                                                                                            |
| `@minimaz/validate`                 | Structural validators for all five: `validateCss`, `validateHtml` (zero-dep, brace/tag-balance checks), `validateJs`, `validateTs` (via `typescript`'s parser diagnostics), `validateJson` (via `JSON.parse`). Config validation stays in `@minimaz/config`, not duplicated here.                                                                                             |
| `@minimaz/html`                     | HTML minifier (`minifyHtml`, via `html-minifier-terser`) plus `validateHtml`/`HtmlValidationError` re-exported from `@minimaz/validate`.                                                                                                                                                                                                                                      |
| `@minimaz/json`                     | Dependency-free JSON `parseJson`/`minifyJson`/`formatJson`.                                                                                                                                                                                                                                                                                                                   |
| `@minimaz/config`                   | Loads/validates `minimaz.config.json` (parses via `@minimaz/json`'s `parseJson`). Understands both the `docs` section (`docs.input`/`docs.output`) and the build-oriented `input`/`output` section (`mapping`, `externals`, `exclude`, CSS/JS/HTML processing options) ported from `minimaz-cli` — both are always present in `loadConfig`'s result, independently defaulted. |
| `@minimaz/bundler`                   | Zero-dependency relative-import module graph resolver (`resolveModuleGraph`, `resolveFileImports`) — walks a JS/TS file's `./`/`../` imports, transpiles TypeScript via `@minimaz/ts`, and rewrites specifiers to their resolved `.js` output paths. No `node_modules` resolution, no single-file bundling (output mirrors the input tree; the browser's native ESM loader links modules at runtime). `resolveFileImports` (single file, no graph walk) backs `@minimaz/cli`'s `build` when `output.js.bundling: true`; failures throw `BundlerError`. |
| `@minimaz/local-server`             | Dependency-free `node:http` static file server (`startLocalServer`) for serving a built site directory during development — path-traversal-guarded static serving, `index.html` fallback, and optional SSE-based live reload (watches the served directory, injects a reload script into HTML responses). Adds config-driven clean URLs, SPA fallback, directory listing, and cache-control/ETag support, all gated behind `minimaz.config.json`'s `serve` section. Wired into `@minimaz/cli` as the `serve` command. |
| `@minimaz/cli` (library)             | Exports `runCli()` and all command implementations, including `build` and `clear` — full `minimaz-cli` command-name parity reached. `build` ports `minimaz-cli`'s two-pass discovery/processing pipeline using `@minimaz/css`/`@minimaz/js`/`@minimaz/html`/`@minimaz/ts` instead of `esbuild`; `output.js.bundling: true` rewrites relative imports to emitted `.js` paths via `@minimaz/bundler` (native ES modules, one output file per source file; HTML needs `<script type="module">`). Both `build` and `clear` refuse to delete an `output.dir` that isn't strictly inside `cwd` (real path containment via `@minimaz/core`'s `isPathInside`, not a string-length proxy). `site-builder` and `docs-builder` were folded in as commands and no longer exist as separate binaries. No longer publishes its own `minimaz`/`mz` bin — that's now published by `@minimaz/sitekit`. `init`'s scaffolded config now matches `build`'s actual default (`output.js.bundling: false`), so a fresh `init && build` no longer fails immediately.                  |
| `@minimaz/sitekit` (toolkit)        | The published `minimaz`/`mz` binary (`toolkits/sitekit`, currently 0.1.2). Bin-only passthrough: its one file, `src/cli/main.ts`, calls `@minimaz/cli`'s `runCli()` with its own `package.json` path, so `minimaz version` reports sitekit's version. Runs `config(false)` on `npm postinstall` to bootstrap `~/.minimaz/`. |
| `@minimaz/templates`                | Manages the global `~/.minimaz` directory: settings (`writeSettings`) and template CRUD (`listTemplates`, `saveTemplate`, `deleteTemplate`, `updateTemplateFrom`, `seedDefaults`). Ships the `default` (multi-page starter site: landing, services, legal, contact form, error page, SEO files), `simple` (blank) and `docs` (Markdown) templates.                                                                                                                         |

## In progress

- **Centralized test suite** — a design exists to centralize all package tests
  into one dedicated test package.
  Not yet implemented, but this doesn't mean tests don't exist today: tests
  live in a `__tests__/` subdirectory next to the code they cover (e.g.
  `src/__tests__/core.test.ts` for `src/core.ts`), across `packages/*/src`
  (and `toolkits/*/src`; `vitest.config.ts` builds one project per directory under `packages/` and `toolkits/` that has a
  `package.json`, plus a `scripts` project for `scripts/__tests__`).
  `toolkits/` now holds one package, `@minimaz/sitekit` — a
  bin-only passthrough that publishes the `minimaz`/`mz` executable, wrapping
  `@minimaz/cli`'s `runCli()`. This is not a reversal of the `site-builder`/
  `docs-builder` retirement: sitekit has no command logic of its own, it only
  re-exposes `@minimaz/cli`'s commands under a bin `@minimaz/cli` itself no
  longer publishes. `@minimaz/cli`'s own `package.json` dropped its `bin`
  field accordingly. Tests run via `npm run test` /
  `npx vitest run`.
  Centralizing them is still just an unimplemented idea, not
  something blocking test coverage today.
- **`scripts/bundle.mjs`** — implemented. A plain ESM script (not a
  package, no build step of its own) that bundles each package's `main`/`bin`
  entry points with `esbuild` into a single minified file per entry, and
  strips stray compiled test files from `dist/`. Runs after
  `tsc -b tsconfig.build.json` in every package's `build` script, from that
  package's directory. It replaced the former `tools/builder` workspace
  package (TypeScript, its own tests, a whole-workspace mode and a
  `build:internal` bootstrap step) and `tools/cleaner`; `.tsbuildinfo` lives
  in each package's own `node_modules/.cache/tsc/`, cleared by its `clean`.
- **JS/TS "bundling" in `build`** — `output.js.bundling: true` is supported:
  `build` calls `@minimaz/bundler`'s `resolveFileImports` per JS/TS file, which
  rewrites relative static `import`/`export ... from` specifiers to the emitted
  `.js` paths (a relative dynamic `import()` is not rewritten: it throws a
  `BundlerError`, surfaced as a `KnownError`). Output is native ES modules, one file per source file, not a
  single concatenated file — HTML must load the entry with
  `<script type="module">`. npm/bare specifiers are left untouched, and an
  unresolvable relative import is a `KnownError`.

## Stub / not started

- **`@minimaz/cache`** — no package exists yet. `minimaz-cli`'s
  `src/shared/cache/` has not been ported.
- **Full CLI command parity — reached.** `minimaz-cli` exposes `build`/`b`,
  `clear`/`c`, `config`, `init`/`i`, `template`/`t`, `validate`,
  `version`/`v`, `help`/`h`. `@minimaz/cli` now has every command by name —
  `help`/`h`, `version`/`v`, `validate`, `init`/`i`, `config`, `template`/`t`,
  `docs`, `clear`/`c`, `build`/`b`, `serve` — including the original's single-letter
  aliases (`config`, `docs` and `serve` have no `minimaz-cli` equivalent, so none
  gets one). `build`'s JS/TS "bundling" is per-file import rewriting, see the
  JS/TS bundling bullet above.
- **`generateHtml`/template-insertion** — an idea from `@minimaz/html`'s
  original stub comments, dropped (not deferred) when that package was
  built. `@minimaz/markdown`'s `mdToHtml({ full: true })` already covers
  full-page HTML wrapping for the one real use case.

## Known bugs found (and fixed) while porting from `minimaz-cli`

Several ported functions in `minimaz-cli` catch their own error internally,
log it, and then continue as if nothing failed — silently returning a
false-success result instead of propagating the error. Every `@minimaz/*`
port in this monorepo fixes this rather than replicating it:

- `loadConfig`'s config validation swallowed `ConfigValidationError`.
- The old CLI's `version` command reported the _cwd project's_ version
  rather than the CLI's own.
- An unknown CLI command logged an error but still exited 0.
- `runTransform`'s esbuild error handling returned `''` (silent empty
  output) instead of throwing.
- `minifyHTML` fell back to returning the _original unminified_ code on a
  minification failure instead of throwing.
- `parseArgs` lowercased the entire raw argument, including values — would
  have silently corrupted a `--path=/File.CSS` argument's case on a
  case-sensitive filesystem. Now only flag names are lowercased.
- `parseArgs`'s `--key=value` split on every `=` (`.split("=")`), silently
  dropping everything after a second `=` in the value. Now splits on the
  first `=` only.
- The `template` command ran its default "save current folder as a
  template" action unconditionally even when the caller only passed
  `--update` — meaning `template --update myname` would both save a new
  template AND update `myname`. `@minimaz/cli`'s `template`
  command makes `list`/`delete`/`update`/default-save mutually exclusive.

Found and fixed during a 2026-09-15 code-review pass:

- `build` and `clear`'s "refuse to delete an unsafe `output.dir`" guard
  compared string length (`outDirPath.length <= cwd.length`) instead of real
  path containment — a sibling directory with a longer path string (e.g. a
  project dir plus a `-backup` suffix) passed the guard, so either command
  would have deleted a directory outside the project instead of refusing.
  Fixed via `@minimaz/core`'s new `isPathInside`, used by both commands.
- `tools/cleaner`'s `isDependencyPath` only checked the character *before*
  a `node_modules` match, not after, so it matched by substring rather than
  path segment — `node_modules_backup/dist` was wrongly treated as
  protected dependency content and silently never cleaned.
- `tools/builder` unconditionally rebuilt every workspace package
  regardless of invocation `cwd`, so a single package's own `build` script
  (`npm run build --workspace=X`) silently rebundled the whole workspace.
- `handleCliError` only printed a caught error's itemized `errors: string[]`
  detail when the error was a `KnownError` — a plain `Error` carrying the
  same shape (from a validation path not yet migrated to `KnownError`)
  silently lost that detail.
- `init`'s scaffolded `minimaz.config.json` set `output.js.bundling: true`,
  but `build` throws whenever that flag is true — every fresh
  `init && build` failed immediately on an untouched config.
- `initGit` normalized an interactively-answered provider
  (`.toLowerCase().trim()`) but not an explicitly passed `--provider` flag,
  so `--provider GitHub` failed to match where typing `GitHub` at the
  prompt worked. Fixed via a single `isProviderKeyword` comparison used at
  every call site instead of each one independently calling
  `.toLowerCase()`.
- `build`'s CSS-bundling discovery pass resolved and read every entry's
  whole `@import` graph from disk, then the processing pass did it again
  for the same entry — now cached across both passes (`cssBundleCache`).

Found and fixed on 2026-09-26 (pre-production parity audit against `minimaz-cli`):

- `executeCommand` spawned `npm` inheriting the invoking process's full
  `process.env`, including any `npm_config_*` vars set by the invoking npm
  process (e.g. a global `allow-scripts` allowlist) — `npm i` inside a
  freshly scaffolded `init` project then hit `EALLOWSCRIPTS`, since that
  config is rejected as an inherited, project-scoped setting for a
  different `package.json`. Now strips only the `allow-scripts` config var
  (`npm_config_allow_scripts`, any case, `-` or `_`) before spawning `npm`;
  registry/proxy/auth `npm_config_*` vars are still inherited.
- `@minimaz/cli` had dropped `minimaz-cli`'s single-letter command aliases
  (`b`/`c`/`i`/`t` for `build`/`clear`/`init`/`template`) entirely; restored.
- `init` wrapped its optional `npm i`/`git init` steps in a try/catch that
  deleted the entire scaffolded `targetDir` on any failure —
  `minimaz-cli` never did this. A missing `gh`/`glab` binary or a flaky
  `npm i` silently wiped the freshly-created project, including
  `node_modules` if npm had already succeeded. Removed; a failed step now
  leaves the partial project in place for the user to fix, matching
  `minimaz-cli`.
- `handleCliError` always logged an unexpected error's full stack trace;
  `minimaz-cli` only did this when `DEBUG=true`, otherwise logging just the
  message. Restored the `DEBUG` gate.
- `writeSettings`'s `Settings` schema dropped `minimaz-cli`'s write-only
  `npmGlobalPath` field, so anyone who'd run the old CLI's `config` at least
  once got a permanent "Unknown key" warning from the new one. Restored the
  field, computed without shelling out to `npm config get prefix` (which
  `minimaz-cli` does) — `guessNpmGlobalPath` reads `npm_config_prefix` when
  present instead, since shelling out from `config`/`postinstall` risks the
  same nested-npm-env-inheritance class of bug as the `EALLOWSCRIPTS` fix
  above.
- `template --delete`'s confirm-prompt default was found flipped from
  `minimaz-cli`'s `[Y/n]` (Enter deletes) to `[y/N]` (Enter cancels) —
  reviewed and kept as the new, safer default; this one is an intentional
  divergence, not a bug.

Found and fixed on 2026-09-23 (code-review passes and the test-coverage plan):

- `build` and `clear` only checked that `output.dir` was inside `cwd`, never
  that it didn't overlap `input.dir` or a local `input.externals` source — an
  `output.dir` equal to, containing, or nested in the source was wiped. Both
  now refuse via `@minimaz/core`'s `pathsOverlap`, which is case-insensitive on
  Windows/macOS so `./Src` vs `src` can't slip past. The external check also
  used to skip any key starting with `http`, so a local `httpdocs/...` external
  was never checked; only `http://`/`https://` keys count as remote now.
- `build` logged an error and exited 0 on a missing or empty `input.dir`; it
  now throws a `KnownError`.
- `build`/`clear` passed a relative `cwd` straight to `isPathInside`, so every
  config was refused as unsafe; `cwd` is now resolved first.
- `tools/builder` and `tools/cleaner` ran their full build/clean the moment
  they were imported — including by their own tests — so every `npm test`
  started a repo-wide clean and build mid-run, randomly deleting `dist/*.js`
  (previously blamed on antivirus). Both now run only as the process entry
  point (`isEntryPoint`, which also resolves symlinks/junctions and a
  missing `.js` extension). `resolveTargetDirs` also compares the drive
  letter case-insensitively.
- The root `vitest.config.ts` listed projects as directory-glob strings, which
  never inherit root `test` options, so `clearMocks`/`restoreMocks` silently
  applied to no package — mocks and spies leaked between tests. Projects are
  now inline configs with `extends: true`.
- Every package's own `npm test` (`vitest run --root ../.. packages/<name>`) resolved its path filter
  against the package directory, matched no files, and passed via `passWithNoTests` — per-package test
  runs silently ran nothing. Scripts now select `--project <package-name>`.
- `tools/builder`'s `resolveEntryPoints` treated `./dist/x.js` and `dist/x.js` as different entries and
  bundled the same file twice; paths are now deduplicated after stripping the leading `./`.
- `validateHtml` parsed `<script>`, `<style>`, `<textarea>` and `<title>`
  contents as markup, so `mz validate` rejected any page with `a < b` in an
  inline script. Their contents are now treated as text up to a real end tag.

## Package dependency graph

```txt
@minimaz/config
  ├── @minimaz/json
  └── @minimaz/logger

@minimaz/html
  └── @minimaz/validate

@minimaz/sitekit (minimaz/mz bin)
  └── @minimaz/cli

@minimaz/cli
  ├── @minimaz/bundler  (build command's JS/TS import rewriting)
  ├── @minimaz/core
  ├── @minimaz/local-server
  ├── @minimaz/logger
  ├── @minimaz/config
  ├── @minimaz/markdown
  ├── @minimaz/templates
  ├── @minimaz/validate
  ├── @minimaz/css      (build command's CSS processor)
  ├── @minimaz/js       (build command's JS processor)
  ├── @minimaz/html     (build command's HTML processor)
  └── @minimaz/ts       (build command's TS processor)

@minimaz/templates
  ├── @minimaz/core
  └── @minimaz/logger

@minimaz/local-server   (dependency-free node:http dev server, SSE live reload, clean URLs/SPA fallback/directory listing/cache-control)
  └── @minimaz/logger

@minimaz/bundler   (JS/TS import-graph resolver, depends on @minimaz/ts — used by @minimaz/cli's build)

@minimaz/core     (filesystem utilities)
@minimaz/logger    (structured logging + KnownError/handleCliError, zero deps)
@minimaz/css       (CSS minify/bundle, zero deps)
@minimaz/js        (JS minify, zero deps)
@minimaz/json      (JSON parse/minify/format, zero deps)
@minimaz/ts        (TS transpile, depends on `typescript`)
@minimaz/validate   (CSS/HTML/JS/TS/JSON structural validation, depends on `@minimaz/logger`, `typescript`)
```

## Known cleanup opportunities (not yet actioned)

Found during a 2026-07-31 quality pass, deliberately left alone because each
needs an architectural call rather than a mechanical fix:

- **CI runs lint/format/typecheck/build/test as one sequential job**
  (`.github/workflows/ci.yml`). They're independent checks; splitting into
  parallel jobs would cut wall-clock CI time roughly to the slowest single
  check instead of their sum.
- **`if (typeof code !== 'string') throw ...` is duplicated ~10x** across
  `@minimaz/css`, `@minimaz/html`, `@minimaz/js`, `@minimaz/json`,
  `@minimaz/ts`, and `@minimaz/validate`. No shared assertion helper exists;
  adding one means introducing new dependency edges between packages that
  are currently zero-dep/standalone on purpose.
- **CSS string/comment tokenizing is duplicated** between `@minimaz/css`'s
  `minify.ts` and `@minimaz/validate`'s `css.ts` — one file walks the source
  to strip it, the other to structurally check it, but the string-literal
  and `/* */`-comment scanning logic is copy-pasted between them.
- **JSON-parse-with-wrapped-error is duplicated 3x** — `@minimaz/core`'s
  `readJsonFile`, `@minimaz/json`'s `parseJson`, and `@minimaz/validate`'s
  `validateJson` each independently wrap `JSON.parse` in the same
  try/catch-and-normalize shape. No dependency edge ties any of the three
  together today (see the dependency graph above).
- **`@minimaz/config` and `@minimaz/cli`'s `docs` command hand-roll fs/console
  primitives** (`mkdir`+`writeFile`, `existsSync`, raw `console.*`) instead
  of depending on `@minimaz/core` (`outputFile`, `pathExists`,
  `readJsonFile`) and `@minimaz/logger`. `loadConfig` is already documented
  in-code as a stand-in until a real `@minimaz/core`-based loader exists.
- **`init` and `docs init` each independently write a mutually-exclusive
  half of `minimaz.config.json`.** `packages/cli/src/commands/init/main.ts`
  writes a build-only template and bails if the file exists;
  `packages/cli/src/commands/docs/main.ts`'s `docsInit` writes a docs-only
  template and also bails if the file exists — so running both in either
  order leaves one section never populated (though `@minimaz/config`'s
  `loadConfig` defaults whichever section is missing, so this degrades
  gracefully rather than breaking). Unifying these into one config-aware
  scaffolder is real design work.
- **`build`'s `output.js.bundling` is import rewriting, not concatenation, and
  can emit imports that 404.** It rewrites imports per file (native ESM) and
  doesn't pull in files the walk wouldn't already emit, so the rewritten import
  can 404 at runtime when its target is skipped by `input.exclude`, falls
  outside `input.dir`, or lives in a top-level folder remapped by
  `input.mapping`. Known limitation: an absolute specifier resolving to a
  different Windows drive can't be expressed as a relative specifier.

## Keeping this doc honest

Update this file whenever a package moves between these three states. If
you're picking up work described as "in progress" or "planned" here, check
this doc is still accurate before relying on it — it reflects the state as
of the date of the most recent edit, not a live build status.
