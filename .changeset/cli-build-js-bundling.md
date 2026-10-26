---
'@minimaz/cli': minor
---

`build` now supports `output.js.bundling: true` instead of throwing. Relative imports in JS/TS are rewritten to the emitted `.js` paths and output is native ES modules, one file per source file (no single-file concatenation), so HTML must load scripts with `<script type="module">`. npm/bare specifiers are left untouched; an unresolvable relative import is reported as a `KnownError`. TypeScript syntax errors in `.ts`/`.tsx` sources are now reported as build errors (naming the file) instead of "this looks like a bug".
