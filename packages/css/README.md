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
  bundled code plus the list of files it read. Relative (`./`, `../`) imports are inlined, and so are bare specifiers
  (`@import "css-kit"`, `@import url("@scope/pkg/file.css")`), which resolve with Node package resolution from the
  importing file, so the package's `exports` map applies and a bare import inside a package file resolves from that
  file's directory. A bare specifier that cannot be resolved throws. An import with a media condition is wrapped in
  `@media`, one with `supports()` or `layer` throws, and remote or absolute imports (`http(s):`, `//`, `data:`, `/`)
  are left as-is.
  `options.transform(content)` is applied to every file's source (entry included) before its imports are resolved
  and its `url()`s are rewritten, so a text replacement still matches the paths as authored.

Depends on [`@minimaz/core`](../core).
