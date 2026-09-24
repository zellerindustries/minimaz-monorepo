import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLogger, log } from '../main.js'

const originalVerbose = process.env['VERBOSE']

beforeEach(() => {
    process.env['VERBOSE'] = 'false'
})

afterEach(() => {
    if (originalVerbose === undefined) {
        delete process.env['VERBOSE']
    } else {
        process.env['VERBOSE'] = originalVerbose
    }
})

describe('createLogger', () => {
    it('hides debug and verbose output unless VERBOSE is on', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        const logger = createLogger('unit')

        logger.debug('d')
        logger.verbose('v')
        expect(logSpy).not.toHaveBeenCalled()

        process.env['VERBOSE'] = 'true'
        logger.debug('d')
        logger.verbose('v')
        expect(logSpy).toHaveBeenCalledTimes(2)
    })

    it('prints default output as a plain [context] line', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

        createLogger('unit').default('hello')

        expect(logSpy).toHaveBeenCalledWith('[unit] hello')
    })

    it('routes each level to its console method with its label', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const logger = createLogger('unit')

        logger.info('i')
        logger.success('s')
        logger.warn('w')
        logger.error('e')

        const logged = logSpy.mock.calls.map((call) => String(call[0]))
        expect(logged[0]).toContain('INFO')
        expect(logged[1]).toContain('SUCCESS')
        expect(String(warnSpy.mock.calls[0]?.[0])).toContain('WARN')
        expect(String(errorSpy.mock.calls[0]?.[0])).toContain('ERROR')
        for (const line of [...logged, String(warnSpy.mock.calls[0]?.[0])]) {
            expect(line).toContain('[unit]')
        }
    })

    it('defaults the context to "app", as does the shared log instance', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

        createLogger().default('a')
        log.default('b')

        expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual(['[app] a', '[app] b'])
    })
})
