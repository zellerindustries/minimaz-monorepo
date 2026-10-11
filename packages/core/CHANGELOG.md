# @minimaz/core

## 0.3.0

### Minor Changes

- `getFileContent` now rejects with a `KnownError` (original error as `cause`) when a path cannot be read, instead of logging and returning an empty string. `minimaz validate` on an unreadable path (e.g. a directory named `x.css`) now fails with exit code 1 instead of reporting `Valid`, and `bundleCss` throws on an unreadable `@import` instead of silently inlining nothing.

### Patch Changes

- Updated dependencies [`38ce4e2`]:
    - @minimaz/logger@0.2.1

## 0.2.0

### Minor Changes

- `build` and `clear` now refuse an `output.dir` that equals, contains, or sits inside `input.dir` or a local `input.externals` source (compared case-insensitively on Windows and macOS), instead of deleting it. `build` now fails with an error on a missing or empty `input.dir` instead of exiting successfully, and both commands accept a relative working directory. Only `http://`/`https://` `input.externals` keys are treated as remote; a local path such as `httpdocs/vendor` is now checked like any other. `@minimaz/core` exports the new `pathsOverlap(a, b)` helper these checks use.

- Add `applyReplacements(content, replacements)` — a plain literal-substring replacement
  helper, used by `@minimaz/cli`'s new `build` command.

### Patch Changes

- Updated dependencies [`7fc77c9`]:
    - @minimaz/logger@0.2.0
