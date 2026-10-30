import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configFileName } from '@minimaz/config'
import { KnownError, log } from '@minimaz/logger'
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

    it('hints at "minimaz init" (not "docs init") when the config file is missing', async () => {
        await expect(serve(cwd)).rejects.toThrow('Run "minimaz init" first.')
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

    it('warns and serves on 4173 when serve.port is not configured', async () => {
        await mkdir(path.join(cwd, 'dist'), { recursive: true })
        await writeFile(
            path.join(cwd, configFileName),
            JSON.stringify({ output: { dir: './dist' } }),
        )
        const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined)
        vi.mocked(localServer.startLocalServer).mockResolvedValue({
            url: 'http://127.0.0.1:4173',
            port: 4173,
            close: vi.fn(),
        })

        await serve(cwd, { keepAlive: false })

        expect(warn).toHaveBeenCalledOnce()
        const message = JSON.stringify(warn.mock.calls[0]?.[0])
        expect(message).toContain('serve.port')
        expect(message).toContain('4173')
        expect(localServer.startLocalServer).toHaveBeenCalledWith(
            expect.objectContaining({ port: 4173 }),
        )
        warn.mockRestore()
    })

    it.each([5000, 0])('does not warn when serve.port is set to %i', async (port) => {
        await mkdir(path.join(cwd, 'dist'), { recursive: true })
        await writeFile(
            path.join(cwd, configFileName),
            JSON.stringify({ output: { dir: './dist' }, serve: { port } }),
        )
        const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined)
        vi.mocked(localServer.startLocalServer).mockResolvedValue({
            url: 'http://127.0.0.1:1',
            port,
            close: vi.fn(),
        })

        await serve(cwd, { keepAlive: false })

        expect(warn).not.toHaveBeenCalled()
        warn.mockRestore()
    })

    describe('keepAlive', () => {
        /** Starts `serve` with mocked process signal registration and returns the captured handlers. */
        async function startKeepAlive(close: () => Promise<void>): Promise<{
            done: Promise<void>
            handlers: Map<string, () => void>
        }> {
            await mkdir(path.join(cwd, 'dist'), { recursive: true })
            await writeFile(
                path.join(cwd, configFileName),
                JSON.stringify({ output: { dir: './dist' } }),
            )
            vi.mocked(localServer.startLocalServer).mockResolvedValue({
                url: 'http://localhost:3000',
                port: 3000,
                close,
            })

            const handlers = new Map<string, () => void>()
            vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
                handlers.set(event, handler)
                return process
            }) as never)

            const done = serve(cwd)
            await vi.waitFor(() => {
                expect(handlers.size).toBe(2)
            })
            return { done, handlers }
        }

        afterEach(() => {
            vi.restoreAllMocks()
        })

        it.each(['SIGINT', 'SIGTERM'])('closes the server and resolves on %s', async (signal) => {
            const close = vi.fn().mockResolvedValue(undefined)
            const { done, handlers } = await startKeepAlive(close)

            handlers.get(signal)?.()

            await expect(done).resolves.toBeUndefined()
            expect(close).toHaveBeenCalledOnce()
        })

        it('still resolves when closing the server fails', async () => {
            const close = vi.fn().mockRejectedValue(new Error('boom'))
            const { done, handlers } = await startKeepAlive(close)

            handlers.get('SIGINT')?.()

            await expect(done).resolves.toBeUndefined()
        })
    })
})
