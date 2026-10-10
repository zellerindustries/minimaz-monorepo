# Acme Studio

A multi-page starter site built with minimaz. Build with `mz build`, preview with `mz serve`.

## Make it yours

`minimaz.config.json` holds two placeholders, replaced in every `.html`, `.css` and `.js` file at build time:

- `_DOMAIN_` (default `example.com`)
- `_SITE_NAME_` (default `Acme Studio`)

The build copies other file types verbatim, so these files in `src/public/` are NOT rewritten. Edit the domain and name in them by hand:

- `robots.txt` and `sitemap.xml` (domain, and add a `<url>` for every page you add)
- `llms.txt` (domain and name)
- `.well-known/security.txt` (contact address, `Expires` date, canonical URL)
- `og-cover.svg` and `logo.svg` (the name in the artwork and its label)

Also replace the placeholder form endpoint in `src/scripts/form-types.ts`, and have the legal pages reviewed.

`src/pages/error/index.html` is the 404 page; configure your host to serve it for unknown URLs.
