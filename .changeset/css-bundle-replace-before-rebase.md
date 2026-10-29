---
'@minimaz/css': minor
'@minimaz/cli': patch
---

`bundleCss` accepts an optional `transform` applied to each file's source before its `@import`s are resolved and its `url()`s are rebased. `build` uses it to apply `output.replace` per file, so replace keys written against authored text (e.g. `../node_modules/…/font.woff2` in an imported stylesheet) match again instead of seeing the rebased `./node_modules/…` path.
