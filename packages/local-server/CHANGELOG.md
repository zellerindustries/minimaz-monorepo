# @minimaz/local-server

## 0.3.1

### Patch Changes

- `startLocalServer` now also detects a port held by a listener on all interfaces (`0.0.0.0`/`::`), which Windows doesn't report as `EADDRINUSE`, and fails with "Port N is already in use" instead of silently starting next to it.

## 0.3.0

### Minor Changes

- A directory with an `index.html` requested without a trailing slash (`/docs`) now 301-redirects to `/docs/` (query string preserved), so the page's relative links resolve correctly. Added MIME types for `.xml`, `.pdf`, `.wasm`, `.webmanifest`, `.avif`, `.mp4`, and `.map`. Live reload now re-arms its watcher with capped backoff when the served directory is deleted, replaced (e.g. by `build`'s rename-into-place swap), or the watcher errors, and sends one reload once re-armed.

    Trailing-slash redirects (index pages and directory listings) now build their `Location` from the resolved directory instead of the raw request path, closing an open redirect where `GET /%2Fevil.com%2F..` answered `301 Location: //evil.com/../`.

### Patch Changes

- Updated dependencies [`38ce4e2`]:
    - @minimaz/logger@0.2.1

## 0.2.0

### Minor Changes

- Add @minimaz/local-server: a new published package providing startLocalServer(), a lightweight,
  dependency-free node:http static file server for serving a built site during development —
  path-traversal-safe static serving, MIME type resolution, and SSE-based live reload (watches the
  served directory and pushes a reload event to connected clients on change). It is not yet wired
  into @minimaz/cli as a serve command; that's a planned follow-up.

- Add config-driven `serve` support: `@minimaz/config` gains a new `serve` section in `minimaz.config.json`,
  `@minimaz/local-server` adds optional `LocalServerOptions` fields for clean URLs, SPA fallback, directory
  listing, and cache-control/ETag support, and `@minimaz/cli` wires `@minimaz/local-server` in as a new `serve`
  command. All additive — no breaking changes.

### Patch Changes

- @minimaz/logger now provides a KnownError marker class and a shared handleCliError() top-level error handler.
  ConfigNotFoundError, ValidationError, TemplateNotFoundError, and InvalidTemplateNameError now extend KnownError.
  @minimaz/cli's runCli() now always prints the stack trace for an unexpected (non-KnownError) failure instead of
  gating it behind DEBUG=true — a visible CLI output change.
- Updated dependencies [`7fc77c9`]:
    - @minimaz/logger@0.2.0
