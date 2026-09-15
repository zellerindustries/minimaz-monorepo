import { watch } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { createLogger } from '@minimaz/logger'

const log = createLogger('local-server')

const liveReloadEndpoint = '/__minimaz-live-reload'

const reloadScript = `<script>new EventSource('${liveReloadEndpoint}').addEventListener('reload', () => location.reload())</script>`

const debounceMs = 100

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
    handleSseRequest(res: ServerResponse): void
    /**
     * Stops the file watcher and closes every connected SSE client.
     *
     * @returns {void}
     */
    close(): void
}

/**
 * Watches `dir` for filesystem changes and broadcasts a debounced `reload`
 * Server-Sent Event to every connected client.
 *
 * @param {string} dir - The directory to watch
 * @returns {LiveReloadController} The controller for handling SSE requests and shutdown
 */
export function createLiveReload(dir: string): LiveReloadController {
    const clients = new Set<ServerResponse>()
    let debounceTimer: NodeJS.Timeout | undefined
    let closed = false

    const broadcast = (): void => {
        for (const client of clients) {
            client.write('event: reload\ndata: reload\n\n')
        }
    }

    const watcher = watch(dir, { recursive: true }, () => {
        if (debounceTimer !== undefined) {
            clearTimeout(debounceTimer)
        }
        debounceTimer = setTimeout(broadcast, debounceMs)
    })

    watcher.on('error', (error: Error) => {
        log.warn(`Live reload stopped watching ${dir}: ${error.message}`)
    })

    return {
        handleSseRequest(res: ServerResponse): void {
            if (closed) {
                res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
                res.end('Live reload is shutting down')
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
            watcher.close()
            for (const client of clients) {
                client.end()
            }
            clients.clear()
        },
    }
}
