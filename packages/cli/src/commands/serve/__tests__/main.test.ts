import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configFileName } from '@minimaz/config'
import { KnownError } from '@minimaz/logger'
import { serve } from '../main.js'
import * as localServer from '@minimaz/local-server'
import type * as LocalServerModule from '@minimaz/local-server'
import type { LocalServerHandle } from '@minimaz/local-server'

vi.mock('@minimaz/local-server', async (importOriginal) => {
    const actual = await importOriginal<typeof LocalServerModule>()
    return { ...actual, startLocalServer: vi.fn() }
})

describe('serve', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(path.join(tmpdir(), 'minimaz-cli-serve-'))
        vi.mocked(localServer.startLocalServer).mockReset()
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    it('throws a KnownError pointing at "minimaz build" when output.dir does not exist', async () => {
        await writeFile(
            path.join(cwd, configFileName),
            JSON.stringify({ output: { dir: './dist' } }),
        )

        await expect(serve(cwd)).rejects.toThrow(KnownError)
        await expect(serve(cwd)).rejects.toThrow(/minimaz build/)
    })

    it('starts the local server on output.dir with every serve.* config field mapped through', async () => {
        const outDir = path.join(cwd, 'dist')
        await mkdir(outDir, { recursive: true })

        await writeFile(
            path.join(cwd, configFileName),
            JSON.stringify({
                output: { dir: './dist' },
                serve: {
                    port: 5000,
                    host: '0.0.0.0',
                    liveReload: false,
                    cleanUrls: true,
                    singlePageApp: true,
                    directoryListing: true,
                    cacheControl: true,
                },
            }),
        )

        const handle: LocalServerHandle = { url: 'http://0.0.0.0:5000', port: 5000, close: vi.fn() }
        vi.mocked(localServer.startLocalServer).mockResolvedValue(handle)

        await serve(cwd, { keepAlive: false })

        expect(localServer.startLocalServer).toHaveBeenCalledWith({
            dir: outDir,
            port: 5000,
            host: '0.0.0.0',
            liveReload: false,
            cleanUrls: true,
            singlePageApp: true,
            directoryListing: true,
            cacheControl: true,
        })
    })
})
