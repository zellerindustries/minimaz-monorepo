import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createLogger, KnownError } from '@minimaz/logger'
import { writeText } from './http.js'
import { createLiveReload, injectReloadScript } from './live-reload.js'
import { resolveMimeType } from './mime.js'
import { assertPortFree } from './port-probe.js'
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

/** A file's cached ETag, valid only while its `mtimeMs`/`size` still match. */
interface CachedEtag {
    mtimeMs: number
    size: number
    etag: string
}

/**
 * Computes a weak ETag over `contents`.
 *
 * @param {Buffer | string} contents - The exact bytes an ETag is needed for
 * @returns {string} The weak ETag
 */
function computeEtag(contents: Buffer | string): string {
    const hash = createHash('sha1').update(contents).digest('hex').slice(0, 16)
    return `W/"${hash}"`
}

/**
 * Writes `etag`'s `ETag`/`Cache-Control` headers and, when `req`'s
 * `if-none-match` header matches it exactly, writes a `304` and returns
 * `true` so the caller skips writing a body.
 *
 * @param {IncomingMessage} req - The incoming request
 * @param {ServerResponse} res - The response to write to
 * @param {string} etag - The ETag to apply, already matching the exact
 *   bytes being sent (post any transformation, e.g. live-reload injection)
 * @returns {boolean} Whether a `304` was written and the caller should stop
 */
function applyCacheHeaders(req: IncomingMessage, res: ServerResponse, etag: string): boolean {
    res.setHeader('etag', etag)
    res.setHeader('cache-control', 'no-cache')

    if (isNotModified(req, etag)) {
        res.writeHead(304)
        res.end()
        return true
    }

    return false
}

/**
 * Whether `req`'s `if-none-match` header matches `etag` exactly.
 *
 * @param {IncomingMessage} req - The incoming request
 * @param {string} etag - The ETag to compare against
 * @returns {boolean} Whether the client's cached copy is current
 */
function isNotModified(req: IncomingMessage, etag: string): boolean {
    return req.headers['if-none-match'] === etag
}

/**
 * Writes a `301` to `location`, carrying over `req`'s query string.
 *
 * @param {IncomingMessage} req - The incoming request
 * @param {ServerResponse} res - The response to write to
 * @param {string} location - The already percent-encoded redirect pathname
 * @returns {void}
 */
function writeRedirect(req: IncomingMessage, res: ServerResponse, location: string): void {
    const search = new URL(req.url ?? '/', 'http://localhost').search
    res.writeHead(301, { location: `${location}${search}` })
    res.end()
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
 * @param {Map<string, CachedEtag>} etagCache - Per-server cache of each
 *   file's last-computed ETag, keyed by file path and validated against
 *   the file's current `mtimeMs`/`size` — avoids re-hashing an unchanged
 *   file's full contents on every request
 * @returns {Promise<void>} Resolves once the response has been sent
 */
async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    dir: string,
    options: LocalServerOptions,
    liveReload: LiveReloadController | undefined,
    etagCache: Map<string, CachedEtag>,
): Promise<void> {
    const cleanUrls = options.cleanUrls ?? false
    const singlePageApp = options.singlePageApp ?? false
    const directoryListing = options.directoryListing ?? false
    const cacheControlEnabled = options.cacheControl ?? false

    const rawPathname = new URL(req.url ?? '/', 'http://localhost').pathname

    if (liveReload !== undefined && rawPathname === liveReloadEndpoint) {
        liveReload.handleSseRequest(res)
        return
    }

    let pathname: string
    try {
        pathname = decodeURIComponent(rawPathname)
    } catch {
        writeText(res, 400, 'Bad Request')
        return
    }

    const resolution = await resolveRequest(dir, pathname, {
        cleanUrls,
        singlePageApp,
        directoryListing,
    })

    if (resolution.kind === 'forbidden') {
        writeText(res, 403, 'Forbidden')
        return
    }

    if (resolution.kind === 'notFound') {
        writeText(res, 404, 'Not Found')
        return
    }

    if (resolution.kind === 'redirect') {
        writeRedirect(req, res, resolution.location)
        return
    }

    if (resolution.kind === 'listing') {
        if (resolution.redirectTo !== undefined) {
            writeRedirect(req, res, resolution.redirectTo)
            return
        }

        const html = renderDirectoryListing(pathname, resolution.entries)
        if (cacheControlEnabled && applyCacheHeaders(req, res, computeEtag(html))) {
            return
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(html)
        return
    }

    const contentType = resolveMimeType(resolution.filePath)
    const willInject = liveReload !== undefined && contentType.startsWith('text/html')

    // A cached ETag is only trustworthy for a response that isn't
    // transformed after being read — live-reload injection changes the
    // bytes sent, so an HTML file with live reload on always re-hashes.
    if (cacheControlEnabled && !willInject) {
        const fileStats = await stat(resolution.filePath).catch(() => undefined)
        const cached = fileStats === undefined ? undefined : etagCache.get(resolution.filePath)
        if (
            fileStats !== undefined &&
            cached?.mtimeMs === fileStats.mtimeMs &&
            cached.size === fileStats.size &&
            isNotModified(req, cached.etag) &&
            applyCacheHeaders(req, res, cached.etag)
        ) {
            return
        }
    }

    let contents: Buffer
    try {
        contents = await readFile(resolution.filePath)
    } catch (error: unknown) {
        const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
        if (code === 'ENOENT') {
            writeText(res, 404, 'Not Found')
            return
        }
        throw error
    }

    const body = willInject ? injectReloadScript(contents.toString('utf8')) : contents

    if (cacheControlEnabled) {
        const etag = computeEtag(body)
        if (!willInject) {
            const fileStats = await stat(resolution.filePath).catch(() => undefined)
            if (fileStats !== undefined) {
                etagCache.set(resolution.filePath, {
                    mtimeMs: fileStats.mtimeMs,
                    size: fileStats.size,
                    etag,
                })
            }
        }
        if (applyCacheHeaders(req, res, etag)) {
            return
        }
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
 * @throws {KnownError} When `options.dir` isn't a directory, or a non-zero
 *   `options.port` is already in use — on `host` itself or by a listener on
 *   all interfaces, which Windows doesn't report as `EADDRINUSE`
 */
export async function startLocalServer(options: LocalServerOptions): Promise<LocalServerHandle> {
    const dir = options.dir
    const host = options.host ?? '127.0.0.1'
    const liveReloadEnabled = options.liveReload ?? true
    const requestedPort = options.port ?? 0

    await assertServableDirectory(dir)

    if (requestedPort !== 0) {
        await assertPortFree(host, requestedPort)
    }

    const liveReload = liveReloadEnabled ? createLiveReload(dir) : undefined
    const etagCache = new Map<string, CachedEtag>()

    let port: number
    let url: string
    let server: Server

    try {
        server = createServer((req, res) => {
            handleRequest(req, res, dir, options, liveReload, etagCache).catch((error: unknown) => {
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
