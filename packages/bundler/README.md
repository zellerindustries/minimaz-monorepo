# @minimaz/bundler

Zero-dependency relative-import module graph resolver for Minimaz's `build` command.

## Install

```bash
npm install @minimaz/bundler
```

## Usage

```ts
import { resolveModuleGraph } from '@minimaz/bundler'

const { modules } = await resolveModuleGraph('/path/to/entry.ts')
// modules: Map<string, string> — every reachable module's rewritten
// contents, keyed by absolute source path (entry file included)
```

## API

- `resolveModuleGraph(entryPath)` — walks `entryPath`'s relative (`./`, `../`) JS/TS import graph,
  transpiling TypeScript via [`@minimaz/ts`](../ts), and returns every reachable module's contents with
  import specifiers rewritten to their resolved `.js` output paths. No `node_modules`/bare-specifier
  resolution, and no bundling into a single file — output mirrors the input tree 1:1, relying on the
  browser's native ESM loader to link modules at runtime.

Depends on `@minimaz/ts`.
