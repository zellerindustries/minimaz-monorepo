# @minimaz/local-server

Lightweight, dependency-free local HTTP server with live reload for serving a built site during
development.

## Install

```bash
npm install @minimaz/local-server
```

## Usage

```ts
import { startLocalServer } from '@minimaz/local-server'

const handle = await startLocalServer({ dir: '/path/to/dist' })

console.log(`Serving at ${handle.url}`)

await handle.close()
```

## API

- `startLocalServer(options)` — starts a `node:http` static file server for `options.dir` and
  resolves to a `LocalServerHandle` once it's listening. Throws a `KnownError` (from
  `@minimaz/logger`) when `dir` doesn't exist or isn't a directory, or when a fixed `port` is
  already in use — including by a listener on all interfaces (`0.0.0.0`/`::`), which Windows
  doesn't report as `EADDRINUSE`.
    - `options.dir` — the directory to serve. Must exist and be a directory.
    - `options.port` — port to bind. Defaults to `0` (an OS-assigned ephemeral port).
    - `options.host` — host to bind. Defaults to `"127.0.0.1"`.
    - `options.liveReload` — inject a live-reload script into HTML responses and watch `dir` for
      changes, pushing a `reload` event over Server-Sent Events to connected clients. If `dir` is
      deleted or replaced (e.g. a rebuild renamed into place), the watcher re-arms on the path
      with capped backoff and sends one `reload` once it does. Defaults to `true`.
    - `options.cleanUrls` — falls back to `<path>.html` when an extensionless path has no exact
      file match. Defaults to `false`.
    - `options.singlePageApp` — serves the root `index.html` for any request nothing else
      resolved. Defaults to `false`.
    - `options.directoryListing` — renders a minimal HTML directory listing when a directory has
      no `index.html`. Defaults to `false`.
    - `options.cacheControl` — adds an ETag and `Cache-Control: no-cache` to every response,
      honoring `If-None-Match` with a `304`. Defaults to `false`.
- `LocalServerHandle`
    - `url` — the server's base URL, e.g. `"http://127.0.0.1:53241"`.
    - `port` — the bound port (resolved even when `options.port` was `0` or omitted).
    - `close()` — stops the HTTP server and the file watcher (if any). Safe to call more than once.

Requests for a directory resolve to its `index.html`, falling back to `404` when there isn't one. A
resolved path outside `dir` is rejected with `403` as defense-in-depth — in practice, requests never
reach it that way: `startLocalServer` parses each request's URL with the WHATWG `URL` API, which
normalizes away dot-segments (`..`, `%2e%2e`, and mixed-case encodings) before the path is resolved
against `dir`, so a request never carries an unresolved `..` past that point.

Each request is resolved in this order, stopping at the first stage that matches:

1. An exact file or directory `index.html` match under `dir`. A directory with an `index.html`
   requested without a trailing slash (`/docs`) gets a `301` to `/docs/` (preserving any query
   string), so the page's relative links resolve against the right directory.
2. The `cleanUrls` fallback (`<path>.html`), when enabled and the path has no extension — tried
   both when nothing at all matched and when the path matched a directory with no `index.html`
   (e.g. `about.html` next to an `about/` assets folder).
3. A directory listing, when `directoryListing` is enabled and the matched directory has no
   `index.html`. A request for that directory without a trailing slash gets a `301` to the
   slash-terminated URL first (preserving any query string), so the listing's relative links
   resolve correctly. Entry names and the listed path are HTML-escaped, and each entry's link is
   percent-encoded.
4. The `singlePageApp` fallback to the root `index.html`, when enabled.
5. `404` (or `403` for a path that would escape `dir`).
