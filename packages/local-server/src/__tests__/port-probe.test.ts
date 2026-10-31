import { EventEmitter } from 'node:events'
import { createConnection } from 'node:net'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertPortFree } from '../port-probe.js'
import type { Socket } from 'node:net'

vi.mock('node:net', () => ({ createConnection: vi.fn() }))

class FakeSocket extends EventEmitter {
    destroyed = false

    destroy(): this {
        this.destroyed = true
        return this
    }
}

describe('assertPortFree', () => {
    let sockets: FakeSocket[]

    beforeEach(() => {
        vi.useFakeTimers()
        sockets = []
        vi.mocked(createConnection).mockImplementation(() => {
            const socket = new FakeSocket()
            sockets.push(socket)
            return socket as unknown as Socket
        })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    function probedHosts(): unknown[] {
        return vi
            .mocked(createConnection)
            .mock.calls.map((call) => (call[0] as unknown as { host: string }).host)
    }

    it('resolves once the probe times out with no answer, destroying the sockets', async () => {
        const pending = assertPortFree('127.0.0.1', 5000)
        await vi.advanceTimersByTimeAsync(500)

        await expect(pending).resolves.toBeUndefined()
        expect(sockets).toHaveLength(2)
        expect(sockets.every((socket) => socket.destroyed)).toBe(true)
    })

    it('does not resolve before the probe timeout elapses', async () => {
        let settled = false
        const pending = assertPortFree('127.0.0.1', 5000).then(() => {
            settled = true
        })
        await vi.advanceTimersByTimeAsync(499)
        expect(settled).toBe(false)

        await vi.advanceTimersByTimeAsync(1)
        await pending
        expect(settled).toBe(true)
    })

    it('rejects with the port-in-use KnownError when a probe connects', async () => {
        const pending = assertPortFree('127.0.0.1', 5001).catch((caught: unknown) => caught)
        sockets[0]?.emit('connect')
        sockets[1]?.emit('error', new Error('ECONNREFUSED'))

        const error = await pending
        expect(error).toBeInstanceOf(KnownError)
        expect((error as KnownError).message).toBe('Port 5001 is already in use')
    })

    it('treats a connection error as nothing listening', async () => {
        const pending = assertPortFree('127.0.0.1', 5002)
        for (const socket of sockets) {
            socket.emit('error', new Error('ECONNREFUSED'))
        }

        await expect(pending).resolves.toBeUndefined()
    })

    it.each(['0.0.0.0', '::'])(
        'probes only loopback addresses for wildcard host %s',
        async (host) => {
            const pending = assertPortFree(host, 5003)
            await vi.advanceTimersByTimeAsync(500)
            await pending

            expect(probedHosts()).toEqual(['127.0.0.1', '::1'])
        },
    )

    it('also probes a specific non-loopback host', async () => {
        const pending = assertPortFree('192.168.1.10', 5004)
        await vi.advanceTimersByTimeAsync(500)
        await pending

        expect(probedHosts()).toEqual(['127.0.0.1', '::1', '192.168.1.10'])
    })

    it('swallows a late socket error after the probe has finished', async () => {
        const pending = assertPortFree('127.0.0.1', 5005)
        await vi.advanceTimersByTimeAsync(500)
        await pending

        expect(() => sockets[0]?.emit('error', new Error('ECONNRESET'))).not.toThrow()
    })
})
