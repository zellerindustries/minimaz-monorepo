---
'@minimaz/cli': patch
---

User mistakes are now reported as plain errors instead of "This looks like a bug — please report it.": a missing `--path`, missing file or unsupported extension in `validate`; an unknown `docs` subcommand; an existing `init` target directory; a cancelled `template` save; and `build` CSS-bundling failures (missing or circular `@import`, `supports()`/`layer` imports), which keep the original error as `cause`.
