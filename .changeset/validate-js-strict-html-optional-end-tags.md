---
'@minimaz/validate': patch
---

`validateJs` now parses its input as JavaScript, so TypeScript-only syntax (type annotations, interfaces) is rejected instead of silently accepted. `validateHtml` understands HTML5 optional end tags (`li`, `p`, `dt`, `dd`, `tr`, `td`, `th`, `thead`, `tbody`, `tfoot`, `option`, `optgroup`, `colgroup`, `caption`, `rb`, `rt`, `rp`): they are closed implicitly by sibling start tags and parent end tags and no longer reported as unclosed, and a mismatched closing tag is reported once instead of cascading into an error per open tag.
