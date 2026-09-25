import { describe, expect, it, vi } from 'vitest'
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
})
