# @minimaz/css

## 0.2.0

### Minor Changes

- [`ef635d5`](https://github.com/zellerindustries/minimaz-monorepo/commit/ef635d58ca747876114c3ea55b915bf9caa1df30) Thanks [@zeller-dev](https://github.com/zeller-dev)! - `bundleCss` accepts an optional `transform` applied to each file's source before its `@import`s are resolved and its `url()`s are rebased. `build` uses it to apply `output.replace` per file, so replace keys written against authored text (e.g. `../node_modules/…/font.woff2` in an imported stylesheet) match again instead of seeing the rebased `./node_modules/…` path.

## 0.1.2

### Patch Changes

- `getFileContent` now rejects with a `KnownError` (original error as `cause`) when a path cannot be read, instead of logging and returning an empty string. `minimaz validate` on an unreadable path (e.g. a directory named `x.css`) now fails with exit code 1 instead of reporting `Valid`, and `bundleCss` throws on an unreadable `@import` instead of silently inlining nothing.

- `bundleCss` now rewrites `url()` references once per file (nested imports no longer get a doubled directory prefix), inlines unquoted `@import url(x.css)`, wraps `@import` with a media query in `@media`, and throws on `supports()`/`layer` import conditions instead of leaving them un-inlined. A non-relative `@import url(x.css)` inside a nested file is left un-inlined but its `url()` is rewritten against the entry directory, as before; a bare `@import "x.css"` string is left as-is.
- Updated dependencies [`38ce4e2`]:
    - @minimaz/core@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [`344f498`, `6bfafff`]:
    - @minimaz/core@0.2.0
