import { createConnection } from 'node:net'
import { KnownError } from '@minimaz/logger'

const probeTimeoutMs = 500
const wildcardHosts = new Set(['0.0.0.0', '::'])

/**
 * Whether something accepts TCP connections on `host:port`. Any connection
 * error or a timeout counts as "nothing listening there".
 *
 * @param {string} host - The address to connect to
 * @param {number} port - The port to connect to
 * @returns {Promise<boolean>} Whether a connection was accepted
 */
async function isAcceptingConnections(host: string, port: number): Promise<boolean> {
    return await new Promise((resolve) => {
        const socket = createConnection({ host, port })
        const finish = (accepted: boolean): void => {
            clearTimeout(timer)
            socket.removeAllListeners()
            socket.on('error', () => undefined)
            socket.destroy()
            resolve(accepted)
        }
        const timer = setTimeout(() => {
            finish(false)
        }, probeTimeoutMs)
        socket.once('connect', () => {
            finish(true)
        })
        socket.once('error', () => {
            finish(false)
        })
    })
}

/**
 * Throws the "port in use" `KnownError` when anything already accepts
 * connections on `port`. `server.listen` alone misses this on Windows: a
 * listener bound to all interfaces (`0.0.0.0`/`::`) doesn't make a later
 * bind to `127.0.0.1`/`::1` fail with `EADDRINUSE`.
 *
 * @param {string} host - The host the server is about to bind
 * @param {number} port - The non-zero port the server is about to bind
 * @returns {Promise<void>} Resolves when no listener answered on any candidate address
 */
export async function assertPortFree(host: string, port: number): Promise<void> {
    const candidates = new Set(['127.0.0.1', '::1'])
    if (!wildcardHosts.has(host)) {
        candidates.add(host)
    }

    const results = await Promise.all(
        [...candidates].map(async (candidate) => await isAcceptingConnections(candidate, port)),
    )

    if (results.includes(true)) {
        throw new KnownError(`Port ${String(port)} is already in use`)
    }
}
