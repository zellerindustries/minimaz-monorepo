import type { ServerResponse } from 'node:http'

/**
 * Writes a complete `text/plain; charset=utf-8` response.
 *
 * @param {ServerResponse} res - The response to write to
 * @param {number} status - The HTTP status code
 * @param {string} body - The plain-text body
 * @returns {void}
 */
export function writeText(res: ServerResponse, status: number, body: string): void {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(body)
}
