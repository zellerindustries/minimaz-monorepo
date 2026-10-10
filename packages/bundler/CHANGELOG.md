# @minimaz/bundler

## 0.2.1

### Patch Changes

- `resolveModuleGraph` now resolves extensionless imports of dotted module names (`./utils.config`, `./foo.min`, dotted directories) instead of treating them as assets, only leaving a specifier alone when it is a real non-code file or nothing resolves. A dotfile module such as `.env.js` is now rewritten to `./.env.js`.

## 0.2.0

### Minor Changes

- Add @minimaz/bundler: a new published package providing resolveModuleGraph(), a zero-dependency relative-import
  module graph resolver (transpiles TS via @minimaz/ts, resolves extension-agnostically, dedups circular imports,
  rewrites specifiers) — the first piece of porting minimaz-cli's esbuild-based build command into a
  from-scratch equivalent. The build/clear CLI commands themselves are not yet ported.
