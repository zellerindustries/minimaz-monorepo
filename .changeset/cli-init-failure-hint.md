---
'@minimaz/cli': patch
---

When an `init` npm/git step fails, the error now names the project directory that was left in place and says to rerun the failed step manually, with the original error chained as `cause`.
