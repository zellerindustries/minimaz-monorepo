import { EventEmitter } from 'node:events'
import { statSync, watch } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { createServer, get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveReload, injectReloadScript } from '../live-reload.js'
import type * as Fs from 'node:fs'
import type { FSWatcher } from 'node:fs'
import type { LiveReloadController } from '../live-reload.js'
import type { ServerResponse } from 'node:http'

const watcherState = vi.hoisted(() => ({
    created: [] as unknown[],
    closed: new Set<unknown>(),
}))

vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof Fs>()
    return {
        ...actual,
        statSync: vi.fn(actual.statSync),
        watch: vi.fn((...args: Parameters<typeof actual.watch>): FSWatcher => {
            const watcher = actual.watch(...args)
            watcherState.created.push(watcher)
            watcher.on('close', () => {
                watcherState.closed.add(watcher)
            })
            return watcher
        }),
    }
})

/**
 * A minimal stand-in for an SSE `ServerResponse` that records every chunk written to it.
 */
class FakeSseResponse extends EventEmitter {
    readonly chunks: string[] = []

    writeHead(): this {
        return this
    }

    write(chunk: string): boolean {
        this.chunks.push(chunk)
        return true
    }

    end(): this {
        return this
    }

    reloadCount(): number {
        return this.chunks.filter((chunk) => chunk.includes('event: reload')).length
    }
}

/**
 * Sleeps for `ms` milliseconds.
 *
 * @param {number} ms - How long to wait
 * @returns {Promise<void>} Resolves after the delay
 */
async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Polls until `res` has received more than `previous` reload events, or fails after `timeoutMs`.
 *
 * @param {FakeSseResponse} res - The fake SSE response to inspect
 * @param {number} previous - The reload count to exceed
 * @param {number} timeoutMs - How long to wait before failing
 * @returns {Promise<void>} Resolves once a new reload event arrives
 */
async function waitForReload(
    res: FakeSseResponse,
    previous: number,
    timeoutMs = 4000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (res.reloadCount() > previous) {
            return
        }
        await sleep(25)
    }
    throw new Error(`No reload event within ${String(timeoutMs)}ms`)
}

describe('injectReloadScript', () => {
    it('inserts the script immediately before </body>', () => {
        const html = '<html><body><h1>Hi</h1></body></html>'
        const result = injectReloadScript(html)

        expect(result).toContain('<h1>Hi</h1>')
        expect(result.indexOf('EventSource')).toBeLessThan(result.indexOf('</body>'))
        expect(result.endsWith('</html>')).toBe(true)
    })

    it('appends the script when there is no </body>', () => {
        const html = '<html><h1>Hi</h1></html>'
        const result = injectReloadScript(html)

        expect(result.startsWith(html)).toBe(true)
        expect(result).toContain('EventSource')
    })

    it('points the script at the live-reload endpoint', () => {
        const result = injectReloadScript('<body></body>')
        expect(result).toContain('/__minimaz-live-reload')
    })
})

describe('createLiveReload', () => {
    let controller: LiveReloadController | undefined

    afterEach(() => {
        controller?.close()
        controller = undefined
    })

    it('rejects new SSE connections after close() instead of registering them', async () => {
        controller = createLiveReload(tmpdir())
        controller.close()

        const server = createServer((_req, res) => {
            controller?.handleSseRequest(res)
        })

        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

        try {
            const address = server.address()
            if (address === null || typeof address === 'string') {
                throw new Error('Expected a bound address')
            }

            const response = await fetch(`http://127.0.0.1:${String(address.port)}/`)

            expect(response.status).toBe(503)
        } finally {
            await new Promise<void>((resolve) =>
                server.close(() => {
                    resolve()
                }),
            )
        }
    })

    it('stops broadcasting to a client after its response errors', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'minimaz-local-server-'))

        try {
            controller = createLiveReload(dir)

            let capturedRes: ServerResponse | undefined
            const server = createServer((_req, res) => {
                capturedRes = res
                controller?.handleSseRequest(res)
            })

            await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

            try {
                const address = server.address()
                if (address === null || typeof address === 'string') {
                    throw new Error('Expected a bound address')
                }

                await new Promise<void>((resolve) => {
                    get(`http://127.0.0.1:${String(address.port)}/`, (response) => {
                        response.on('data', () => undefined)
                        resolve()
                    })
                })

                if (capturedRes === undefined) {
                    throw new Error('Expected the server to have captured a response')
                }

                const writeSpy = vi.spyOn(capturedRes, 'write')
                capturedRes.emit('error', new Error('ECONNRESET'))

                await writeFile(join(dir, 'changed.txt'), 'x')
                await new Promise((resolve) => setTimeout(resolve, 150))

                expect(writeSpy).not.toHaveBeenCalled()
            } finally {
                server.closeAllConnections()
                await new Promise<void>((resolve) =>
                    server.close(() => {
                        resolve()
                    }),
                )
            }
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    it('drops a client that disconnects and keeps broadcasting to the others without throwing', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'minimaz-local-server-disconnect-'))
        const server = createServer((_req, res) => {
            capturedRes = res
            controller?.handleSseRequest(res)
        })
        let capturedRes: ServerResponse | undefined

        try {
            controller = createLiveReload(dir)
            await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
            const address = server.address()
            if (address === null || typeof address === 'string') {
                throw new Error('Expected a bound address')
            }

            const request = get(`http://127.0.0.1:${String(address.port)}/`)
            await new Promise<void>((resolve) => {
                request.on('response', (response) => {
                    response.on('data', () => undefined)
                    resolve()
                })
            })
            if (capturedRes === undefined) {
                throw new Error('Expected the server to have captured a response')
            }
            const disconnected = capturedRes
            const closed = new Promise<void>((resolve) => disconnected.on('close', resolve))
            const writeSpy = vi.spyOn(disconnected, 'write')

            request.destroy()
            await closed

            const other = new FakeSseResponse()
            controller.handleSseRequest(other as unknown as ServerResponse)
            await writeFile(join(dir, 'changed.txt'), 'x')
            await waitForReload(other, 0)

            expect(writeSpy).not.toHaveBeenCalled()
            expect(() => controller?.close()).not.toThrow()
        } finally {
            server.closeAllConnections()
            await new Promise<void>((resolve) => {
                server.close(() => {
                    resolve()
                })
            })
            await rm(dir, { recursive: true, force: true })
        }
    })

    describe('re-arming after the watched directory is replaced', () => {
        let root: string | undefined

        afterEach(async () => {
            controller?.close()
            controller = undefined
            if (root !== undefined) {
                await rm(root, { recursive: true, force: true })
                root = undefined
            }
        })

        it('still reloads on a file change after a rename-into-place swap', async () => {
            root = await mkdtemp(join(tmpdir(), 'minimaz-local-server-swap-'))
            const served = join(root, 'out')
            await mkdir(served)
            await writeFile(join(served, 'index.html'), 'v1')

            controller = createLiveReload(served)
            const res = new FakeSseResponse()
            controller.handleSseRequest(res as unknown as ServerResponse)
            await sleep(150)

            const staging = join(root, 'out.tmp')
            await mkdir(staging)
            await writeFile(join(staging, 'index.html'), 'v2')
            await rename(served, join(root, 'out.old'))
            await rename(staging, served)
            await rm(join(root, 'out.old'), { recursive: true, force: true })

            // The swap itself is a content change: one reload once the watcher re-arms.
            await waitForReload(res, 0)
            await sleep(1500)

            const before = res.reloadCount()
            await writeFile(join(served, 'index.html'), 'v3')

            await waitForReload(res, before)
            expect(res.reloadCount()).toBeGreaterThan(before)
        })

        it('still reloads on a file change after the directory is deleted and recreated', async () => {
            root = await mkdtemp(join(tmpdir(), 'minimaz-local-server-recreate-'))
            const served = join(root, 'out')
            await mkdir(served)

            controller = createLiveReload(served)
            const res = new FakeSseResponse()
            controller.handleSseRequest(res as unknown as ServerResponse)
            await sleep(150)

            await rm(served, { recursive: true, force: true })
            await sleep(300)
            await mkdir(served)

            await waitForReload(res, 0)
            await sleep(1500)

            const before = res.reloadCount()
            await writeFile(join(served, 'changed.txt'), 'x')

            await waitForReload(res, before)
            expect(res.reloadCount()).toBeGreaterThan(before)
        })

        it('keeps retrying while the directory does not exist yet, then reloads once it appears', async () => {
            root = await mkdtemp(join(tmpdir(), 'minimaz-local-server-late-'))
            const served = join(root, 'out')

            controller = createLiveReload(served)
            const res = new FakeSseResponse()
            controller.handleSseRequest(res as unknown as ServerResponse)
            await sleep(150)

            await mkdir(served)

            await waitForReload(res, 0)
            expect(res.reloadCount()).toBeGreaterThan(0)
        })

        it('does not treat a plain file at the watched path as a directory', async () => {
            root = await mkdtemp(join(tmpdir(), 'minimaz-local-server-file-'))
            const served = join(root, 'out')
            await writeFile(served, 'not a dir')

            const watchCallsBefore = vi.mocked(watch).mock.calls.length
            controller = createLiveReload(served)
            await sleep(250)

            expect(vi.mocked(watch).mock.calls.length).toBe(watchCallsBefore)
        })

        it('re-arms and reloads after the watcher emits an error', async () => {
            root = await mkdtemp(join(tmpdir(), 'minimaz-local-server-error-'))
            const served = join(root, 'out')
            await mkdir(served)

            const createdBefore = watcherState.created.length
            controller = createLiveReload(served)
            const res = new FakeSseResponse()
            controller.handleSseRequest(res as unknown as ServerResponse)

            const first = watcherState.created[createdBefore] as FSWatcher
            first.emit('error', new Error('EPERM'))

            await waitForReload(res, 0)
            expect(watcherState.closed.has(first)).toBe(true)
            expect(watcherState.created.length).toBeGreaterThan(createdBefore + 1)
        })

        it('retries and reloads when statting the directory throws', async () => {
            root = await mkdtemp(join(tmpdir(), 'minimaz-local-server-statfail-'))
            const served = join(root, 'out')
            await mkdir(served)

            vi.mocked(statSync).mockImplementationOnce(() => {
                throw new Error('EIO')
            })
            const watchCallsBefore = vi.mocked(watch).mock.calls.length
            controller = createLiveReload(served)
            const res = new FakeSseResponse()
            controller.handleSseRequest(res as unknown as ServerResponse)

            expect(vi.mocked(watch).mock.calls.length).toBe(watchCallsBefore)
            await waitForReload(res, 0)
            expect(vi.mocked(watch).mock.calls.length).toBe(watchCallsBefore + 1)
        })

        it('retries and reloads when watch() throws an Error', async () => {
            root = await mkdtemp(join(tmpdir(), 'minimaz-local-server-watchfail-'))
            const served = join(root, 'out')
            await mkdir(served)

            vi.mocked(watch).mockImplementationOnce(() => {
                throw new Error('EMFILE')
            })
            const watchCallsBefore = vi.mocked(watch).mock.calls.length
            controller = createLiveReload(served)
            const res = new FakeSseResponse()
            controller.handleSseRequest(res as unknown as ServerResponse)

            await waitForReload(res, 0)
            expect(vi.mocked(watch).mock.calls.length).toBe(watchCallsBefore + 2)
        })

        it('retries and reloads when watch() throws a non-Error value', async () => {
            root = await mkdtemp(join(tmpdir(), 'minimaz-local-server-watchstr-'))
            const served = join(root, 'out')
            await mkdir(served)

            vi.mocked(watch).mockImplementationOnce(() => {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw 'no watchers left'
            })
            const watchCallsBefore = vi.mocked(watch).mock.calls.length
            controller = createLiveReload(served)
            const res = new FakeSseResponse()
            controller.handleSseRequest(res as unknown as ServerResponse)

            await waitForReload(res, 0)
            expect(vi.mocked(watch).mock.calls.length).toBe(watchCallsBefore + 2)
        })

        it('ignores an error from a watcher that was already replaced', async () => {
            root = await mkdtemp(join(tmpdir(), 'minimaz-local-server-stale-'))
            const served = join(root, 'out')
            await mkdir(served)

            const createdBefore = watcherState.created.length
            controller = createLiveReload(served)
            const res = new FakeSseResponse()
            controller.handleSseRequest(res as unknown as ServerResponse)
            const first = watcherState.created[createdBefore] as FSWatcher

            first.emit('error', new Error('EPERM'))
            await waitForReload(res, 0)

            const second = watcherState.created[watcherState.created.length - 1] as FSWatcher
            expect(second).not.toBe(first)
            const closeSpy = vi.spyOn(second, 'close')
            const watchCallsBefore = vi.mocked(watch).mock.calls.length

            first.emit('error', new Error('stale EPERM'))

            expect(closeSpy).not.toHaveBeenCalled()
            expect(vi.mocked(watch).mock.calls.length).toBe(watchCallsBefore)
        })

        describe('with fake timers', () => {
            afterEach(() => {
                vi.useRealTimers()
            })

            it('does not re-arm when close() happens while a re-arm check is running', () => {
                vi.useFakeTimers()
                const served = join(tmpdir(), 'minimaz-local-server-never-exists-a')
                const watchCallsBefore = vi.mocked(watch).mock.calls.length

                controller = createLiveReload(served)
                const statCallsBefore = vi.mocked(statSync).mock.calls.length
                vi.mocked(statSync).mockImplementationOnce(() => {
                    controller?.close()
                    return undefined
                })

                vi.advanceTimersByTime(150)
                const statCallsAfterCheck = vi.mocked(statSync).mock.calls.length
                vi.advanceTimersByTime(20_000)

                expect(statCallsAfterCheck).toBe(statCallsBefore + 1)
                expect(vi.mocked(statSync).mock.calls.length).toBe(statCallsAfterCheck)
                expect(vi.mocked(watch).mock.calls.length).toBe(watchCallsBefore)
            })

            it('ignores a check that fires after close()', () => {
                vi.useFakeTimers()
                const served = join(tmpdir(), 'minimaz-local-server-never-exists-b')
                // Keep the pending check alive so it fires after close().
                const clearSpy = vi
                    .spyOn(globalThis, 'clearTimeout')
                    .mockImplementation(() => undefined)

                controller = createLiveReload(served)
                const statCallsAfterCreate = vi.mocked(statSync).mock.calls.length
                controller.close()
                vi.advanceTimersByTime(20_000)
                clearSpy.mockRestore()

                expect(vi.mocked(statSync).mock.calls.length).toBe(statCallsAfterCreate)
            })
        })

        it('closes every watcher it created and arms no new one after close()', async () => {
            root = await mkdtemp(join(tmpdir(), 'minimaz-local-server-leak-'))
            const served = join(root, 'out')
            await mkdir(served)

            const createdBefore = watcherState.created.length
            controller = createLiveReload(served)

            // Lose the directory so a re-arm is pending, then shut down.
            await rm(served, { recursive: true, force: true })
            await sleep(300)
            controller.close()
            controller = undefined
            const watchCallsAtClose = vi.mocked(watch).mock.calls.length

            await mkdir(served)
            await sleep(2500)

            expect(vi.mocked(watch).mock.calls.length).toBe(watchCallsAtClose)
            const ours = watcherState.created.slice(createdBefore)
            expect(ours.length).toBeGreaterThan(0)
            for (const watcher of ours) {
                expect(watcherState.closed.has(watcher)).toBe(true)
            }
        })
    })
})
