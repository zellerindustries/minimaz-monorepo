import { afterEach, describe, expect, it, vi } from 'vitest'
import { emit, formatContext, formatTs, isVerbose, normalize, prefix, print, ts } from '../core.js'

const originalVerbose = process.env['VERBOSE']

afterEach(() => {
    if (originalVerbose === undefined) {
        delete process.env['VERBOSE']
    } else {
        process.env['VERBOSE'] = originalVerbose
    }
})

describe('formatTs', () => {
    it('zero-pads every field', () => {
        expect(formatTs(new Date(2024, 0, 5, 3, 4, 5))).toBe('2024-01-05 03:04:05')
    })

    it('leaves two-digit fields as they are', () => {
        expect(formatTs(new Date(2024, 11, 25, 13, 45, 59))).toBe('2024-12-25 13:45:59')
    })
})

describe('isVerbose', () => {
    it('is true only for the exact string "true"', () => {
        process.env['VERBOSE'] = 'true'
        expect(isVerbose()).toBe(true)

        process.env['VERBOSE'] = '1'
        expect(isVerbose()).toBe(false)

        delete process.env['VERBOSE']
        expect(isVerbose()).toBe(false)
    })
})

describe('normalize', () => {
    it('wraps a single message and passes an array through', () => {
        expect(normalize('a')).toEqual(['a'])
        expect(normalize(['a', 'b'])).toEqual(['a', 'b'])
    })
})

describe('formatContext', () => {
    it('wraps the context in cyan with a trailing space', () => {
        expect(formatContext('ctx')).toBe('\x1b[36m[ctx]\x1b[0m ')
    })
})

describe('print', () => {
    it('routes errors to console.error, warnings to console.warn, the rest to console.log', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

        print('error', 'e', 'ctx')
        print('warn', 'w', 'ctx')
        print('success', 's', 'ctx')

        expect(errorSpy).toHaveBeenCalledWith(`${prefix.error}${formatContext('ctx')}e`)
        expect(warnSpy).toHaveBeenCalledWith(`${prefix.warn}${formatContext('ctx')}w`)
        expect(logSpy).toHaveBeenCalledWith(`${prefix.success}${formatContext('ctx')}s`)
    })
})

describe('ts', () => {
    it('is empty unless verbose', () => {
        process.env['VERBOSE'] = 'false'
        expect(ts()).toBe('')
    })

    it('is a bracketed timestamp when verbose', () => {
        process.env['VERBOSE'] = 'true'
        expect(ts()).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] $/)
    })
})

describe('emit', () => {
    it('prints one line per message', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

        emit('info', ['a', 'b'], 'ctx')

        expect(logSpy).toHaveBeenCalledTimes(2)
    })

    it('suppresses verbose-only output unless verbose', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

        process.env['VERBOSE'] = 'false'
        emit('debug', 'x', 'ctx', false, true)
        expect(logSpy).not.toHaveBeenCalled()

        process.env['VERBOSE'] = 'true'
        emit('debug', 'x', 'ctx', false, true)
        expect(logSpy).toHaveBeenCalledTimes(1)
    })

    it('prints a plain [context] line without a prefix', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

        process.env['VERBOSE'] = 'false'
        emit('info', 'x', 'ctx', true)

        expect(logSpy).toHaveBeenCalledWith('[ctx] x')
    })

    it('adds a timestamp to plain lines when verbose', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

        process.env['VERBOSE'] = 'true'
        emit('info', 'x', 'ctx', true)

        expect(String(logSpy.mock.calls[0]?.[0])).toMatch(
            /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[ctx\] x$/,
        )
    })
})
