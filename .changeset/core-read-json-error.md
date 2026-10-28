---
'@minimaz/core': patch
---

`readJsonFile` now reports a file that exists but cannot be read (permission denied, or the path is a directory) as `READ ERROR: Failed to read "<file>" - <reason>` instead of the misleading `PARSE ERROR: Failed to parse JSON`. Invalid JSON content still reports `PARSE ERROR`.
