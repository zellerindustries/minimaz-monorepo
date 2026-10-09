---
'@minimaz/config': minor
'@minimaz/cli': minor
---

Docs output no longer lands inside the build output directory, where `minimaz build` and `minimaz clear` would wipe it: `minimaz docs build` now writes to a sibling `<output.dir>-docs/html` and `<output.dir>-docs/pdf` (default `dist-docs/html` and `dist-docs/pdf`, previously `dist/html` and `dist/pdf`, which ignored `output.dir` entirely). New `resolveDocsOutputDirs(outputDir)` derives these; the `outputDirs` constant now holds the new defaults.

`loadConfig` now type-checks every known field and throws a single `ConfigValidationError` (a `KnownError` whose `errors` lists every bad field, e.g. `serve.port: "3000"`, `input.exclude: "node_modules"`) instead of passing wrong types through; an explicit `null` still counts as unset and gets the default, as before; unknown keys are logged as warnings. A config file that exists but can't be read (e.g. `EISDIR`, `EACCES`) now throws `ConfigReadError` naming the real cause instead of `ConfigNotFoundError`. `ConfigNotFoundError` only suggests an init command when the caller passes one (`loadConfig(cwd, { initCommand })`): `build`/`clear`/`serve` now suggest `minimaz init`, `docs build` suggests `minimaz docs init`. The `.gitignore` written by `minimaz init` now also ignores `dist-docs`.
