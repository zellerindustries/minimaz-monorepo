---
'@minimaz/local-server': minor
---

A directory with an `index.html` requested without a trailing slash (`/docs`) now 301-redirects to `/docs/` (query string preserved), so the page's relative links resolve correctly. Added MIME types for `.xml`, `.pdf`, `.wasm`, `.webmanifest`, `.avif`, `.mp4`, and `.map`. Live reload now re-arms its watcher with capped backoff when the served directory is deleted, replaced (e.g. by `build`'s rename-into-place swap), or the watcher errors, and sends one reload once re-armed.

Trailing-slash redirects (index pages and directory listings) now build their `Location` from the resolved directory instead of the raw request path, closing an open redirect where `GET /%2Fevil.com%2F..` answered `301 Location: //evil.com/../`.
