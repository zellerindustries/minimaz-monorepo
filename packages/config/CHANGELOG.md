# @minimaz/config

## 0.4.0

### Minor Changes

- [`a4c1375`](https://github.com/zellerindustries/minimaz-monorepo/commit/a4c13756a64f85f5fa8d092f3a2ef35f76e72b1f) Thanks [@zeller-dev](https://github.com/zeller-dev)! - Breaking: `mz build` now refuses to replace an existing `output.dir` when run non-interactively, and asks `[y/N]` when run in a terminal; pass `--overwrite` to skip the question. A failed build still keeps the previous output. `mz serve` now defaults to port 4173 (was a random free port), warns when `serve.port` is not set in `minimaz.config.json`, and errors if the port is already in use. `@minimaz/config`'s `serve.port` default is now 4173 and `loadConfig` returns a new `serve.portDefaulted` flag.

## 0.3.0

### Minor Changes

- `bundleSeparator` is now a Markdown thematic break (`'\n\n---\n\n'`) instead of an HTML comment: `@minimaz/markdown` has no raw-HTML support, so the comment rendered as visible `<!-- ===... -->` text between bundled docs files in both HTML and PDF. Bundled files are now divided by a horizontal rule.

- Docs output no longer lands inside the build output directory, where `minimaz build` and `minimaz clear` would wipe it: `minimaz docs build` now writes to a sibling `<output.dir>-docs/html` and `<output.dir>-docs/pdf` (default `dist-docs/html` and `dist-docs/pdf`, previously `dist/html` and `dist/pdf`, which ignored `output.dir` entirely). New `resolveDocsOutputDirs(outputDir)` derives these; the `outputDirs` constant now holds the new defaults.

    `loadConfig` now type-checks every known field and throws a single `ConfigValidationError` (a `KnownError` whose `errors` lists every bad field, e.g. `serve.port: "3000"`, `input.exclude: "node_modules"`) instead of passing wrong types through; an explicit `null` still counts as unset and gets the default, as before; unknown keys are logged as warnings. A config file that exists but can't be read (e.g. `EISDIR`, `EACCES`) now throws `ConfigReadError` naming the real cause instead of `ConfigNotFoundError`. `ConfigNotFoundError` only suggests an init command when the caller passes one (`loadConfig(cwd, { initCommand })`): `build`/`clear`/`serve` now suggest `minimaz init`, `docs build` suggests `minimaz docs init`. The `.gitignore` written by `minimaz init` now also ignores `dist-docs`.

### Patch Changes

- Updated dependencies [`38ce4e2`]:
    - @minimaz/logger@0.2.1

## 0.2.0

### Minor Changes

- Breaking: exported constants and functions now use camelCase names.

    - `@minimaz/config`: `CONFIG_FILE_NAME` → `configFileName`, `BUNDLE_SEPARATOR` → `bundleSeparator`, `BUNDLE_NAME` →
      `bundleName`, `DEFAULT_CONFIG` → `defaultConfig`, `DEFAULT_BUILD_CONFIG` → `defaultBuildConfig`, `OUTPUT_DIRS` →
      `outputDirs`, `EXTENSIONS` → `outputExtensions`.
    - `@minimaz/markdown`: `MdToHtml` → `mdToHtml`, `MdToPdf` → `mdToPdf`.
    - `@minimaz/templates`: `DEFAULT_TEMPLATE_NAMES` → `defaultTemplateNames`.

- Add config-driven `serve` support: `@minimaz/config` gains a new `serve` section in `minimaz.config.json`,
  `@minimaz/local-server` adds optional `LocalServerOptions` fields for clean URLs, SPA fallback, directory
  listing, and cache-control/ETag support, and `@minimaz/cli` wires `@minimaz/local-server` in as a new `serve`
  command. All additive — no breaking changes.

### Patch Changes

- Change the default `output.js.bundling` value from `true` to `false`. JS/TS import-graph
  bundling isn't implemented by any consumer yet (`@minimaz/cli`'s `build` command throws if
  `js.bundling` is explicitly set to `true`) — the old default made a zero-config build fail
  immediately.

- @minimaz/logger now provides a KnownError marker class and a shared handleCliError() top-level error handler.
  ConfigNotFoundError, ValidationError, TemplateNotFoundError, and InvalidTemplateNameError now extend KnownError.
  @minimaz/cli's runCli() now always prints the stack trace for an unexpected (non-KnownError) failure instead of
  gating it behind DEBUG=true — a visible CLI output change.
- Updated dependencies [`7fc77c9`]:
    - @minimaz/logger@0.2.0
