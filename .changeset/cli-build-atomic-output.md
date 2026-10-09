---
'@minimaz/cli': patch
---

`build` no longer wipes the previous output before building. It now writes into a sibling temp directory (`<output.dir>.minimaz-tmp`) and only replaces `output.dir` once the whole build succeeds. A failed build (e.g. a missing CSS `@import`) leaves the last good output untouched and removes the temp directory. The swap moves the previous output aside to `<output.dir>.minimaz-old`, moves the new build in, then deletes the backup. If moving the new build in fails, the previous output is restored and the error names the directory holding the new build. Each rename is retried briefly on Windows' transient EPERM/EACCES/EBUSY. Leftover scratch directories from a crashed run are cleaned up, or restored as `output.dir` if it went missing. Scratch directories that would overlap `input.dir` or a local external are refused, the same as `output.dir`. `minimaz init`'s `.gitignore` now ignores `*.minimaz-tmp` and `*.minimaz-old`.
