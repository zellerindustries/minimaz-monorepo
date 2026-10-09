---
'@minimaz/css': patch
---

`bundleCss` now rewrites `url()` references once per file (nested imports no longer get a doubled directory prefix), inlines unquoted `@import url(x.css)`, wraps `@import` with a media query in `@media`, and throws on `supports()`/`layer` import conditions instead of leaving them un-inlined. A non-relative `@import url(x.css)` inside a nested file is left un-inlined but its `url()` is rewritten against the entry directory, as before; a bare `@import "x.css"` string is left as-is.
