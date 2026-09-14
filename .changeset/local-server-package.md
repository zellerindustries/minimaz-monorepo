---
'@minimaz/local-server': minor
---

Add @minimaz/local-server: a new published package providing startLocalServer(), a lightweight,
dependency-free node:http static file server for serving a built site during development —
path-traversal-safe static serving, MIME type resolution, and SSE-based live reload (watches the
served directory and pushes a reload event to connected clients on change). It is not yet wired
into @minimaz/cli as a serve command; that's a planned follow-up.
