import { describe, expect, it, vi } from 'vitest'
import { minifyJs } from '../minify.js'

vi.mock('../rename.js', () => ({
    rename: (): never => {
        throw new TypeError('renamer bug')
    },
}))

describe('minifyJs error handling', () => {
    it('propagates an error that is not a parse or scope error instead of falling back', () => {
        expect(() => minifyJs('function f(a) { return a }')).toThrow(new TypeError('renamer bug'))
    })

    it('does not reach the failing step with mangle: false', () => {
        expect(minifyJs('function f(a) { return a }', { mangle: false })).toBe(
            'function f(a){return a}',
        )
    })
})
