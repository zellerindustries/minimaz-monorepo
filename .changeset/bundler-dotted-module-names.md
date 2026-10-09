---
'@minimaz/bundler': patch
---

`resolveModuleGraph` now resolves extensionless imports of dotted module names (`./utils.config`, `./foo.min`, dotted directories) instead of treating them as assets, only leaving a specifier alone when it is a real non-code file or nothing resolves. A dotfile module such as `.env.js` is now rewritten to `./.env.js`.
