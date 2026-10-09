# @minimaz/bundler

## 0.2.0

### Minor Changes

- Add @minimaz/bundler: a new published package providing resolveModuleGraph(), a zero-dependency relative-import
  module graph resolver (transpiles TS via @minimaz/ts, resolves extension-agnostically, dedups circular imports,
  rewrites specifiers) — the first piece of porting minimaz-cli's esbuild-based build command into a
  from-scratch equivalent. The build/clear CLI commands themselves are not yet ported.
