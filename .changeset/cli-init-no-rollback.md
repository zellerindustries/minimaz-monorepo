---
'@minimaz/cli': patch
---

Stop `init` from deleting the entire scaffolded project when the optional `npm install`/`git init` step fails. Matches `minimaz-cli`'s original behavior: a failed step now leaves the partially-created project in place to fix manually, instead of silently wiping it (including any already-installed `node_modules`).
