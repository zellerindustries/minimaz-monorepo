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
const readable = minifyJs(jsSource, { mangle: false }) // keep every name
```

## API

- `minifyJs(code, options?)` — parses the source (modern JavaScript: modules, classes, async/generators,
  destructuring, optional chaining, top-level `await`, …), renames local bindings to the shortest safe names and
  prints the program with no optional whitespace, `;` only where needed and minimal parentheses. Comments are
  dropped (including `/*! … */`); a leading `#!` line is preserved. Only safe literal rewrites are made
  (`0.5` → `.5`, `1000` → `1e3`, `true` → `!0`, an unshadowed `undefined` → `void 0`, `{"a":1}` → `{a:1}`,
  `a["b"]` → `a.b`, shortest string quotes). No dead-code elimination, constant folding, inlining or property
  mangling. Does not bundle — module resolution/bundling is intentionally out of scope for this package (see
  `.claude/status.md` in the monorepo root for why).

    `options.mangle` (default `true`): set it to `false` to keep every name.

    Renaming rules:
    - Function, block, catch and class scopes are always renamed.
    - Top-level bindings are renamed only in modules (a file with `import`/`export`/`import.meta`), and never
      exported ones. A script's top-level names are globals that other scripts or HTML may use, so they are kept.
    - Scopes that can see a direct `eval(...)` or sit inside a `with` are left untouched.
    - Properties, labels and global (undeclared) names are never renamed.
    - A renamed function or class has a different `.name` and `toString()` (for example `function a(){…}`).
      Code that depends on those (logging function names, serializing functions) should use `mangle: false`.

    Fallback: when the source can't be parsed (a syntax error, an early error such as a duplicate `let`, or
    syntax this parser doesn't support), is nested too deeply to process, or uses top-level `await` without any
    other module syntax (it may be a sloppy script calling a function named `await`), `minifyJs` falls back to
    whitespace-only minification: comments are dropped and whitespace is reduced to the minimum that keeps the
    token sequence identical, with line breaks kept wherever automatic semicolon insertion could apply. Nothing
    is renamed in that case, and invalid code passes through as it is (errors surface at runtime, not here).
    A fallback source with an HTML-like comment (`<!--`, or `-->` at the start of a line) is returned unchanged,
    since without parsing it can't tell a comment (in a script) from operators (in a module).

    Throws an `Error` whose message starts with `minifyJs:` when `code` is not a string, or when the source
    can't be parsed and has an unterminated string, template literal, regex or block comment (with the offset).
