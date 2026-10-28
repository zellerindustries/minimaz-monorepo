import { statSync, watch } from 'node:fs'
import { createLogger } from '@minimaz/logger'
import { writeText } from './http.js'

import type { FSWatcher } from 'node:fs'
import type { ServerResponse } from 'node:http'

const log = createLogger('local-server')

const liveReloadEndpoint = '/__minimaz-live-reload'

const reloadScript = `<script>new EventSource('${liveReloadEndpoint}').addEventListener('reload', () => location.reload())</script>`

const debounceMs = 100

// How often the armed watcher's directory is re-checked for replacement.
const identityPollMs = 500

const rearmBaseDelayMs = 100

const rearmMaxDelayMs = 5000

/**
 * Injects a small inline script that opens an `EventSource` against the
 * live-reload endpoint and reloads the page on a `reload` event.
 *
 * @param {string} html - The HTML document body to inject into
 * @returns {string} The HTML with the reload script inserted before
 *   `</body>`, or appended when there is no `</body>` tag
 */
export function injectReloadScript(html: string): string {
    if (html.includes('</body>')) {
        return html.replace('</body>', `${reloadScript}</body>`)
    }
    return `${html}${reloadScript}`
}

/**
 * Handles the live-reload SSE endpoint and watches a directory for changes.
 */
export interface LiveReloadController {
    /**
     * Registers `res` as an SSE client and keeps the connection open.
     *
     * @param {ServerResponse} res - The response to stream `reload` events into
     * @returns {void}
     */
    handleSseRequest: (res: ServerResponse) => void
    /**
     * Stops the file watcher and closes every connected SSE client.
     *
     * @returns {void}
     */
    close: () => void
}

/**
 * Reads `dir`'s identity (device, inode, birth time), or `undefined` when it
 * is missing or not a directory. A changed identity means `dir` was replaced
 * (e.g. `build`'s rename-into-place swap) — an `fs.watch` handle follows the
 * old directory, not the path, so it silently stops seeing changes.
 *
 * @param {string} dir - The directory to identify
 * @returns {string | undefined} An opaque identity key, or `undefined`
 */
function readDirectoryIdentity(dir: string): string | undefined {
    let stats
    try {
        stats = statSync(dir, { bigint: true, throwIfNoEntry: false })
    } catch {
        return undefined
    }
    if (stats?.isDirectory() !== true) {
        return undefined
    }
    return `${String(stats.dev)}:${String(stats.ino)}:${String(stats.birthtimeNs)}`
}

/**
 * Watches `dir` for filesystem changes and broadcasts a debounced `reload`
 * Server-Sent Event to every connected client. When `dir` disappears or is
 * replaced, or the watcher errors, the watcher is re-armed on `dir`'s path
 * with capped exponential backoff, and one `reload` is sent once it is.
 *
 * @param {string} dir - The directory to watch
 * @returns {LiveReloadController} The controller for handling SSE requests and shutdown
 */
export function createLiveReload(dir: string): LiveReloadController {
    const clients = new Set<ServerResponse>()
    let debounceTimer: NodeJS.Timeout | undefined
    let checkTimer: NodeJS.Timeout | undefined
    let watcher: FSWatcher | undefined
    let armedIdentity: string | undefined
    let rearmAttempt = 0
    let closed = false

    const broadcast = (): void => {
        for (const client of clients) {
            client.write('event: reload\ndata: reload\n\n')
        }
    }

    const scheduleBroadcast = (): void => {
        if (debounceTimer !== undefined) {
            clearTimeout(debounceTimer)
        }
        debounceTimer = setTimeout(broadcast, debounceMs)
    }

    const disarm = (): void => {
        const current = watcher
        watcher = undefined
        armedIdentity = undefined
        current?.close()
    }

    const scheduleCheck = (delayMs: number): void => {
        if (closed) {
            return
        }
        if (checkTimer !== undefined) {
            clearTimeout(checkTimer)
        }
        checkTimer = setTimeout(check, delayMs)
        checkTimer.unref()
    }

    const scheduleRearm = (): void => {
        const delayMs = Math.min(rearmBaseDelayMs * 2 ** rearmAttempt, rearmMaxDelayMs)
        rearmAttempt += 1
        scheduleCheck(delayMs)
    }

    const arm = (): boolean => {
        // Identity is read before watching: a swap in between then shows up
        // as a mismatch on the next check instead of going unnoticed.
        const identity = readDirectoryIdentity(dir)
        if (identity === undefined) {
            return false
        }

        let next: FSWatcher
        try {
            next = watch(dir, { recursive: true }, scheduleBroadcast)
        } catch (error: unknown) {
            log.debug(
                `Live reload could not watch ${dir}: ${error instanceof Error ? error.message : String(error)}`,
            )
            return false
        }

        next.on('error', (error: Error) => {
            if (watcher !== next) {
                return
            }
            log.warn(`Live reload lost its watch on ${dir} (${error.message}), re-arming`)
            disarm()
            scheduleRearm()
        })

        watcher = next
        armedIdentity = identity
        rearmAttempt = 0
        return true
    }

    function check(): void {
        checkTimer = undefined
        if (closed) {
            return
        }

        if (watcher !== undefined) {
            if (readDirectoryIdentity(dir) === armedIdentity) {
                scheduleCheck(identityPollMs)
                return
            }
            log.debug(`Live reload: ${dir} was removed or replaced, re-arming`)
            disarm()
        }

        if (arm()) {
            log.debug(`Live reload re-armed on ${dir}`)
            scheduleBroadcast()
            scheduleCheck(identityPollMs)
            return
        }
        scheduleRearm()
    }

    if (arm()) {
        scheduleCheck(identityPollMs)
    } else {
        log.warn(`Live reload could not watch ${dir} yet, retrying`)
        scheduleRearm()
    }

    return {
        handleSseRequest(res: ServerResponse): void {
            if (closed) {
                writeText(res, 503, 'Live reload is shutting down')
                return
            }

            res.writeHead(200, {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache',
                connection: 'keep-alive',
            })
            res.write('\n')
            clients.add(res)
            res.on('close', () => {
                clients.delete(res)
            })
            res.on('error', () => {
                clients.delete(res)
            })
        },
        close(): void {
            closed = true
            if (debounceTimer !== undefined) {
                clearTimeout(debounceTimer)
            }
            if (checkTimer !== undefined) {
                clearTimeout(checkTimer)
                checkTimer = undefined
            }
            disarm()
            for (const client of clients) {
                client.end()
            }
            clients.clear()
        },
    }
}
