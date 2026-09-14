import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KnownError } from '@minimaz/errors'
import { startLocalServer } from './core.js'
import type { LocalServerHandle } from './types.js'

describe('startLocalServer', () => {
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

        const { value } = await reader.read()
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
