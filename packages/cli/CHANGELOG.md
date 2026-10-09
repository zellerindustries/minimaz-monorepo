# @minimaz/cli

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
