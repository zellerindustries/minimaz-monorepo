---
'@minimaz/templates': minor
---

Breaking: `simple`'s static assets moved from `public/` to `src/public/`, and `docs` is now a seeded template name, so a user's own saved template named `docs` is replaced by `mz config --overwrite` / `mz template --update`. Redesigned the bundled templates: `default` is now a small dependency-free starter site (CSS partials bundled into one file, a TypeScript script, a full `serve` section), `simple` is a blank `src/` page, and a new `docs` template scaffolds Markdown documentation for `docs build`. Existing `~/.minimaz/templates` copies are not replaced automatically; run `mz config --overwrite` or `mz template --update` to pick up the new seeds.
