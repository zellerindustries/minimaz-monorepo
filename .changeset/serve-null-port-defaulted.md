---
'@minimaz/config': patch
---

`serve.port: null` now counts as unset: `serve.portDefaulted` is `true`, so `mz serve` warns like it does for a missing port.
