---
'@minimaz/cli': minor
---

Add the `build` command to @minimaz/cli, porting minimaz-cli's two-pass discovery/processing
build pipeline using this monorepo's zero-dependency tooling (`@minimaz/css`, `@minimaz/js`,
`@minimaz/html`, `@minimaz/ts`) instead of esbuild. JS/TS import-graph bundling
(`output.js.bundling: true`) is not yet supported and throws a clear error — only per-file
minification is available for JS/TS in this pass.
