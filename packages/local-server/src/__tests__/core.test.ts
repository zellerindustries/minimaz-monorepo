import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KnownError } from '@minimaz/logger'
import { startLocalServer } from '../core.js'
import type * as FsPromises from 'node:fs/promises'
import type { ReadableStreamReadResult } from 'node:stream/web'
import type { LocalServerHandle } from '../types.js'

vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof FsPromises>()
    return { ...actual, readFile: vi.fn(actual.readFile) }
})

let dir: string
let handle: LocalServerHandle | undefined

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'minimaz-local-server-'))
    await writeFile(join(dir, 'index.html'), '<html><body><h1>Hi</h1></body></html>')
    await writeFile(join(dir, 'style.css'), 'body { color: red; }')
})

afterEach(async () => {
    await handle?.close()
    handle = undefined
    await rm(dir, { recursive: true, force: true })
})

describe('startLocalServer', () => {
    it('serves a static file with the correct content type', async () => {
        handle = await startLocalServer({ dir, liveReload: false })

        const response = await fetch(`${handle.url}/style.css`)

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8')
        expect(await response.text()).toBe('body { color: red; }')
    })

    it('returns 404 for a missing file', async () => {
        handle = await startLocalServer({ dir, liveReload: false })

        const response = await fetch(`${handle.url}/missing.txt`)

        expect(response.status).toBe(404)
    })

    it('returns 404 (not 500) when the file is removed between resolution and read', async () => {
        handle = await startLocalServer({ dir, liveReload: false })

        const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        vi.mocked(readFile).mockRejectedValueOnce(enoent)

        const response = await fetch(`${handle.url}/style.css`)

        expect(response.status).toBe(404)
    })

    it('serves a file whose name requires percent-decoding', async () => {
        await writeFile(join(dir, 'my file.css'), 'body { color: blue; }')
        handle = await startLocalServer({ dir, liveReload: false })

        const response = await fetch(`${handle.url}/my%20file.css`)

        expect(response.status).toBe(200)
        expect(await response.text()).toBe('body { color: blue; }')
    })

    it('returns 400 for a malformed percent-encoded pathname', async () => {
        handle = await startLocalServer({ dir, liveReload: false })

        const response = await fetch(`${handle.url}/%E0%A4%A`)

        expect(response.status).toBe(400)
    })

    it('injects the reload script into HTML when liveReload is enabled', async () => {
        handle = await startLocalServer({ dir, liveReload: true })

        const response = await fetch(`${handle.url}/index.html`)
        const body = await response.text()

        expect(body).toContain('EventSource')
        expect(body).toContain('<h1>Hi</h1>')
    })

    it('does not inject the reload script when liveReload is disabled', async () => {
        handle = await startLocalServer({ dir, liveReload: false })

        const response = await fetch(`${handle.url}/index.html`)
        const body = await response.text()

        expect(body).not.toContain('EventSource')
    })

    it('pushes a reload event over SSE when a served file changes', async () => {
        handle = await startLocalServer({ dir, liveReload: true })

        const response = await fetch(`${handle.url}/__minimaz-live-reload`)
        const reader = response.body?.getReader()
        if (reader === undefined) {
            throw new Error('Expected a readable SSE response body')
        }

        await reader.read() // consume the initial connection flush

        await writeFile(join(dir, 'index.html'), '<html><body>updated</body></html>')

        const { value } = (await reader.read()) as ReadableStreamReadResult<Uint8Array>
        const chunk = new TextDecoder().decode(value)

        expect(chunk).toContain('event: reload')

        await reader.cancel()
    })

    it('stops responding after close(), and close() is idempotent', async () => {
        handle = await startLocalServer({ dir, liveReload: false })
        const { url } = handle

        await handle.close()
        await handle.close()

        await expect(fetch(url)).rejects.toThrow()

        handle = undefined
    })

    it('throws a KnownError when the directory does not exist', async () => {
        await expect(startLocalServer({ dir: join(dir, 'does-not-exist') })).rejects.toThrow(
            KnownError,
        )
    })
})

describe('cleanUrls / singlePageApp / directoryListing', () => {
    it('serves the clean-URL fallback when cleanUrls is enabled', async () => {
        await writeFile(join(dir, 'about.html'), '<html>about</html>')
        handle = await startLocalServer({ dir, liveReload: false, cleanUrls: true })

        const response = await fetch(`${handle.url}/about`)

        expect(response.status).toBe(200)
        expect(await response.text()).toContain('about')
    })

    it('renders a directory listing when enabled and no index.html exists', async () => {
        await mkdir(join(dir, 'no-index'))
        await writeFile(join(dir, 'no-index', 'file.txt'), 'hi')
        handle = await startLocalServer({ dir, liveReload: false, directoryListing: true })

        const response = await fetch(`${handle.url}/no-index`)

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('text/html')
        expect(await response.text()).toContain('file.txt')
    })

    it('falls back to root index.html for an unresolved path when singlePageApp is enabled', async () => {
        handle = await startLocalServer({ dir, liveReload: false, singlePageApp: true })

        const response = await fetch(`${handle.url}/some/client/route`)

        expect(response.status).toBe(200)
        expect(await response.text()).toContain('Hi')
    })
})

describe('cacheControl', () => {
    it('adds no cache headers when cacheControl is off (default)', async () => {
        handle = await startLocalServer({ dir, liveReload: false })

        const response = await fetch(`${handle.url}/style.css`)

        expect(response.headers.get('etag')).toBeNull()
        expect(response.headers.get('cache-control')).toBeNull()
    })

    it('adds an ETag and Cache-Control: no-cache when enabled', async () => {
        handle = await startLocalServer({ dir, liveReload: false, cacheControl: true })

        const response = await fetch(`${handle.url}/style.css`)

        expect(response.headers.get('etag')).toMatch(/^W\//)
        expect(response.headers.get('cache-control')).toBe('no-cache')
    })

    it('returns 304 with an empty body when If-None-Match matches', async () => {
        handle = await startLocalServer({ dir, liveReload: false, cacheControl: true })

        const first = await fetch(`${handle.url}/style.css`)
        const etag = first.headers.get('etag')
        if (etag === null) {
            throw new Error('expected an ETag on the first response')
        }

        const second = await fetch(`${handle.url}/style.css`, {
            headers: { 'if-none-match': etag },
        })

        expect(second.status).toBe(304)
        expect(await second.text()).toBe('')
    })

    it('computes the ETag over the post-injection HTML body, not the on-disk file', async () => {
        handle = await startLocalServer({ dir, liveReload: true, cacheControl: true })

        const response = await fetch(`${handle.url}/index.html`)
        const body = await response.text()
        const etag = response.headers.get('etag')

        expect(body).toContain('EventSource')

        const second = await fetch(`${handle.url}/index.html`, {
            headers: { 'if-none-match': etag ?? '' },
        })
        expect(second.status).toBe(304)
    })
})
