---
'@minimaz/config': minor
'@minimaz/local-server': minor
'@minimaz/cli': minor
---

Add config-driven `serve` support: `@minimaz/config` gains a new `serve` section in `minimaz.config.json`,
`@minimaz/local-server` adds optional `LocalServerOptions` fields for clean URLs, SPA fallback, directory
listing, and cache-control/ETag support, and `@minimaz/cli` wires `@minimaz/local-server` in as a new `serve`
command. All additive — no breaking changes.
