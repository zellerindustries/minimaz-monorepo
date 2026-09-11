# @minimaz/builder-tools

Internal `esbuild`-based bundler for `@minimaz/*` packages' publish output. **Not published** — a
workspace-only dependency of every package's own `build` script.

## Usage

Each package's `build` script runs `tsc -p tsconfig.json` (declarations/type-checking) followed by:

```bash
node ../../tools/builder/dist/cli.js
```

from inside the package directory, or with `--all` from the repo root to bundle every `packages/*` and
`toolkits/*` package in one pass (this is what the root `build` script does).

## What it does

- Resolves each package's real esbuild entry points from its `package.json` `main`/`bin` fields, mapping every
  `dist/*.js` path back to the matching `src/*.ts` source (`resolveEntryPoints`). Multiple `bin` entries pointing
  at the same compiled file collapse into one entry point.
- Bundles each entry point with `esbuild`: minified, ESM, `node24` target, no sourcemaps. `dependencies` and
  `devDependencies` (plus `node:*`) are externalized rather than bundled, so cross-package `@minimaz/*` imports
  still resolve the normal npm-workspace way at runtime, and build order across packages doesn't matter.
- Deletes stray `*.test.d.ts`/`.map` files that `tsc`'s declaration emit leaves in `dist` from colocated test
  files (`cleanupTestDeclarations`) — `tsc` type-checks and declares every file in the program, tests included.
- When it deletes any, also removes that package's `.tsbuildinfo` (cached under the package's own
  `node_modules/.cache/tsc/`) to force a clean rebuild next time instead of a `tsc -b` incremental-state
  mismatch (TS6305).

## API

- `buildPackage(packageDir)` — runs the full bundle + cleanup for one package directory.
- `discoverPackageDirs(repoRoot)` — lists every `packages/*` and `toolkits/*` directory, for the CLI's `--all`
  mode. Must be called with the repo root, since the root build script's contract is that it always invokes this
  from there.
- `resolveEntryPoints(manifest, packageDir)` / `resolveExternals(manifest)` / `cleanupTestDeclarations(distDir)` —
  the individual steps above, exported for testing.
