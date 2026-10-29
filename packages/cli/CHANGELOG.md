# @minimaz/cli

## 0.4.1

### Patch Changes

- [`cad2645`](https://github.com/zellerindustries/minimaz-monorepo/commit/cad2645d26b83550cec5072c933e633186ef8f5b) Thanks [@zeller-dev](https://github.com/zeller-dev)! - `init --npm` now scaffolds a `package.json` with `build` (`minimaz build`) and `start` (`minimaz serve`) scripts, `@minimaz/sitekit` as a devDependency instead of `serve`, and `"type": "module"`.

- [`a7ea34d`](https://github.com/zellerindustries/minimaz-monorepo/commit/a7ea34d0de8206f8044e060b5c455608875da797) Thanks [@zeller-dev](https://github.com/zeller-dev)! - `minifyJs` is now a real minifier. It parses the source, renames local variables, parameters, functions and classes to the shortest safe names, and prints the program with no optional whitespace, statements joined with `;` only where needed and minimal parentheses. Comments are dropped (including `/*! … */`), a leading `#!` line is kept, and only value-preserving literal rewrites are made (`.5`, `1e3`, `!0`, `void 0`, `{a:1}`, `a.b`, shortest quotes). Nothing is removed, reordered or inlined. String literals and untagged template text are printed ASCII-only, with each non-ASCII character escaped to the same value (`"caf\xe9"`); identifiers, regex literals and tagged template text keep their characters as written.

    Top-level names are renamed only in ES modules, never when exported, so a classic script's globals stay reachable from HTML and other scripts. A direct `eval` or a `with` disables renaming in its own scope, every enclosing scope and every nested scope (at the top level, the whole file). `.name` and `toString()` change for renamed function and class declarations, and also for anonymous functions, arrows and classes whose name is inferred from a renamed binding (`const handleClick = () => {}` becomes `const a=()=>{}`, so its `.name` is `"a"`; the same goes for `const Widget = class {}; export default Widget`). This affects React display names, logged `fn.name` values and class names read at runtime (custom elements, errors); pass `{ mangle: false }` to keep every name.

    When a file can't be parsed (a syntax error, an unsupported construct or very deep nesting, such as a `+` chain of a few thousand terms), or uses top-level `await` without `import`/`export`, `minifyJs` falls back to whitespace-only minification: comments and unnecessary whitespace are removed, and line breaks that automatic semicolon insertion might depend on are kept. This fallback is silent: nothing is renamed and no warning is given. An unterminated string, template literal, regex or block comment throws `minifyJs: unterminated … at offset N`.

    `build` with `output.js.minify: true` now produces this output, and reports a `minifyJs:` error as a normal error naming the source file rather than as a bug.

- Updated dependencies [[`717d888`](https://github.com/zellerindustries/minimaz-monorepo/commit/717d888b09daf685e83803af13a2ea40043c442f), [`a7ea34d`](https://github.com/zellerindustries/minimaz-monorepo/commit/a7ea34d0de8206f8044e060b5c455608875da797)]:
    - @minimaz/core@0.3.1
    - @minimaz/js@0.2.0

## 0.4.0

### Minor Changes

- [`2c5d45a`](https://github.com/zellerindustries/minimaz-monorepo/commit/2c5d45a31b84e85578891784595cd8aeaac9ad16) Thanks [@zeller-dev](https://github.com/zeller-dev)! - `build` now supports `output.js.bundling: true` instead of throwing. Relative imports in JS/TS are rewritten to the emitted `.js` paths and output is native ES modules, one file per source file (no single-file concatenation), so HTML must load scripts with `<script type="module">`. npm/bare specifiers are left untouched; an unresolvable relative import is reported as a `KnownError`. TypeScript syntax errors in `.ts`/`.tsx` sources are now reported as build errors (naming the file) instead of "this looks like a bug".

### Patch Changes

- [`8e9cd82`](https://github.com/zellerindustries/minimaz-monorepo/commit/8e9cd8221578a9cbc5f13fd3a624a52ccac9be19) Thanks [@zeller-dev](https://github.com/zeller-dev)! - `init` no longer accepts `--gitremote`. It was parsed but never used; pass the remote URL to `--gitprovider` instead (`--gitprovider=<url>`).
- Updated dependencies [[`2c5d45a`](https://github.com/zellerindustries/minimaz-monorepo/commit/2c5d45a31b84e85578891784595cd8aeaac9ad16)]:
    - @minimaz/bundler@0.3.0

## 0.3.0

### Minor Changes

- Docs output no longer lands inside the build output directory, where `minimaz build` and `minimaz clear` would wipe it: `minimaz docs build` now writes to a sibling `<output.dir>-docs/html` and `<output.dir>-docs/pdf` (default `dist-docs/html` and `dist-docs/pdf`, previously `dist/html` and `dist/pdf`, which ignored `output.dir` entirely). New `resolveDocsOutputDirs(outputDir)` derives these; the `outputDirs` constant now holds the new defaults.

    `loadConfig` now type-checks every known field and throws a single `ConfigValidationError` (a `KnownError` whose `errors` lists every bad field, e.g. `serve.port: "3000"`, `input.exclude: "node_modules"`) instead of passing wrong types through; an explicit `null` still counts as unset and gets the default, as before; unknown keys are logged as warnings. A config file that exists but can't be read (e.g. `EISDIR`, `EACCES`) now throws `ConfigReadError` naming the real cause instead of `ConfigNotFoundError`. `ConfigNotFoundError` only suggests an init command when the caller passes one (`loadConfig(cwd, { initCommand })`): `build`/`clear`/`serve` now suggest `minimaz init`, `docs build` suggests `minimaz docs init`. The `.gitignore` written by `minimaz init` now also ignores `dist-docs`.

### Patch Changes

- `build` no longer wipes the previous output before building. It now writes into a sibling temp directory (`<output.dir>.minimaz-tmp`) and only replaces `output.dir` once the whole build succeeds. A failed build (e.g. a missing CSS `@import`) leaves the last good output untouched and removes the temp directory. The swap moves the previous output aside to `<output.dir>.minimaz-old`, moves the new build in, then deletes the backup. If moving the new build in fails, the previous output is restored and the error names the directory holding the new build. Each rename is retried briefly on Windows' transient EPERM/EACCES/EBUSY. Leftover scratch directories from a crashed run are cleaned up, or restored as `output.dir` if it went missing. Scratch directories that would overlap `input.dir` or a local external are refused, the same as `output.dir`. `minimaz init`'s `.gitignore` now ignores `*.minimaz-tmp` and `*.minimaz-old`.

- Harden command dispatch: inherited object properties (`constructor`, `toString`, `__proto__`) are now reported as unknown commands instead of being invoked or crashing. `minimaz help <alias>` (e.g. `help i`) now resolves to the aliased command, and help usage lines list the alias on its own `Alias:` line instead of a pipe-separated `init | i`.

- `minimaz docs build` now validates every Markdown file before writing anything and fails with a `KnownError` listing each problem as `<file>: <error>` (e.g. `guides/b.md: Unterminated code fence opened at line 3`), instead of silently letting an unterminated code fence swallow the rest of the file. Files are validated individually even when bundling, so line numbers refer to the source file. Bundled output now separates files with a horizontal rule instead of visible HTML-comment text.

- When an `init` npm/git step fails, the error now names the project directory that was left in place and says to rerun the failed step manually, with the original error chained as `cause`.

- Stop `init` from deleting the entire scaffolded project when the optional `npm install`/`git init` step fails. Matches `minimaz-cli`'s original behavior: a failed step now leaves the partially-created project in place to fix manually, instead of silently wiping it (including any already-installed `node_modules`).

- Fix `init`'s `npm install` step failing with `EALLOWSCRIPTS` when the invoking shell has a global `allow-scripts` npm config set. The nested `npm` command spawned in the new project directory now runs without the inherited `allow-scripts` config variable (`npm_config_allow_scripts`, matched in any case with `-` or `_`); every other `npm_config_*` variable (registry, proxy, auth) is still inherited.

- Add `minimaz-cli`'s single-letter command aliases (`b`/`c`/`i`/`t` for `build`/`clear`/`init`/`template`) to `@minimaz/cli`, completing command parity with the original CLI.

- User mistakes are now reported as plain errors instead of "This looks like a bug — please report it.": a missing `--path`, missing file or unsupported extension in `validate`; an unknown `docs` subcommand; an existing `init` target directory; a cancelled `template` save; and `build` CSS-bundling failures (missing or circular `@import`, `supports()`/`layer` imports), which keep the original error as `cause`.

- `getFileContent` now rejects with a `KnownError` (original error as `cause`) when a path cannot be read, instead of logging and returning an empty string. `minimaz validate` on an unreadable path (e.g. a directory named `x.css`) now fails with exit code 1 instead of reporting `Valid`, and `bundleCss` throws on an unreadable `@import` instead of silently inlining nothing.
- Updated dependencies [`38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `48dbb77`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `38ce4e2`, `1f121cb`, `38ce4e2`]:
    - @minimaz/config@0.3.0
    - @minimaz/core@0.3.0
    - @minimaz/css@0.1.2
    - @minimaz/html@0.1.1
    - @minimaz/js@0.1.1
    - @minimaz/local-server@0.3.0
    - @minimaz/logger@0.2.1
    - @minimaz/markdown@0.2.1
    - @minimaz/templates@0.3.0
    - @minimaz/validate@0.1.2

## 0.2.0

### Minor Changes

- Add the `build` command to @minimaz/cli, porting minimaz-cli's two-pass discovery/processing
  build pipeline using this monorepo's zero-dependency tooling (`@minimaz/css`, `@minimaz/js`,
  `@minimaz/html`, `@minimaz/ts`) instead of esbuild. JS/TS import-graph bundling
  (`output.js.bundling: true`) is not yet supported and throws a clear error — only per-file
  minification is available for JS/TS in this pass.

- Add the `clear` command to @minimaz/cli, porting minimaz-cli's behavior: removes the configured build output
  directory (from `output.dir` in `minimaz.config.json`), refusing to delete the project root itself as a safety
  check.

- Add config-driven `serve` support: `@minimaz/config` gains a new `serve` section in `minimaz.config.json`,
  `@minimaz/local-server` adds optional `LocalServerOptions` fields for clean URLs, SPA fallback, directory
  listing, and cache-control/ETag support, and `@minimaz/cli` wires `@minimaz/local-server` in as a new `serve`
  command. All additive — no breaking changes.

- @minimaz/logger now provides a KnownError marker class and a shared handleCliError() top-level error handler.
  ConfigNotFoundError, ValidationError, TemplateNotFoundError, and InvalidTemplateNameError now extend KnownError.
  @minimaz/cli's runCli() now always prints the stack trace for an unexpected (non-KnownError) failure instead of
  gating it behind DEBUG=true — a visible CLI output change.

- @minimaz/sitekit is now the published minimaz/mz CLI bin, wrapping @minimaz/cli's commands.
  @minimaz/cli no longer publishes its own bin, and its postinstall script (which bootstrapped
  ~/.minimaz/) was removed — install @minimaz/sitekit instead, which publishes the bin and runs
  the equivalent postinstall bootstrap.

### Patch Changes

- `build` and `clear` now refuse an `output.dir` that equals, contains, or sits inside `input.dir` or a local `input.externals` source (compared case-insensitively on Windows and macOS), instead of deleting it. `build` now fails with an error on a missing or empty `input.dir` instead of exiting successfully, and both commands accept a relative working directory. Only `http://`/`https://` `input.externals` keys are treated as remote; a local path such as `httpdocs/vendor` is now checked like any other. `@minimaz/core` exports the new `pathsOverlap(a, b)` helper these checks use.
- Updated dependencies [`344f498`, `344f498`, `8ced647`, `6bfafff`, `b04042c`, `31be60a`, `7fc77c9`, `344f498`]:
    - @minimaz/config@0.2.0
    - @minimaz/markdown@0.2.0
    - @minimaz/templates@0.2.0
    - @minimaz/core@0.2.0
    - @minimaz/local-server@0.2.0
    - @minimaz/logger@0.2.0
    - @minimaz/validate@0.1.1
    - @minimaz/css@0.1.1
