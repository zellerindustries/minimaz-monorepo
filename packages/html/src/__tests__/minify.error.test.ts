import { describe, expect, it, vi } from 'vitest'
import { minify } from 'html-minifier-terser'
import { minifyHtml } from '../minify.js'

vi.mock('html-minifier-terser', () => ({
    minify: vi.fn(() => Promise.reject(new Error('boom'))),
}))

describe('minifyHtml failure', () => {
    it('throws with the original error as cause instead of returning unminified input', async () => {
        const error: unknown = await minifyHtml('<p>x</p>').catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('minifyHtml: failed to minify HTML: boom')
        expect(((error as Error).cause as Error).message).toBe('boom')
    })

    it('stringifies a non-Error rejection into the message', async () => {
        vi.mocked(minify).mockRejectedValueOnce('plain failure')

        const error: unknown = await minifyHtml('<p>x</p>').catch((caught: unknown) => caught)

        expect((error as Error).message).toBe('minifyHtml: failed to minify HTML: plain failure')
        expect((error as Error).cause).toBe('plain failure')
    })
})
