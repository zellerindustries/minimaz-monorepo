---
'@minimaz/markdown': patch
---

`mdToHtml` no longer emits clickable links with `javascript:`, `vbscript:` or `data:` URLs (case-insensitive, ignoring the tabs/newlines/control characters browsers strip): the link renders as its plain text, with no `<a>`. PDF output (`mdToPdf`): a word or code line longer than a whole line is now hard-split at the right margin instead of running off the page, tabs become four spaces instead of `?`, and a document whose last block ends at the bottom of a page no longer gets a trailing blank page.
