---
name: verifying-monorepo-changes
description: Use when about to report work in minimaz-monorepo as done, verified, passing, or ready to commit — or when tests fail with "Failed to resolve entry for package @minimaz/...", or tsc -b says a project is up to date but its dist/ is missing files.
---

# Verifying Monorepo Changes

## Overview

A change is verified only by the same gate CI runs, from a clean state: `clean → validate → build → test`. Tests
resolve other `@minimaz/*` packages through their built `dist/`, so a stale or partial build makes results lie in
both directions.

## The gate

Run from the repo root, in this order, and check each exit code:

```bash
npm run clean      # every package's dist/ + node_modules/.cache/tsc, then root node_modules/.cache
npm run validate   # lint + format:check + typecheck (root)
npm run build      # every package's own build: tsc -b tsconfig.build.json && node ../../scripts/bundle.mjs
npm test           # every package's own `vitest run --project <name>` — one run per workspace, then `test:scripts`
```

- `npm run verify` (validate → build → test, run by the pre-push hook) is the same gate without the initial
  `clean`; use the full sequence above when `dist/` state is in doubt.
- Use the **root** scripts. A package's own `validate` skips `format:check`, and a package's own `test` skips
  every package that depends on it (e.g. a `@minimaz/css` change can break `@minimaz/cli`).
- While iterating, a single file is fine: `npx vitest run packages/css/src/__tests__/minify.test.ts` — but build
  the changed package first (`npm run build -w @minimaz/css`) if another package's tests import it.

## Reading the test result

`npm test` prints one summary per workspace (plus one for the `test:scripts` project), so there is no single total. Sum them:

```bash
npm test > test.log 2>&1; echo "exit $?"
grep -E "Tests +[0-9]+ passed" test.log | awk '{s+=$2} END {print "tests passed:", s}'
grep -E "Test Files +[0-9]+ passed" test.log | awk '{s+=$3} END {print "test files:", s}'
grep -cE "[0-9]+ failed" test.log     # must be 0
```

Report the summed totals and compare them with the previous run: an unexplained drop means tests stopped
running (a project matched no files), not that they pass.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Failed to resolve entry for package "@minimaz/x"` | x's `dist/` is missing or partial | `ls packages/x/dist`; rebuild with `npm run build -w @minimaz/x`. It is a build-state problem, not a flaky environment |
| `tsc -b` says "up to date" but `dist/` lacks files | stale `.tsbuildinfo` in the package's `node_modules/.cache/tsc/` | `npm run clean` (or that package's `clean`), then rebuild. `tsc -b --force` also works for one project |
| Test count dropped after a config/script change | a Vitest project or test script now matches nothing; `passWithNoTests` hides it | check each workspace's summary in the log; per-package `test` must use `--project <name>`, not a path |
| Compiled `*.test.js` in `dist/` | a plain `tsc -b` (typecheck) emitted tests | harmless: Vitest excludes `dist/`, and `scripts/bundle.mjs` deletes them on the next build |

## Before claiming done

- All four commands exited 0, from a clean state.
- The summed test total is stated, with `0` failed.
- Each package's `main`/`bin` file exists after `build`:

```bash
for p in packages/* toolkits/*; do node -e "const p=require('./$p/package.json');const b=typeof p.bin==='string'?[p.bin]:Object.values(p.bin??{});for(const f of [p.main,...b].filter(Boolean))if(!require('fs').existsSync('$p/'+f))console.log('missing $p/'+f)"; done
```

No output means every entry file was built.
