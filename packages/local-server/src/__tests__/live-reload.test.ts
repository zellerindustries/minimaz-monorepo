import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveReload, injectReloadScript } from '../live-reload.js'
import type { LiveReloadController } from '../live-reload.js'
import type { ServerResponse } from 'node:http'

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
})
