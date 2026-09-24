import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createLogger, KnownError } from '@minimaz/logger'
import { createLiveReload, injectReloadScript } from './live-reload.js'
import { resolveMimeType } from './mime.js'
import { renderDirectoryListing, resolveRequest } from './static-handler.js'

import type { LocalServerHandle, LocalServerOptions } from './types.js'
import type { LiveReloadController } from './live-reload.js'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

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
    } catch (error: unknown) {
        throw new KnownError(`Cannot serve "${dir}": directory does not exist`, { cause: error })
    }

    if (!stats.isDirectory()) {
        throw new KnownError(`Cannot serve "${dir}": not a directory`)
    }
}

/**
 * Computes a weak ETag over `contents` and, when `req`'s `if-none-match`
 * header matches it exactly, writes a `304` and returns `true` so the
 * caller skips writing a body.
 *
 * @param {IncomingMessage} req - The incoming request
 * @param {ServerResponse} res - The response to write to
 * @param {Buffer | string} contents - The exact bytes being sent, post any
 *   transformation (e.g. live-reload injection) — the ETag must match what
 *   the client actually receives
 * @returns {boolean} Whether a `304` was written and the caller should stop
 */
function applyCacheControl(
    req: IncomingMessage,
    res: ServerResponse,
    contents: Buffer | string,
): boolean {
    const hash = createHash('sha1').update(contents).digest('hex').slice(0, 16)
    const etag = `W/"${hash}"`

    res.setHeader('etag', etag)
    res.setHeader('cache-control', 'no-cache')

    if (req.headers['if-none-match'] === etag) {
        res.writeHead(304)
        res.end()
        return true
    }

    return false
}

/**
 * Handles a single HTTP request: routes the live-reload SSE endpoint, then
 * falls back to request resolution and serving (a file, a directory
 * listing, or a 403/404).
 *
 * @param {IncomingMessage} req - The incoming request
 * @param {ServerResponse} res - The response to write to
 * @param {string} dir - The directory being served
 * @param {LocalServerOptions} options - The server's configuration
 * @param {LiveReloadController | undefined} liveReload - The live-reload
 *   controller, when enabled
 * @returns {Promise<void>} Resolves once the response has been sent
 */
async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    dir: string,
    options: LocalServerOptions,
    liveReload: LiveReloadController | undefined,
): Promise<void> {
    const rawPathname = new URL(req.url ?? '/', 'http://localhost').pathname

    if (liveReload !== undefined && rawPathname === liveReloadEndpoint) {
        liveReload.handleSseRequest(res)
        return
    }

    let pathname: string
    try {
        pathname = decodeURIComponent(rawPathname)
    } catch {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Bad Request')
        return
    }

    const resolution = await resolveRequest(dir, pathname, {
        cleanUrls: options.cleanUrls ?? false,
        singlePageApp: options.singlePageApp ?? false,
        directoryListing: options.directoryListing ?? false,
    })

    if (resolution.kind === 'forbidden') {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Forbidden')
        return
    }

    if (resolution.kind === 'notFound') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Not Found')
        return
    }

    if (resolution.kind === 'listing') {
        const html = renderDirectoryListing(pathname, resolution.entries)
        if ((options.cacheControl ?? false) && applyCacheControl(req, res, html)) {
            return
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(html)
        return
    }

    const contentType = resolveMimeType(resolution.filePath)

    let contents: Buffer
    try {
        contents = await readFile(resolution.filePath)
    } catch (error: unknown) {
        const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
        if (code === 'ENOENT') {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('Not Found')
            return
        }
        throw error
    }

    const body =
        liveReload !== undefined && contentType.startsWith('text/html')
            ? injectReloadScript(contents.toString('utf8'))
            : contents

    if ((options.cacheControl ?? false) && applyCacheControl(req, res, body)) {
        return
    }

    res.writeHead(200, { 'content-type': contentType })
    res.end(body)
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

    let port: number
    let url: string
    let server: Server

    try {
        server = createServer((req, res) => {
            handleRequest(req, res, dir, options, liveReload).catch((error: unknown) => {
                log.error(error instanceof Error ? error.message : String(error))
                if (!res.headersSent) {
                    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
                }
                res.end('Internal Server Error')
            })
        })

        await new Promise<void>((resolvePromise, rejectPromise) => {
            const handleStartupError = (error: NodeJS.ErrnoException): void => {
                if (error.code === 'EADDRINUSE') {
                    rejectPromise(new KnownError(`Port ${String(requestedPort)} is already in use`))
                    return
                }
                rejectPromise(error)
            }
            server.once('error', handleStartupError)
            server.listen(requestedPort, host, () => {
                server.removeListener('error', handleStartupError)
                resolvePromise()
            })
        })

        server.on('error', (error: Error) => {
            log.error(error.message)
        })

        const address = server.address()
        if (address === null || typeof address === 'string') {
            throw new Error('Failed to resolve local server address')
        }

        port = address.port
        url = `http://${host}:${String(port)}`
    } catch (error) {
        liveReload?.close()
        throw error
    }

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
