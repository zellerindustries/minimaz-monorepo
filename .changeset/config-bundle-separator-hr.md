---
'@minimaz/config': minor
---

`bundleSeparator` is now a Markdown thematic break (`'\n\n---\n\n'`) instead of an HTML comment: `@minimaz/markdown` has no raw-HTML support, so the comment rendered as visible `<!-- ===... -->` text between bundled docs files in both HTML and PDF. Bundled files are now divided by a horizontal rule.
