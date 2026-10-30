---
'@minimaz/local-server': patch
---

`startLocalServer` now also detects a port held by a listener on all interfaces (`0.0.0.0`/`::`), which Windows doesn't report as `EADDRINUSE`, and fails with "Port N is already in use" instead of silently starting next to it.
