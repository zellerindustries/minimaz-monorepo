---
'@minimaz/cli': minor
---

Add the `clear` command to @minimaz/cli, porting minimaz-cli's behavior: removes the configured build output
directory (from `output.dir` in `minimaz.config.json`), refusing to delete the project root itself as a safety
check.
