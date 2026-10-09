---
'@minimaz/cli': patch
---

`minimaz docs build` now validates every Markdown file before writing anything and fails with a `KnownError` listing each problem as `<file>: <error>` (e.g. `guides/b.md: Unterminated code fence opened at line 3`), instead of silently letting an unterminated code fence swallow the rest of the file. Files are validated individually even when bundling, so line numbers refer to the source file. Bundled output now separates files with a horizontal rule instead of visible HTML-comment text.
