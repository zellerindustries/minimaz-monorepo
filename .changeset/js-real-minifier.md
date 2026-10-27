---
'@minimaz/js': minor
'@minimaz/cli': patch
---

`minifyJs` is now a real minifier. It parses the source, renames local variables, parameters, functions and classes to the shortest safe names, and prints the program with no optional whitespace, statements joined with `;` only where needed and minimal parentheses. Comments are dropped (including `/*! … */`), a leading `#!` line is kept, and only value-preserving literal rewrites are made (`.5`, `1e3`, `!0`, `void 0`, `{a:1}`, `a.b`, shortest quotes). Nothing is removed, reordered or inlined.

Top-level names are renamed only in ES modules, never when exported, so a classic script's globals stay reachable from HTML and other scripts. Scopes that can see a direct `eval` or a `with` are left untouched. A renamed function or class reports a different `.name` and `toString()`; pass `{ mangle: false }` to keep every name.

When a file can't be parsed (a syntax error, an unsupported construct or very deep nesting), or uses top-level `await` without `import`/`export`, `minifyJs` falls back to whitespace-only minification: comments and unnecessary whitespace are removed, and line breaks that automatic semicolon insertion might depend on are kept. An unterminated string, template literal, regex or block comment throws `minifyJs: unterminated … at offset N`.

`build` with `output.js.minify: true` now produces this output, and reports a `minifyJs:` error as a normal error naming the source file rather than as a bug.
