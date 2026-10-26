---
'@minimaz/cli': patch
---

`init --npm` now scaffolds a `package.json` with `build` (`minimaz build`) and `start` (`minimaz serve`) scripts, `@minimaz/sitekit` as a devDependency instead of `serve`, and `"type": "module"`.
