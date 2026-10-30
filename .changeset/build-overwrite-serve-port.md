---
'@minimaz/cli': minor
'@minimaz/config': minor
'@minimaz/sitekit': minor
---

Breaking: `mz build` now refuses to replace an existing `output.dir` when run non-interactively, and asks `[y/N]` when run in a terminal; pass `--overwrite` to skip the question. A failed build still keeps the previous output. `mz serve` now defaults to port 4173 (was a random free port), warns when `serve.port` is not set in `minimaz.config.json`, and errors if the port is already in use. `@minimaz/config`'s `serve.port` default is now 4173 and `loadConfig` returns a new `serve.portDefaulted` flag.
