# Getting Started

This is a developer guide for working _inside_ `minimaz-monorepo` — cloning it, building it, and running its
packages locally. If you just want to consume a published `@minimaz/*` package, see the root
[README](../README.md#installation) instead.

## Requirements

- Node.js >= 24 (see `.nvmrc`)
- npm >= 11

## Clone and install

```bash
git clone https://github.com/zellerindustries/minimaz-monorepo.git
cd minimaz-monorepo
npm install
npm run build
```

`npm install` also runs `husky` (via the `prepare` script) to wire up git hooks — formatting/lint-fix on staged
files at commit time, and the full validation gate at push time. You don't need to configure anything yourself.

## Everyday commands

```bash
npm run build             # every package's own build (tsc -b + bundle)
npm run typecheck:watch   # tsc -b --watch — fast feedback loop while editing (doesn't re-bundle)
npm run lint / lint:fix
npm run format / format:check
npm run validate          # lint + format:check + typecheck — the same gate CI runs
npm test                  # every package's own tests, then the repo scripts' tests (test:scripts)
```

Run any of these for a single package with `--workspace`:

```bash
npm run build --workspace=@minimaz/css
npm run typecheck --workspace=@minimaz/cli
```

Run a single test file directly with vitest (bypassing the workspace scripts):

```bash
npx vitest run packages/css/src/__tests__/minify.test.ts
```

Tests live in a `__tests__/` directory next to the code they cover (e.g. `packages/css/src/__tests__/minify.test.ts`
for `packages/css/src/minify.ts`), not in a separate test package. `npm test` from inside a package directory runs
only that package's tests.

Some tests read other packages' built `dist/` (e.g. `@minimaz/cli`'s `init` tests load `@minimaz/templates`'s
seeds), and the end-to-end tests in `toolkits/sitekit` run the built `dist/cli/main.js`, so run `npm run build`
before `npm test` on a fresh checkout.

## Trying the CLI locally

`@minimaz/sitekit` builds to `toolkits/sitekit/dist/cli/main.js` (the `minimaz`/`mz` bin entry, wrapping
`@minimaz/cli`'s commands). After `npm run build`, run it directly with Node, or `npm link` the package to get the
`minimaz`/`mz` commands on your `PATH`:

```bash
node toolkits/sitekit/dist/cli/main.js help
# or
npm link --workspace=@minimaz/sitekit
minimaz help
```

## Where to go next

- [`docs/architecture.md`](architecture.md) — how the packages, build pipeline, and CLI fit together.
- [`.claude/status.md`](../.claude/status.md) — what's actually implemented today vs. in progress vs. planned,
  per package. Check this before assuming a feature exists.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — code conventions, the PR checklist, and how releases work.
