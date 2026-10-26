---
name: writing-changesets
description: Use when a change to minimaz-monorepo alters a package's public API or observable behavior, adds or removes a package, or needs to be recorded for release — especially when `npm run changeset` can't be used because it prompts interactively.
---

# Writing Changesets

## Overview

Releases are driven by `.changeset/*.md` files: `release.yml` turns pending changesets into a "Version Packages"
PR, and merging it publishes. Write the file by hand — `npm run changeset` is interactive.

## File format

`.changeset/<short-kebab-description>.md`:

```md
---
'@minimaz/templates': minor
'@minimaz/html': patch
---

Breaking: `seedDefaults` now takes an options object instead of a boolean. `minifyHtml` keeps `<pre>` whitespace.
```

One file may list several packages; separate files per concern are fine too. Say "Breaking:" up front when it is.

## Choosing the bump

Every `@minimaz/*` package is `0.x`, so:

| Change | Bump |
|---|---|
| Breaking: renamed/removed export, changed signature, new error where it used to succeed | `minor` |
| New export or feature, new package | `minor` |
| Bug fix, internal change with observable effect | `patch` |

Never `major` for a `0.x` package — it would publish `1.0.0`. Dependents of a bumped package are bumped
automatically (`updateInternalDependencies: patch` in `.changeset/config.json`); don't list them unless they
changed themselves.

## Before writing

- **Check pending changesets first** (`ls .changeset`): if one already covers the same package and change,
  extend it instead of adding a near-duplicate.
- **Is it published?** `npm view @minimaz/<name> version` — a 404 means never published; a rename there needs no
  migration note, but a new package still gets its `minor` "Add @minimaz/<name>" changeset.
- **Only real packages.** A changeset naming a package that no longer exists (or `.changeset/config.json`'s
  `ignore` listing one) makes `changeset version` fail. After removing or renaming a package, fix every pending
  changeset that mentions it.
- **No changeset** for private/non-published code: `scripts/`, tests only, docs only, repo config.

## Check

```bash
npx changeset status --verbose   # must exit 0 and list the expected bump per package
```

Also update the package README for any renamed or removed export, and `.claude/status.md` if the change is one of
its tracked fixes.
