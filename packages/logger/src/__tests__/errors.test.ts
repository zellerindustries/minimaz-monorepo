import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { KnownError, handleCliError } from '../errors.js'
import { log } from '../main.js'

describe('handleCliError', () => {
    let errorSpy: MockInstance<typeof log.error>
    let originalExitCode: number | null | undefined
    let originalDebug: string | undefined
    let originalVerbose: string | undefined

    beforeEach(() => {
        originalVerbose = process.env['VERBOSE']
        delete process.env['VERBOSE']
        errorSpy = vi.spyOn(log, 'error').mockImplementation(() => undefined)
        originalExitCode = process.exitCode as number | null | undefined
        process.exitCode = undefined
        originalDebug = process.env['DEBUG']
        delete process.env['DEBUG']
    })

    afterEach(() => {
        errorSpy.mockRestore()
        process.exitCode = originalExitCode
        if (originalDebug === undefined) {
            delete process.env['DEBUG']
        } else {
            process.env['DEBUG'] = originalDebug
        }
        if (originalVerbose === undefined) {
            delete process.env['VERBOSE']
        } else {
            process.env['VERBOSE'] = originalVerbose
        }
    })

    it('logs only the message for a KnownError', () => {
        handleCliError(new KnownError('missing config file'))

        expect(errorSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy).toHaveBeenCalledWith('missing config file')
        expect(process.exitCode).toBe(1)
    })

    it('logs each detail line for a KnownError carrying an errors array', () => {
        class WithDetails extends KnownError {
            errors = ['bad field a', 'bad field b']
        }

        handleCliError(new WithDetails('validation failed'))

        expect(errorSpy).toHaveBeenNthCalledWith(1, 'validation failed')
        expect(errorSpy).toHaveBeenNthCalledWith(2, '\t-> bad field a')
        expect(errorSpy).toHaveBeenNthCalledWith(3, '\t-> bad field b')
        expect(process.exitCode).toBe(1)
    })

    it('logs only the message and a bug-report hint for a plain Error by default', () => {
        const error = new Error('boom')

        handleCliError(error)

        expect(errorSpy).toHaveBeenCalledWith([
            'boom',
            'This looks like a bug — please report it.',
            'Re-run with --verbose (or DEBUG=true) for a stack trace.',
        ])
        expect(process.exitCode).toBe(1)
    })

    it('logs the stack trace when VERBOSE=true', () => {
        process.env['VERBOSE'] = 'true'
        const error = new Error('boom')

        handleCliError(error)

        expect(errorSpy).toHaveBeenCalledWith([
            error.stack,
            'This looks like a bug — please report it.',
        ])
        expect(process.exitCode).toBe(1)
    })

    it('logs the stack trace instead of just the message when DEBUG=true', () => {
        process.env['DEBUG'] = 'true'
        const error = new Error('boom')

        handleCliError(error)

        expect(errorSpy).toHaveBeenCalledWith([
            error.stack,
            'This looks like a bug — please report it.',
        ])
        expect(process.exitCode).toBe(1)
    })

    it('logs each detail line for a plain Error carrying an errors array', () => {
        const error = Object.assign(new Error('validation failed'), {
            errors: ['bad field a', 'bad field b'],
        })

        handleCliError(error)

        expect(errorSpy).toHaveBeenNthCalledWith(1, [
            'validation failed',
            'This looks like a bug — please report it.',
            'Re-run with --verbose (or DEBUG=true) for a stack trace.',
        ])
        expect(errorSpy).toHaveBeenNthCalledWith(2, '\t-> bad field a')
        expect(errorSpy).toHaveBeenNthCalledWith(3, '\t-> bad field b')
        expect(process.exitCode).toBe(1)
    })

    it('logs the stringified value and a bug-report hint for a non-Error throw', () => {
        handleCliError('boom')

        expect(errorSpy).toHaveBeenCalledWith(['boom', 'This looks like a bug — please report it.'])
        expect(process.exitCode).toBe(1)
    })
})
