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

- `minifyJs(code)` — tokenizes the source, drops every comment (including `/*! … */`) and reduces whitespace to the
  minimum that keeps the code identical: `a = b + c` becomes `a=b+c`, and a line break is removed wherever automatic
  semicolon insertion provably cannot apply (after an operator, `,`, `;`, `(`, `[` or `{`, before `.`, `(`, `)`
  and so on). Everywhere else it is kept — after `return`/`break`/`continue`/`throw`, before `++`/`--`, and
  between statements that rely on ASI. Strings, template literals and regex literals are copied verbatim, and a
  leading `#!` line is preserved. Nothing is renamed or removed besides whitespace and comments (no mangling, no
  dead-code elimination). Does not bundle — module resolution/bundling is intentionally out of scope for this package
  (see `.claude/status.md` in the monorepo root for why).

    Throws an `Error` whose message starts with `minifyJs:` for an unterminated string, template literal, regex or
    block comment (with the offset), or when `code` is not a string.

    Regex-versus-division is decided from the previous token rather than a full parse, which is right for ordinary code.
