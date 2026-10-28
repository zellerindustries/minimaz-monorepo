import { afterEach, describe, expect, it, vi } from 'vitest'
import { minifyJs } from '../minify.js'
import type { MinifyOptions } from '../minify.js'
import type * as PrintModuleNs from '../print.js'
import type * as RenameModuleNs from '../rename.js'

type PrintModule = typeof PrintModuleNs
type RenameModule = typeof RenameModuleNs

const failures = vi.hoisted(() => ({ rename: null as Error | null, print: null as Error | null }))

vi.mock('../rename.js', async (importOriginal) => {
    const original = await importOriginal<RenameModule>()
    return {
        ...original,
        rename: (...args: Parameters<typeof original.rename>): void => {
            if (failures.rename !== null) {
                throw failures.rename
            }
            original.rename(...args)
        },
    }
})

vi.mock('../print.js', async (importOriginal) => {
    const original = await importOriginal<PrintModule>()
    return {
        ...original,
        print: (...args: Parameters<typeof original.print>): string => {
            if (failures.print !== null) {
                throw failures.print
            }
            return original.print(...args)
        },
    }
})

afterEach(() => {
    failures.rename = null
    failures.print = null
})

describe('minifyJs error handling', () => {
    it('propagates an error that is not a parse or scope error instead of falling back', () => {
        failures.rename = new TypeError('renamer bug')
        expect(() => minifyJs('function f(a) { return a }')).toThrow(new TypeError('renamer bug'))
    })

    it('does not reach the failing step with mangle: false', () => {
        failures.rename = new TypeError('renamer bug')
        expect(minifyJs('function f(a) { return a }', { mangle: false })).toBe(
            'function f(a){return a}',
        )
    })

    it('propagates a RangeError that is not a stack overflow', () => {
        failures.print = new RangeError('Invalid array length')
        expect(() => minifyJs('x = 1')).toThrow(new RangeError('Invalid array length'))
    })

    it('falls back on a stack overflow', () => {
        failures.print = new RangeError('Maximum call stack size exceeded')
        expect(minifyJs('x = 1\ny = 2')).toBe('x=1\ny=2')
    })

    it('treats null options like no options', () => {
        expect(
            minifyJs('function f(value) { return value }', null as unknown as MinifyOptions),
        ).toBe('function f(a){return a}')
    })
})
