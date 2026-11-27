---
'@minimaz/css': minor
---

`bundleCss` now inlines bare `@import` specifiers (`@import "css-kit"`, `@import url("@scope/pkg/file.css")`) by resolving them with Node package resolution from the importing file, honoring the package's `exports` map. A bare specifier that cannot be resolved now throws instead of being copied through literally.
