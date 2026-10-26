---
'@minimaz/cli': patch
---

`init` no longer accepts `--gitremote`. It was parsed but never used; pass the remote URL to `--gitprovider` instead (`--gitprovider=<url>`).
