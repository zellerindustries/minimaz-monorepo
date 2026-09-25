# @minimaz/core

## 0.2.0

### Minor Changes

- `build` and `clear` now refuse an `output.dir` that equals, contains, or sits inside `input.dir` or a local `input.externals` source (compared case-insensitively on Windows and macOS), instead of deleting it. `build` now fails with an error on a missing or empty `input.dir` instead of exiting successfully, and both commands accept a relative working directory. Only `http://`/`https://` `input.externals` keys are treated as remote; a local path such as `httpdocs/vendor` is now checked like any other. `@minimaz/core` exports the new `pathsOverlap(a, b)` helper these checks use.

- Add `applyReplacements(content, replacements)` — a plain literal-substring replacement
  helper, used by `@minimaz/cli`'s new `build` command.

### Patch Changes

- Updated dependencies [`7fc77c9`]:
    - @minimaz/logger@0.2.0
