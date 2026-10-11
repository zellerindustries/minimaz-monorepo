# @minimaz/html

## 0.1.1

### Patch Changes

- The re-exported `validateHtml` now accepts HTML5 optional end tags (`li`, `p`, `td`, `option`, …) instead of reporting them as unclosed, and reports a mismatched closing tag once instead of once per open tag.

- Bump the `@minimaz/validate` dependency range to `^0.1.1` to match the version already resolved in the workspace.
- Updated dependencies [`38ce4e2`]:
    - @minimaz/validate@0.1.2
