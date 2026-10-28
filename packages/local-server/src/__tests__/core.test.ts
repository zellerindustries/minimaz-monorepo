import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { Server } from 'node:http'
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
    return { ...actual, readFile: vi.fn(actual.readFile), stat: vi.fn(actual.stat) }
})

let dir: string
let handle: LocalServerHandle | undefined

/**
 * Makes the next `stat` calls pass through, then reject once, so a test can
 * fail one specific call in `handleRequest`'s fixed stat sequence.
 *
 * @param {number} passes - How many calls to let through before the rejection
 * @returns {Promise<void>}
 */
async function rejectStatAfter(passes: number): Promise<void> {
    const actual = await vi.importActual<typeof FsPromises>('node:fs/promises')
    for (let index = 0; index < passes; index++) {
        vi.mocked(stat).mockImplementationOnce(actual.stat)
    }
    vi.mocked(stat).mockRejectedValueOnce(new Error('stat failed'))
}

/**
 * Captures the `http.Server` that `startLocalServer` creates, by observing
 * the `address()` call it makes right after listening.
 *
 * @param {boolean} returnNull - Whether `address()` should report `null`
 * @returns {{ get: () => Server | undefined }} Accessor for the captured server
 */
function captureServer(returnNull: boolean): { get: () => Server | undefined } {
    const spy = vi.spyOn(Server.prototype, 'address')
    if (returnNull) {
        spy.mockReturnValueOnce(null)
    }
    return { get: () => spy.mock.contexts[0] as Server | undefined }
}

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

    it('redirects a directory listing request with no trailing slash', async () => {
        await mkdir(join(dir, 'no-index'))
        await writeFile(join(dir, 'no-index', 'file.txt'), 'hi')
        handle = await startLocalServer({ dir, liveReload: false, directoryListing: true })

        const response = await fetch(`${handle.url}/no-index`, { redirect: 'manual' })

        expect(response.status).toBe(301)
        expect(response.headers.get('location')).toBe('/no-index/')
    })

    it('preserves the query string on a directory-listing redirect', async () => {
        await mkdir(join(dir, 'no-index'))
        handle = await startLocalServer({ dir, liveReload: false, directoryListing: true })

        const response = await fetch(`${handle.url}/no-index?sort=name`, { redirect: 'manual' })

        expect(response.status).toBe(301)
        expect(response.headers.get('location')).toBe('/no-index/?sort=name')
    })

    it('percent-encodes a non-ASCII directory name on redirect instead of throwing', async () => {
        const dirName = 'résumés'
        await mkdir(join(dir, dirName))
        handle = await startLocalServer({ dir, liveReload: false, directoryListing: true })

        const response = await fetch(`${handle.url}/${encodeURIComponent(dirName)}`, {
            redirect: 'manual',
        })

        expect(response.status).toBe(301)
        expect(response.headers.get('location')).toBe(`/${encodeURIComponent(dirName)}/`)
    })

    it('redirects a directory with an index.html requested without a trailing slash', async () => {
        await mkdir(join(dir, 'docs'))
        await writeFile(join(dir, 'docs', 'index.html'), '<html>docs</html>')
        handle = await startLocalServer({ dir, liveReload: false })

        const response = await fetch(`${handle.url}/docs?page=2`, { redirect: 'manual' })

        expect(response.status).toBe(301)
        expect(response.headers.get('location')).toBe('/docs/?page=2')
    })

    it.each([
        ['/%2Fevil.com%2F..', 301, '/'],
        ['/%2F%2Fevil.com%2F..', 301, '/'],
        ['/%2fevil.com%2f..', 301, '/'],
        ['/%2Fevil.com%2F..%2Fdocs', 301, '/docs/'],
        ['/%2e%2e%2f', 403, null],
        ['//evil.com', 200, null],
        ['/docs//', 200, null],
        ['/docs', 301, '/docs/'],
    ] as const)('never redirects off-origin for %s', async (path, status, location) => {
        await mkdir(join(dir, 'docs'))
        await writeFile(join(dir, 'docs', 'index.html'), '<html>docs</html>')
        handle = await startLocalServer({ dir, liveReload: false, directoryListing: true })

        const response = await fetch(`${handle.url}${path}`, { redirect: 'manual' })

        expect(response.status).toBe(status)
        expect(response.headers.get('location')).toBe(location)
    })

    it('serves a directory index.html directly when the trailing slash is present', async () => {
        await mkdir(join(dir, 'docs'))
        await writeFile(join(dir, 'docs', 'index.html'), '<html>docs</html>')
        handle = await startLocalServer({ dir, liveReload: false })

        const response = await fetch(`${handle.url}/docs/`, { redirect: 'manual' })

        expect(response.status).toBe(200)
        expect(await response.text()).toContain('docs')
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

    it('reuses the same ETag across repeated requests for an unchanged file', async () => {
        handle = await startLocalServer({ dir, liveReload: false, cacheControl: true })

        const first = await fetch(`${handle.url}/style.css`)
        const second = await fetch(`${handle.url}/style.css`)

        expect(first.headers.get('etag')).toBe(second.headers.get('etag'))
    })

    it('computes a new ETag once the file changes on disk', async () => {
        handle = await startLocalServer({ dir, liveReload: false, cacheControl: true })

        const first = await fetch(`${handle.url}/style.css`)
        const firstEtag = first.headers.get('etag')

        await writeFile(join(dir, 'style.css'), 'body { color: blue; }')
        const second = await fetch(`${handle.url}/style.css`, {
            headers: { 'if-none-match': firstEtag ?? '' },
        })

        expect(second.status).toBe(200)
        expect(second.headers.get('etag')).not.toBe(firstEtag)
    })
})

describe('error paths', () => {
    it('throws a KnownError when the path is a file, not a directory', async () => {
        await expect(startLocalServer({ dir: join(dir, 'style.css') })).rejects.toThrow(
            'not a directory',
        )
    })

    it('returns 500 and logs when reading the file fails with a non-ENOENT error', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        handle = await startLocalServer({ dir, liveReload: false })
        vi.mocked(readFile).mockRejectedValueOnce(
            Object.assign(new Error('permission denied'), { code: 'EACCES' }),
        )

        const response = await fetch(`${handle.url}/style.css`)

        expect(response.status).toBe(500)
        expect(await response.text()).toBe('Internal Server Error')
        expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('permission denied'))
    })

    it('returns 500 and logs a stringified value when a non-Error is thrown', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        handle = await startLocalServer({ dir, liveReload: false })
        vi.mocked(readFile).mockRejectedValueOnce('plain string failure')

        const response = await fetch(`${handle.url}/style.css`)

        expect(response.status).toBe(500)
        expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('plain string failure'))
    })

    it('rejects with the raw error when the listen failure is not EADDRINUSE', async () => {
        await expect(
            startLocalServer({ dir, liveReload: false, host: '203.0.113.1' }),
        ).rejects.toMatchObject({ code: 'EADDRNOTAVAIL' })
    })

    it('rejects with a KnownError when the port is already in use', async () => {
        handle = await startLocalServer({ dir, liveReload: false })

        await expect(
            startLocalServer({ dir, liveReload: false, port: handle.port }),
        ).rejects.toThrow(KnownError)
    })

    it('throws and closes live reload when the server address cannot be resolved', async () => {
        const capture = captureServer(true)

        await expect(startLocalServer({ dir, liveReload: true })).rejects.toThrow(
            'Failed to resolve local server address',
        )

        vi.restoreAllMocks()
        const server = capture.get()
        await new Promise<void>((resolveClose) => {
            server?.close(() => {
                resolveClose()
            })
        })
    })

    it('logs runtime server errors instead of crashing', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const capture = captureServer(false)
        handle = await startLocalServer({ dir, liveReload: false })

        expect(() => capture.get()?.emit('error', new Error('socket exploded'))).not.toThrow()

        expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('socket exploded'))
    })

    it('rejects close() when the underlying server is already stopped', async () => {
        const capture = captureServer(false)
        handle = await startLocalServer({ dir, liveReload: false })
        capture.get()?.close()

        await expect(handle.close()).rejects.toThrow()
    })
})

describe('cacheControl edge cases', () => {
    it('sends no etag or cache-control on a 404 when the file vanishes after the stat and If-None-Match is stale', async () => {
        handle = await startLocalServer({ dir, liveReload: false, cacheControl: true })
        await fetch(`${handle.url}/style.css`)
        // The cached entry still matches the file's stat, so only the etag comparison keeps the
        // fast path from setting headers on a response that then turns into a 404.
        vi.mocked(readFile).mockRejectedValueOnce(
            Object.assign(new Error('gone'), { code: 'ENOENT' }),
        )

        const response = await fetch(`${handle.url}/style.css`, {
            headers: { 'if-none-match': 'W/"stale"' },
        })

        expect(response.status).toBe(404)
        expect(response.headers.get('etag')).toBeNull()
        expect(response.headers.get('cache-control')).toBeNull()
    })

    it('serves the file with 200 when the pre-read stat fails', async () => {
        handle = await startLocalServer({ dir, liveReload: false, cacheControl: true })
        await rejectStatAfter(1)

        const response = await fetch(`${handle.url}/style.css`)

        expect(response.status).toBe(200)
        expect(await response.text()).toBe('body { color: red; }')
        expect(response.headers.get('etag')).toMatch(/^W\//)
    })

    it('does not cache the ETag when the post-read stat fails', async () => {
        handle = await startLocalServer({ dir, liveReload: false, cacheControl: true })
        await rejectStatAfter(2)

        const readsOfStyle = (): number =>
            vi
                .mocked(readFile)
                .mock.calls.filter(([path]) => (path as string).endsWith('style.css')).length

        const first = await fetch(`${handle.url}/style.css`)
        const etag = first.headers.get('etag') ?? ''
        const readsAfterFirst = readsOfStyle()
        const second = await fetch(`${handle.url}/style.css`, {
            headers: { 'if-none-match': etag },
        })

        expect(first.status).toBe(200)
        expect(second.status).toBe(304)
        // A cached ETag would let the second request skip the read entirely.
        expect(readsAfterFirst).toBe(1)
        expect(readsOfStyle()).toBe(2)
    })

    it('returns 304 for an unchanged directory listing when If-None-Match matches', async () => {
        await mkdir(join(dir, 'no-index'))
        await writeFile(join(dir, 'no-index', 'file.txt'), 'hi')
        handle = await startLocalServer({
            dir,
            liveReload: false,
            directoryListing: true,
            cacheControl: true,
        })

        const first = await fetch(`${handle.url}/no-index/`)
        const etag = first.headers.get('etag') ?? ''
        const second = await fetch(`${handle.url}/no-index/`, {
            headers: { 'if-none-match': etag },
        })

        expect(etag).toMatch(/^W\//)
        expect(second.status).toBe(304)
        expect(await second.text()).toBe('')
    })

    it('serves the listing with 200 when If-None-Match does not match', async () => {
        await mkdir(join(dir, 'no-index'))
        handle = await startLocalServer({
            dir,
            liveReload: false,
            directoryListing: true,
            cacheControl: true,
        })

        const response = await fetch(`${handle.url}/no-index/`, {
            headers: { 'if-none-match': 'W/"stale"' },
        })

        expect(response.status).toBe(200)
    })
})

describe('resilience', () => {
    it('keeps serving after a client aborts an in-flight request', async () => {
        handle = await startLocalServer({ dir, liveReload: true })
        const controller = new AbortController()
        const actual = await vi.importActual<typeof FsPromises>('node:fs/promises')
        let signalEntered: () => void = () => undefined
        const entered = new Promise<void>((resolveEntered) => {
            signalEntered = resolveEntered
        })
        let releaseRead: () => void = () => undefined
        const gate = new Promise<void>((resolveGate) => {
            releaseRead = resolveGate
        })
        vi.mocked(readFile).mockImplementationOnce(async (...args) => {
            signalEntered()
            await gate
            return actual.readFile(...args)
        })

        const aborted = fetch(`${handle.url}/index.html`, { signal: controller.signal })
        await entered
        controller.abort()
        await expect(aborted).rejects.toThrow()
        releaseRead()

        const response = await fetch(`${handle.url}/style.css`)
        expect(response.status).toBe(200)
    })

    it('responds 404 and stays up when the served directory is deleted mid-run', async () => {
        handle = await startLocalServer({ dir, liveReload: false })
        await rm(dir, { recursive: true, force: true })

        const response = await fetch(`${handle.url}/style.css`)

        expect(response.status).toBe(404)
        await mkdir(dir)
        await writeFile(join(dir, 'style.css'), 'back')
        expect(await (await fetch(`${handle.url}/style.css`)).text()).toBe('back')
    })
})
