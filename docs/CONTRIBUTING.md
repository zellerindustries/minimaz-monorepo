# Contributing

Thanks for your interest in contributing to `minimaz-monorepo`.

## Before you start

Check [`.claude/status.md`](../.claude/status.md) and [`.claude/migration.md`](../.claude/migration.md)
first — they track exactly what's implemented, what's in progress, and what's
only planned. If you're picking up something described as "planned" or "not
started," it may not have a design yet; open an issue to discuss the approach
before sending a large PR.

## Development setup

Requirements: Node.js >= 24, npm >= 11.

```bash
git clone https://github.com/zellerindustries/minimaz-monorepo.git
cd minimaz-monorepo
npm install
npm run build
```

Useful scripts (see root `package.json` for the full list):

```bash
npm run build         # build every package
npm run typecheck:watch # type-check in watch mode (does not re-bundle — run npm run build after making changes)
npm test                 # run the test suite (vitest)
npm run lint             # eslint
npm run lint:fix          # eslint --fix
npm run format             # prettier --write
npm run format:check        # prettier --check
npm run validate              # lint + format:check + typecheck — the full CI gate
```

Run a single package's scripts with `--workspace`, e.g.
`npm run build --workspace=@minimaz/css`.

## Code conventions

- 4-space indentation, single quotes, semicolons, trailing commas — enforced
  by Prettier and a pre-commit hook (`husky` + `lint-staged`); you don't need
  to format manually.
- TypeScript strict mode, NodeNext modules, named exports only (no default
  exports), `.js` extensions in relative imports.
- JSDoc on every exported function.
- No new dependency without a clear reason — several packages (`@minimaz/css`,
  `@minimaz/js`, `@minimaz/json`) are deliberately dependency-free; see their
  design docs under `.claude/superpowers/specs/` for the reasoning if you're
  wondering whether a given package should stay that way.

## Before opening a pull request

Run the full validation gate locally — CI runs the same thing:

```bash
npm run validate
npm test
npm run build
```

Keep PRs focused on one package or one concern where possible. If your change
affects `.claude/status.md`'s "working today" / "in progress" / "planned"
categorization for any package, update that file in the same PR.

## Releasing

Releases are managed by [Changesets](https://github.com/changesets/changesets),
not manual version bumps.

1. When your PR changes a published package's behavior, run `npm run changeset`
   and follow the prompts to describe the change and pick a bump type
   (patch/minor/major) for the affected package(s). Commit the generated
   `.changeset/*.md` file with your PR.
2. Merging to `main` triggers `.github/workflows/release.yml`, which opens or
   updates a bot-maintained "Version Packages" pull request that bumps
   versions and writes `CHANGELOG.md` entries from your changeset files.
3. Merging that "Version Packages" PR is what actually publishes to npm — the
   same workflow runs `npm run release` (`npm run build && changeset publish`)
   and pushes the resulting git tags.

The bot-opened "Version Packages" PR does **not** run `ci.yml` — GitHub does
not trigger workflows from pull requests authored by the default
`GITHUB_TOKEN`. This is expected; do not enable a required status check on
`main` that would block this PR unless `release.yml` is also switched from
`GITHUB_TOKEN` to a personal access token (a separate decision, since that
grants broader write access).

`changesets/action` also automatically creates a GitHub Release per published
package/version tag — releases are no longer manually cut, but they are still
created, just by the bot rather than by hand.

Running `npm run version` locally (outside CI) requires a `GITHUB_TOKEN`
environment variable, since the changelog generator queries the GitHub API
for PR/commit links. Without one, it fails.

The `NPM_TOKEN` secret is a Granular Access Token, which npm caps at a 90-day
maximum lifetime — it needs periodic manual rotation (generate a new token on
npmjs.com, update the GitHub repo secret) or `release.yml` will start failing
to authenticate once it expires.

## Reporting bugs / requesting features

Use the issue templates — `.github/ISSUE_TEMPLATE/`. For security
vulnerabilities, see [`SECURITY.md`](SECURITY.md) in this same folder instead of
opening a public issue.
