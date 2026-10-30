---
name: adding-a-workspace-package
description: Use when creating a new @minimaz/* package (or toolkit) in minimaz-monorepo, or when a newly added package isn't built, tested, linted, or type-checked by the root scripts.
---

# Adding a Workspace Package

## Overview

A package is picked up automatically by npm workspaces (`packages/*`, `toolkits/*`), Vitest (one project per
directory) and ESLint. What is **not** automatic: TypeScript project references, the lockfile, the changeset, and
the docs that list every package. Copy an existing package with similar dependencies (e.g. `packages/css`) rather
than writing configs from scratch.

## Files to create (`packages/<name>/`)

| File | Content |
|---|---|
| `package.json` | Copy `packages/css/package.json`; change `name`, `description`, `keywords`, `repository.directory`, `homepage`, `dependencies`. Keep the scripts exactly (below). Version `0.1.0` |
| `tsconfig.json` | Copy; `tsBuildInfoFile: ./node_modules/.cache/tsc/<name>.tsbuildinfo`; `references` → each `@minimaz/*` dependency's directory, e.g. `{ "path": "../core" }` |
| `tsconfig.build.json` | Copy; `tsBuildInfoFile: …/<name>.build.tsbuildinfo`; `references` → each dependency's `tsconfig.build.json` |
| `src/core.ts`, `src/types.ts`, `src/index.ts` | Logic / types / barrel (`export *`, named exports only). `main.ts` only for a CLI entry |
| `src/__tests__/core.test.ts` | Tests, written first. Imports need `../core.js` |
| `README.md` | Usage, API list, and a "Depends on …" line. Required: `scripts/bundle.mjs` copies it to `dist/README.md` and fails the build without it |

Scripts (identical in every package):

```json
"build": "tsc -b tsconfig.build.json && node ../../scripts/bundle.mjs",
"clean": "rimraf ./dist ./node_modules/.cache/tsc",
"typecheck": "tsc -b",
"typecheck:watch": "tsc -p tsconfig.json --watch",
"lint": "eslint .",
"lint:fix": "eslint . --fix",
"validate": "npm run lint && npm run typecheck",
"test": "vitest run --root ../.. --project @minimaz/<name>",
"prepack": "npm run build"
```

`scripts/bundle.mjs` bundles every `main`/`bin` path (`dist/x.js` ← `src/x.ts`), so those fields decide what ships.
(`@minimaz/templates`' build additionally runs `copy-seeds.mjs`; a package with extra build steps adds them to its own `build`.)

## Existing files to modify

- **Root `tsconfig.json`** — add `{ "path": "./packages/<name>" }` to `references` (position is cosmetic).
- **Root `package.json`** — nothing: the `packages/*` workspace glob already covers it. Don't add the path.
- **Consumers** — if another package imports it: that package's `dependencies`, plus both of its tsconfig
  `references` arrays.
- **Lockfile** — run `npm install` to link the workspace and update `package-lock.json`.
- **Changeset** — never run `npm run changeset` (it prompts interactively); hand-write `.changeset/<name>-package.md` with `'@minimaz/<name>': minor` and an "Add
  @minimaz/<name>: …" summary (a frontmatter entry plus that one-line summary). Use the writing-changesets skill.
- **Docs listing packages** — `README.md` table, `docs/README.md` table, the dependency graph in
  `docs/architecture.md`, `.claude/rules/monorepo-architecture.md` and `.claude/status.md`, and the "Working today" table in `.claude/status.md`.

## Common mistakes

- Adding `packages/<name>` to root `workspaces`, or to `vitest.config.ts` — both are glob-driven already.
- `--config ../../eslint.config.mjs` in `lint` — breaks path-based ESLint overrides; plain `eslint .` finds the
  root config.
- A path filter in `test` (`vitest run --root ../.. packages/<name>`) — matches nothing from inside the package
  and passes silently. Use `--project`.
- `clean` that only removes `dist/` — the stale `.tsbuildinfo` then makes `tsc -b` skip re-emitting.
- A tsconfig `references` entry missing from one of the two configs.

Finish with the verifying-monorepo-changes skill.
