---
'@minimaz/html': patch
---

The re-exported `validateHtml` now accepts HTML5 optional end tags (`li`, `p`, `td`, `option`, …) instead of reporting them as unclosed, and reports a mismatched closing tag once instead of once per open tag.
