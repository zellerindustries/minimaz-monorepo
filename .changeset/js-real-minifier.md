---
'@minimaz/js': minor
'@minimaz/cli': patch
---

`minifyJs` is now a real minifier. It parses the source, renames local variables, parameters, functions and classes to the shortest safe names, and prints the program with no optional whitespace, statements joined with `;` only where needed and minimal parentheses. Comments are dropped (including `/*! … */`), a leading `#!` line is kept, and only value-preserving literal rewrites are made (`.5`, `1e3`, `!0`, `void 0`, `{a:1}`, `a.b`, shortest quotes). Nothing is removed, reordered or inlined. String literals and untagged template text are printed ASCII-only, with each non-ASCII character escaped to the same value (`"caf\xe9"`); identifiers, regex literals and tagged template text keep their characters as written.

Top-level names are renamed only in ES modules, never when exported, so a classic script's globals stay reachable from HTML and other scripts. A direct `eval` or a `with` disables renaming in its own scope, every enclosing scope and every nested scope (at the top level, the whole file). `.name` and `toString()` change for renamed function and class declarations, and also for anonymous functions, arrows and classes whose name is inferred from a renamed binding (`const handleClick = () => {}` becomes `const a=()=>{}`, so its `.name` is `"a"`; the same goes for `const Widget = class {}; export default Widget`). This affects React display names, logged `fn.name` values and class names read at runtime (custom elements, errors); pass `{ mangle: false }` to keep every name.

When a file can't be parsed (a syntax error, an unsupported construct or very deep nesting, such as a `+` chain of a few thousand terms), or uses top-level `await` without `import`/`export`, `minifyJs` falls back to whitespace-only minification: comments and unnecessary whitespace are removed, and line breaks that automatic semicolon insertion might depend on are kept. This fallback is silent: nothing is renamed and no warning is given. An unterminated string, template literal, regex or block comment throws `minifyJs: unterminated … at offset N`.

`build` with `output.js.minify: true` now produces this output, and reports a `minifyJs:` error as a normal error naming the source file rather than as a bug.
