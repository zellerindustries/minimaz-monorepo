import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { KnownError } from '@minimaz/errors'
import { createLogger } from '@minimaz/logger'
import { createLiveReload, injectReloadScript } from './live-reload.js'
import type { LiveReloadController } from './live-reload.js'
import { resolveMimeType } from './mime.js'
import { resolveStaticFile } from './static-handler.js'
import type { LocalServerHandle, LocalServerOptions } from './types.js'

const log = createLogger('local-server')

const liveReloadEndpoint = '/__minimaz-live-reload'

/**
 * Verifies `dir` exists and is a directory, throwing a `KnownError` otherwise.
 *
 * @param {string} dir - The directory to check
 * @returns {Promise<void>} Resolves when `dir` is confirmed servable
 */
async function assertServableDirectory(dir: string): Promise<void> {
    let stats
    try {
        stats = await stat(dir)
    } catch {
        throw new KnownError(`Cannot serve "${dir}": directory does not exist`)
    }

    if (!stats.isDirectory()) {
        throw new KnownError(`Cannot serve "${dir}": not a directory`)
    }
}

/**
 * Handles a single HTTP request: routes the live-reload SSE endpoint, then
 * falls back to static file resolution and serving.
 *
 * @param {IncomingMessage} req - The incoming request
 * @param {ServerResponse} res - The response to write to
 * @param {string} dir - The directory being served
 * @param {LiveReloadController | undefined} liveReload - The live-reload
 *   controller, when enabled
 * @returns {Promise<void>} Resolves once the response has been sent
 */
async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    dir: string,
    liveReload: LiveReloadController | undefined,
): Promise<void> {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname

    if (liveReload !== undefined && pathname === liveReloadEndpoint) {
        liveReload.handleSseRequest(res)
        return
    }

    const resolution = await resolveStaticFile(dir, pathname)

    if (resolution.status === 403) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Forbidden')
        return
    }

    if (resolution.status === 404) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Not Found')
        return
    }

    const contentType = resolveMimeType(resolution.filePath)
    const contents = await readFile(resolution.filePath)

    if (liveReload !== undefined && contentType.startsWith('text/html')) {
        res.writeHead(200, { 'content-type': contentType })
        res.end(injectReloadScript(contents.toString('utf8')))
        return
    }

    res.writeHead(200, { 'content-type': contentType })
    res.end(contents)
}

/**
 * Starts a lightweight local HTTP server for `options.dir`, optionally
 * with live reload over Server-Sent Events.
 *
 * @param {LocalServerOptions} options - The server's configuration
 * @returns {Promise<LocalServerHandle>} The running server's handle
 */
export async function startLocalServer(options: LocalServerOptions): Promise<LocalServerHandle> {
    const dir = options.dir
    const host = options.host ?? '127.0.0.1'
    const liveReloadEnabled = options.liveReload ?? true
    const requestedPort = options.port ?? 0

    await assertServableDirectory(dir)

    const liveReload = liveReloadEnabled ? createLiveReload(dir) : undefined

    const server: Server = createServer((req, res) => {
        handleRequest(req, res, dir, liveReload).catch((error: unknown) => {
            log.error(error instanceof Error ? error.message : String(error))
            if (!res.headersSent) {
                res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
            }
            res.end('Internal Server Error')
        })
    })

    await new Promise<void>((resolvePromise, rejectPromise) => {
        server.once('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'EADDRINUSE') {
                rejectPromise(new KnownError(`Port ${String(requestedPort)} is already in use`))
                return
            }
            rejectPromise(error)
        })
        server.listen(requestedPort, host, () => {
            resolvePromise()
        })
    })

    const address = server.address()
    if (address === null || typeof address === 'string') {
        throw new Error('Failed to resolve local server address')
    }

    const port = address.port
    const url = `http://${host}:${String(port)}`

    log.info(`Serving ${dir} at ${url}`)

    let closed = false

    return {
        url,
        port,
        async close(): Promise<void> {
            if (closed) {
                return
            }
            closed = true
            liveReload?.close()
            await new Promise<void>((resolveClose, rejectClose) => {
                server.close((error) => {
                    if (error) {
                        rejectClose(error)
                        return
                    }
                    resolveClose()
                })
            })
        },
    }
}
