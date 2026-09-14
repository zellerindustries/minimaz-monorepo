---
'@minimaz/config': patch
---

Change the default `output.js.bundling` value from `true` to `false`. JS/TS import-graph
bundling isn't implemented by any consumer yet (`@minimaz/cli`'s `build` command throws if
`js.bundling` is explicitly set to `true`) — the old default made a zero-config build fail
immediately.
