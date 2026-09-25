# @minimaz/config

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
