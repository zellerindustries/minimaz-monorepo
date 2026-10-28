# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

`minimaz-monorepo` is an npm-workspace-based rewrite of `minimaz-cli` (a sibling repo, `../minimaz-cli`) into
modular, independently-versioned `@minimaz/*` packages. It is **not yet a replacement** for `minimaz-cli` — that
remains the stable, published tool. Requires Node.js >=24, npm >=11.

**`.claude/status.md`** is the living source of truth for what's actually working vs. in-progress vs. only
planned, per package — read it before assuming a feature exists. **`.claude/migration.md`** has the detailed
per-command/per-utility porting checklist against `minimaz-cli`. Both drift less than this file, so defer to them
on anything about current implementation state. (They live under `.claude/`, not `docs/`, because they're
internal working ledgers, not published/user-facing documentation.)

## Commands

```bash
npm install
npm run build           # every workspace's own `build` (tsc -b + scripts/bundle.mjs)
npm run clean           # every workspace's own `clean` (its dist/ + node_modules/.cache/tsc/), then root
                         # node_modules/.cache (root tsbuildinfo, coverage)
npm run typecheck       # every workspace's own `typecheck` (`tsc -b`), then `tsc -p tsconfig.json` for vitest.config.ts
npm run typecheck:watch # tsc -b --watch over the whole reference graph (no bundling)
npm run lint            # every workspace's own `lint`, then eslint on the root config files and scripts/
npm run lint:fix
npm run format          # prettier . --write
npm run format:check
npm run validate        # lint + format:check + typecheck — the full CI gate
npm test                # every workspace's own `test` (one Vitest project each), then `npm run test:scripts` (scripts/ project)
npm run test:watch      # vitest (watch mode, all projects in one process)
npm run test:coverage   # vitest run --coverage (v8 provider, all projects)
npm run verify:release  # verify + changeset status + pack dry-run + scripts/verify-packages.mjs (tarball contents)
npx vitest run <path>   # run a single test file
```

The root `build`/`clean`/`typecheck`/`lint`/`test` scripts delegate to each workspace's own script
(`npm run <x> --workspaces --if-present`), so a package's `package.json` script is the single source of truth.
npm runs workspaces alphabetically, not in dependency order — that's safe because each package's `build` and
`typecheck` use `tsc -b`, which builds the package's referenced dependencies first. `tsc -b --noEmit` is not an
option for `typecheck`: TypeScript rejects `noEmit` on referenced composite projects (TS6310).

Root eslint/prettier/vitest configs live at the workspace root (`eslint.config.mjs`, `.prettierrc.json`,
`vitest.config.ts`) — a prior layout kept them under `config/`, but that directory no longer exists.

Run a single workspace's scripts with `--workspace`, e.g. `npm run build --workspace=@minimaz/css`. Every
package (`packages/*`, `toolkits/sitekit`) declares its own `build`, `clean`,
`typecheck`, `lint`/`lint:fix`, `typecheck:watch`, `validate`, and `test` (`vitest run --root ../.. --project <package-name>`,
running only that package's Vitest project) — run these from inside the package directory, or via `--workspace`
from the root. (A path filter like `packages/css` doesn't work there: Vitest resolves it against the package's own
cwd, matches nothing, and `passWithNoTests` turns that into a silent pass.)

Before opening a PR, run `npm run verify` (validate, build, test — same as CI). If a change affects a
package's "working today / in progress / planned" status, update `.claude/status.md` in the same PR.

Git hooks are wired via husky + lint-staged (`prepare: husky`) — formatting/lint-fix on staged files happens
automatically on commit, no need to format manually. The pre-push hook runs `npm run verify`; `npm run release` first runs `verify:release` (adds `changeset status --since=main` and a `npm pack --dry-run` of every workspace),
so a push blocks on the same gate as CI.

### Release process

Per-package versioning/changelogs are managed by Changesets (`.changeset/config.json`):

```bash
npm run changeset  # record an intended version bump for one or more packages (run per PR that changes a package)
npm run version    # changeset version + relock (applied by the release workflow, not run manually)
npm run release    # build + changeset publish (applied by the release workflow, not run manually)
```

`.github/workflows/ci.yml` runs `validate`, `build`, then `test` on every push to `main` and every pull request, from a fresh `npm ci` (one sequential job — see `.claude/status.md`'s
"Known cleanup opportunities" for why it isn't split). `.github/workflows/release.yml` runs on every push to
`main`: `changesets/action` either opens/updates a "Version Packages" PR (from pending `.changeset/*.md` files)
or, once that PR is merged, publishes the bumped packages to npm. This is the only publish path — don't add a
separate `npm publish` workflow alongside it. `.github/workflows/wiki.yml` then syncs `docs/` to the GitHub wiki (`scripts/wiki-sync.mjs`) after a Release run. A PR that changes a package's public behavior should include a changeset (`npm run changeset`), not
just a version bump by hand.

### Project skills and worktrees

`.claude/skills/` holds repo-specific skills: `adding-a-workspace-package`, `verifying-monorepo-changes`,
`writing-changesets`, `checking-release-readiness` (run before merging a `release/*`/`hotfix/*` branch to `main`). `.claude/` is tracked except `worktrees/`, `settings.local.json` and `superpowers/` (gitignored, local-only specs
and plans), so a new worktree (`.worktrees/`) has `status.md` but not specs/plans: copy what's needed in.

## Rules

Detailed conventions live in `.claude/rules/` and load by file path:

- `monorepo-architecture.md` — layout, package dependency graph, per-package conventions, cross-cutting design notes
- `code-style.md` — formatting, TypeScript and ESLint conventions
- `testing.md` — test layout, Vitest project setup, test pitfalls
- `build.md` — project references, stray test output, stale `tsc -b` caches
- `seeds.md` — bundled template constraints (build pipeline limits seeds must respect)
