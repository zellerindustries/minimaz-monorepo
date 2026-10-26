---
'@minimaz/js': minor
'@minimaz/cli': patch
---

`minifyJs` is now a real minifier instead of a comment stripper. It tokenizes the source and removes all unnecessary whitespace (`a = b + c` becomes `a=b+c`) and joins lines wherever automatic semicolon insertion provably cannot change the meaning; line breaks after `return`/`break`/`continue`/`throw`, before `++`/`--` and between statements that rely on ASI are kept. Identifiers are not renamed and no code is removed. A leading `#!` line is preserved, and `/*! … */` comments are dropped like any other. An unterminated string, template literal, regex or block comment now throws `minifyJs: unterminated … at offset N` instead of being passed through.

`build` reports such a `minifyJs:` error as a normal error naming the source file rather than as a bug.
