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
npm run build             # tsc -b (all packages) + bundle every package's entry points + copy template seeds
npm run typecheck:watch   # tsc -b --watch — fast feedback loop while editing (doesn't re-bundle)
npm run lint / lint:fix
npm run format / format:check
npm run validate          # lint + format:check + typecheck — the same gate CI runs
npm test                  # vitest run, across every package
```

Run any of these for a single package with `--workspace`:

```bash
npm run build --workspace=@minimaz/css
npm run typecheck --workspace=@minimaz/cli
```

Run a single test file directly with vitest (bypassing the workspace scripts):

```bash
npx vitest run packages/css/src/minify.test.ts --config config/vitest.config.ts
```

Tests are colocated `*.test.ts` files next to the code they cover (e.g. `packages/css/src/minify.test.ts`), not
gathered in a separate test package.

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
