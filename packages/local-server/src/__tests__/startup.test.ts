import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startLocalServer } from '../core.js'
import type { LocalServerHandle } from '../types.js'
import type { AddressInfo, Server } from 'node:net'

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

    it('rejects with a KnownError naming the port when it is already in use', async () => {
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

    describe('with a listener on all interfaces', () => {
        const blockers: Server[] = []

        afterEach(async () => {
            for (const blocker of blockers.splice(0)) {
                await new Promise((resolve) => blocker.close(resolve))
            }
        })

        /**
         * Listens on a free port on `host` (or the wildcard when omitted).
         *
         * @param {string | undefined} host - The address to bind, or `undefined` for all interfaces
         * @returns {Promise<number | undefined>} The bound port, or `undefined` if binding failed
         */
        async function listenBlocker(host?: string): Promise<number | undefined> {
            const blocker = createServer()
            const bound = await new Promise<boolean>((resolve) => {
                blocker.once('error', () => {
                    resolve(false)
                })
                if (host === undefined) {
                    blocker.listen(0, () => {
                        resolve(true)
                    })
                } else {
                    blocker.listen(0, host, () => {
                        resolve(true)
                    })
                }
            })
            if (!bound) {
                return undefined
            }
            blockers.push(blocker)
            return (blocker.address() as AddressInfo).port
        }

        async function expectPortInUse(port: number): Promise<void> {
            const error: unknown = await startLocalServer({
                dir,
                port,
                host: '127.0.0.1',
                liveReload: false,
            }).then(
                (handle) => {
                    handles.push(handle)
                    return undefined
                },
                (caught: unknown) => caught,
            )

            expect(error).toBeInstanceOf(KnownError)
            expect((error as KnownError).message).toBe(`Port ${String(port)} is already in use`)
        }

        it('rejects when the port is held by a listener with no host', async () => {
            const port = await listenBlocker()
            expect(port).toBeDefined()
            await expectPortInUse(port ?? 0)
        })

        it('rejects when the port is held by a listener on 0.0.0.0', async () => {
            const port = await listenBlocker('0.0.0.0')
            expect(port).toBeDefined()
            await expectPortInUse(port ?? 0)
        })

        it('rejects when the port is held by a listener on ::', async (context) => {
            const port = await listenBlocker('::')
            if (port === undefined) {
                context.skip()
                return
            }
            await expectPortInUse(port)
        })
    })

    it('still starts on an explicit port that is free', async () => {
        const probe = createServer()
        await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
        const port = (probe.address() as AddressInfo).port
        await new Promise((resolve) => probe.close(resolve))

        const handle = await startLocalServer({ dir, port, liveReload: false })
        handles.push(handle)

        expect(handle.port).toBe(port)
    })
})
