import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startLocalServer } from '../core.js'
import type { LocalServerHandle } from '../types.js'

describe('startLocalServer startup', () => {
    let dir: string
    const handles: LocalServerHandle[] = []

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'local-server-startup-'))
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
    })

    afterEach(async () => {
        for (const handle of handles.splice(0)) {
            await handle.close()
        }
        await rm(dir, { recursive: true, force: true })
    })

    it('refuses to serve a file instead of a directory', async () => {
        const file = join(dir, 'index.html')
        await writeFile(file, '<html></html>')

        const error: unknown = await startLocalServer({ dir: file }).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBeInstanceOf(KnownError)
        expect((error as KnownError).message).toMatch(/not a directory/)
    })

    it('binds to 127.0.0.1 on a free port by default', async () => {
        const handle = await startLocalServer({ dir, liveReload: false })
        handles.push(handle)

        expect(handle.port).toBeGreaterThan(0)
        expect(handle.url).toBe(`http://127.0.0.1:${String(handle.port)}`)
    })

    it('reports a port that is already in use as a KnownError', async () => {
        const first = await startLocalServer({ dir, liveReload: false })
        handles.push(first)

        const error: unknown = await startLocalServer({
            dir,
            port: first.port,
            liveReload: false,
        }).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(KnownError)
        expect((error as KnownError).message).toBe(`Port ${String(first.port)} is already in use`)
    })
})
