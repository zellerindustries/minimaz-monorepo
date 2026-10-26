---
'@minimaz/bundler': minor
---

Add `resolveFileImports(filePath, source?)`, which transpiles a single JS/TS file and rewrites its relative imports to emitted `.js` paths; an optional `source` string is used instead of reading the file from disk. `.TS`/`.TSX` (uppercase extensions) are now transpiled, and `BundlerError` is thrown on an unresolvable relative import or relative dynamic import.
