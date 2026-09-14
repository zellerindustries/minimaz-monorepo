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
  `@minimaz/errors`) when `dir` doesn't exist or isn't a directory, or when a fixed `port` is
  already in use.
    - `options.dir` — the directory to serve. Must exist and be a directory.
    - `options.port` — port to bind. Defaults to `0` (an OS-assigned ephemeral port).
    - `options.host` — host to bind. Defaults to `"127.0.0.1"`.
    - `options.liveReload` — inject a live-reload script into HTML responses and watch `dir` for
      changes, pushing a `reload` event over Server-Sent Events to connected clients. Defaults to
      `true`.
- `LocalServerHandle`
    - `url` — the server's base URL, e.g. `"http://127.0.0.1:53241"`.
    - `port` — the bound port (resolved even when `options.port` was `0` or omitted).
    - `close()` — stops the HTTP server and the file watcher (if any). Safe to call more than once.

Path traversal outside `dir` is rejected with `403`. Requests for a directory resolve to its
`index.html`, falling back to `404` when there isn't one.
