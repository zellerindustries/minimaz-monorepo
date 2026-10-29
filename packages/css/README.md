# @minimaz/css

Dependency-free CSS minifier and `@import` bundler.

## Install

```bash
npm install @minimaz/css
```

## Usage

```ts
import { minifyCss, bundleCss } from '@minimaz/css'

const minified = minifyCss(cssSource)

const { code, inputs } = await bundleCss('src/styles/entry.css')
// code: entry.css with all @import statements inlined
// inputs: absolute paths of every file that was inlined, including the entry file
```

## API

- `minifyCss(code)` — strips whitespace and comments from CSS. No `esbuild`.
- `bundleCss(entryPath, options?)` — resolves and inlines `@import` statements starting from `entryPath`, returning the
  bundled code plus the list of files it read. Only relative (`./`, `../`) imports are inlined; an import with a
  media condition is wrapped in `@media`, one with `supports()` or `layer` throws, and bare-specifier or remote
  imports are left as-is (a `url()` one in a nested file gets its path rewritten against the entry directory).
  `options.transform(content)` is applied to every file's source (entry included) before its imports are resolved
  and its `url()`s are rewritten, so a text replacement still matches the paths as authored.

Depends on [`@minimaz/core`](../core).
