---
name: checking-release-readiness
description: Use before merging a release/* or hotfix/* branch into main, before publishing @minimaz/* packages, or when asked whether minimaz-monorepo is "ready for production" — covers what `verifying-monorepo-changes` does not: changesets, packed tarballs, a real install smoke test, audit, and docs accuracy.
---

# Checking Release Readiness

## Overview

`verifying-monorepo-changes` proves the code builds and passes. This skill proves what ships to npm is right:
the right packages bump by the right amount, the tarballs contain what they should, and a fresh install of
`@minimaz/sitekit` works. A push to `main` runs `release.yml`, which opens a "Version Packages" PR and, once that
is merged, **publishes to npm — irreversible**. Everything below happens before that merge, never after.

Report each section as PASS / FAIL with evidence (command + exit code or output). Any FAIL blocks the release.
Do not fix-and-continue silently: report the failure, fix it, then re-run from section 1.

## 1. Branch and tree

- On a `release/*` or `hotfix/*` branch cut from `develop` (git-flow). Never prepare or commit a release directly on
  `main`.
- `git status --short` is empty (no uncommitted work, no stray untracked files) and `git fetch` shows the branch is not
  behind `origin/develop`.
- `.claude/` and `.superpowers/` content is not part of the diff to `main` beyond tracked files.

## 2. The gate (clean state)

Run `verifying-monorepo-changes` in full — `clean → validate → build → test` — then:

```bash
npm run verify:release   # verify + `changeset status --since=main` + `npm pack --dry-run` of every workspace + `scripts/verify-packages.mjs` (automates the section 4 content checks: LICENSE, dist/, no src/tests)
```

`changeset status --since=main` needs a local `main` ref: `git fetch origin main:main` if it errors on a missing ref.
State the summed test total with 0 failed. `npm test` prints one summary per workspace **plus** one for the root
`test:scripts` project — sum them all.

## 3. Changesets are right

`npx changeset status --since=main --verbose` lists what will bump (it sees committed and staged changesets, not
unstaged ones — `git add -N` new files first). Check against the diff (`git diff main...HEAD --stat -- packages toolkits`;
if `main` lags `develop` or you are on a feature branch, diff against `develop` instead, or unreleased develop changes
drown the real ones):

- Every package whose public API or observable behavior changed has a changeset; docs-only or test-only changes do not
  need one.
- Bump level matches the change: breaking → `major` (pre-1.0 packages: `minor`), new feature → `minor`, fix → `patch`.
- No package is bumped by changeset that has no change, and no changed package is missing.
- Bodies read as release notes for a user of the package (see `writing-changesets`), not as commit messages.
- Internal ranges stay satisfiable after the bump (`updateInternalDependencies: "patch"` rewrites out-of-range ones;
  confirm in the Version Packages PR).

## 4. Tarballs

```bash
npm pack --dry-run --workspaces --ignore-scripts --json > pack.json   # keep out of the repo; delete afterwards
```

`--ignore-scripts` matters: each package's `prepack` prints "Bundled …" lines to stdout, which corrupts the JSON
(run `npm run build` first so `dist/` is current).

- Each package ships only `dist/` plus `package.json`, `README`, `LICENSE` (the `files` field is `["dist"]`).
  `scripts/bundle.mjs` copies the root `LICENSE` into each package at build time (gitignored there), so a missing
  one in a tarball means the build step didn't run.
- No `src/`, `__tests__`, `*.test.js`, `.tsbuildinfo`, `.claude/`, `.env*` in any tarball.
- Each `main`/`types`/`bin` target exists in the tarball.
- `@minimaz/sitekit` carries the `minimaz` and `mz` bins (`dist/cli/main.js`) and its `postinstall` is
  `node dist/cli/main.js || exit 0` (an install must never fail on it).

## 5. Install smoke test (the real thing)

Pack every workspace into an empty temp dir **outside the repo**, install the tarballs into a fresh project, and run
the shipped binary — this catches missing `files`, bad `exports`, and workspace-only imports that tests cannot:

```bash
tmp=<empty dir outside the repo>                       # e.g. the session scratchpad; mktemp is not needed
export HOME="$tmp/home" USERPROFILE="$tmp/home"        # keep the real ~/.minimaz untouched
npm pack --workspaces --pack-destination "$tmp" >/dev/null
mkdir -p "$tmp/home" "$tmp/proj" && cd "$tmp/proj" && npm init -y >/dev/null
npm install --ignore-scripts "$tmp"/*.tgz              # all @minimaz/* tarballs, so internal deps resolve locally
npx mz version                                         # NOT --version: that is an unknown command
npx mz config                                          # seeds ~/.minimaz templates; --ignore-scripts skipped the postinstall that does it
yes n | npx mz init site                               # answers the npm/git prompts with "no" (default "yes" runs npm install, 2+ min)
cd site && npx mz build                                # exits 0 and writes dist/
```

Then, for any feature touched in this release, exercise it through the installed `mz` (e.g. set
`output.js.bundling: true` in the generated `minimaz.config.json` and check the built files; add a deliberately broken
import and confirm the build exits 1 with a `KnownError`, not a bug-report message). Node >= 24 required.

## 6. Dependencies

- `npm audit --omit=dev` reports no high/critical findings for what ships. Dev-only findings are noted, not blocking.
- `package-lock.json` is in sync: `npm ci` succeeds from a clean clone state (`npm ci --dry-run` at minimum).

## 7. Docs and status match reality

- `.claude/status.md` states for each changed package match the code (working / in progress / planned); stale
  "not yet wired / not supported" statements are gone.
- User-facing docs (`README.md`, `docs/`, package READMEs) describe the new behavior and nothing removed.
- Known limitations introduced by this release are written down (status.md "Known cleanup opportunities").

## Hand-off

Summarize PASS/FAIL per section. If all pass, list exactly what will happen next and **ask before doing any of it**
(merging to `main`, pushing, tagging — all outward-facing): merge `release/*` into `main` and back into `develop` →
`release.yml` opens the "Version Packages" PR → merging that PR publishes. Never run `npm publish` or
`changeset publish` by hand; the workflow is the only publish path.
