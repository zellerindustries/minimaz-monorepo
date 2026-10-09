---
'@minimaz/js': patch
---

`minifyJs` no longer trims indentation or collapses blank lines inside multi-line template literals (including nested `${}` templates) and backslash-continued strings; their contents are now preserved byte-for-byte.
