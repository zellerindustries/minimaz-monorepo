---
'@minimaz/templates': patch
---

The `default` template's seeded `minimaz.config.json` now sets `output.js.bundling` to `false`. It was `true`, which `minimaz build` rejects (JS/TS bundling isn't supported yet), so a project created with `minimaz init` from that template failed its first build.
