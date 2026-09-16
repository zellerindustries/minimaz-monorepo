# @minimaz/cleaner-tools

Internal monorepo artifact and cache cleaner. **Not published** — a workspace-only replacement for a bare
`tsc -b --clean`.

## Usage

```bash
npm run clean
```

from the repo root, which runs `node tools/cleaner/dist/main.js`.

## What it does

Globs and deletes, repo-wide: `**/dist`, `**/coverage`, `**/.cache`, `**/*.tsbuildinfo`.

Its `node_modules` guard (`isDependencyPath`) is deliberately not a blanket `path.includes('node_modules')`
exclusion — that would also prune traversal into `node_modules/.cache/tsc/`, where this repo's own build caches
live, silently no-opping most of the patterns above. Instead it only excludes real dependency content
(`node_modules/<pkg>/dist`, etc.), matched by real path segment on both sides of `node_modules` so a sibling like
`node_modules_backup/dist` isn't mistaken for it.

## API

- `isDependencyPath(filePath)` — the traversal-exclusion predicate above, exported for testing.
