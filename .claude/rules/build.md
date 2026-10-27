---
paths:
    - '**/tsconfig*.json'
    - 'scripts/**'
    - 'packages/*/package.json'
---

# Build and typecheck

Each `tsconfig.json`/`tsconfig.build.json` declares an explicit `references` array
to its `@minimaz/*` dependencies (not inherited through `extends` — TypeScript requires `references` to be
repeated in every config that needs it), so `tsc -b` builds dependencies before dependents even from a clean
checkout; keep that array in sync whenever a package's internal dependencies change, in both its `tsconfig.json`
(pointing at sibling directories) and its `tsconfig.build.json` (pointing at sibling `tsconfig.build.json` files).

`npm run validate`'s bare `tsc -b` (unlike `npm run build`'s `tsc -b tsconfig.build.json`) doesn't exclude test
files, so it re-emits stray `*.test.js` (and test helpers under `__tests__/`) into each package's `dist/`;
`scripts/bundle.mjs` (the last step of every package's `build`) deletes those again, removing every `dist/**/__tests__`
and `__mocks__` directory whole. `vitest.config.ts` excludes `**/dist/**`, so those stray copies never run as tests.

If `tsc -b` reports a project "up to date" (no errors, nothing emitted) but its `dist/` is missing or incomplete,
its `.tsbuildinfo` cache (under `node_modules/.cache/tsc/`) has gone stale relative to the actual output — this
happens after switching branches/worktrees or an interrupted build. `tsc -b --force` (or `tsc -b <path> --force`
for just the affected project) ignores the cache and re-emits for real; do this for both the plain `tsconfig.json`
graph and the `tsconfig.build.json` graph independently; forcing one does not fix the other's cache.
