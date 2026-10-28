---
paths:
    - 'packages/templates/src/seeds/**'
    - 'packages/cli/src/commands/init/__tests__/seeds.test.ts'
---

# Bundled seed templates

Seeds live in `packages/templates/src/seeds/<name>/` (`default` full multi-page site, `simple` blank, `docs` Markdown) and are copied to `dist/seeds` by `packages/templates/scripts/copy-seeds.mjs`. `seeds.test.ts` inits and builds every seed, so a seed that the pipeline cannot build fails CI.

Build limits a seed must respect:

- `output.replace` only rewrites `.css .js .ts .tsx .html`. Other files in `src/public/` (`robots.txt`, `sitemap.xml`, `llms.txt`, `security.txt`, SVGs) are copied verbatim, so they hard-code the same defaults as the config (`example.com`, `Acme Studio`); the seed `README.md` lists them.
- `output.js.bundling: true` rewrites relative imports to emitted `.js` paths (native ES modules, one file per source file, no concatenation). Split TypeScript is transpiled per file, so helper modules must be emitted and loaded via `<script type="module">`; do not list them in `input.exclude`.
- `outFile` is not a supported option.
- `input.mapping` flattens top-level folders, so `pages/legal/x.html` builds to `legal/x.html`; links are root-absolute and rely on `serve.cleanUrls` (the build itself emits `.html`).
- CSS `@import` partials are bundled into the entry and not emitted; a page-local stylesheet that is not imported (`legal/legal.css`) is emitted as its own file.
- Seeds ship no `.gitignore` (`init` writes one) and no `node_modules` or dev tooling. The project-root `README.md` in a seed is not published (it sits outside `src/`).
- Seed code is excluded from the package `tsc` and ESLint; the integration test is its only check, so extend it when you add a page or asset.
