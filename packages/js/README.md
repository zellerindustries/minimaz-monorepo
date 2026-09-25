# @minimaz/js

Dependency-free JavaScript minifier.

## Install

```bash
npm install @minimaz/js
```

## Usage

```ts
import { minifyJs } from '@minimaz/js'

const minified = minifyJs(jsSource)
```

## API

- `minifyJs(code)` — strips comments and unnecessary whitespace. ASI-safe (never joins lines in a way that could
  change semantics). Does not bundle — module resolution/bundling is intentionally out of scope for this package
  (see `.claude/status.md` in the monorepo root for why).
