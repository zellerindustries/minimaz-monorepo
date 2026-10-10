---
'@minimaz/templates': minor
---

Breaking: the `default` template is now a full multi-page starter site (landing page, services, legal pages, a typed contact form, an error page, SEO files and a token-based stylesheet) instead of a two-page starter. Existing `~/.minimaz/templates` copies are not replaced automatically; run `mz config --overwrite` or `mz template --update` to pick it up.
