# @minimaz/sitekit

The published `minimaz`/`mz` CLI binary.

## Install

```bash
npm install -g @minimaz/sitekit
```

## Commands

See [`@minimaz/cli`](../../packages/cli)'s README for the full command list — `sitekit` runs the exact
same commands (`help`, `version`, `validate`, `init`, `config`, `template`, `docs`) under this
package's name and version.

## Why a separate package?

`@minimaz/cli` implements every command as a library but is no longer itself published as an
executable. `sitekit` is a thin bin-only wrapper: it has no `core.ts`/`types.ts`/`index.ts` of its
own (unlike every other `@minimaz/*` package) because it has no logic of its own to expose — its one
file, `src/cli/main.ts`, calls `@minimaz/cli`'s `runCli()` with this package's own `package.json`
path, so `minimaz version` reports `sitekit`'s version rather than `@minimaz/cli`'s internal one.
