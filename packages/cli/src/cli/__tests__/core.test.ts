import { afterEach, describe, expect, it } from 'vitest'
import { executeCommand, initEnv, parseArgs, parseBooleanFlag } from '../core.js'

describe('parseArgs', () => {
    it('separates positionals from --flag=value, --flag value and bare flags', () => {
        expect(parseArgs(['init', 'site', '--npm', '--template=blog', '-t', 'x'])).toEqual({
            _: ['init', 'site'],
            npm: true,
            template: 'blog',
            t: 'x',
        })
    })

    it('lowercases flag names but keeps values as given', () => {
        expect(parseArgs(['--Path=/Dir/File.CSS'])).toEqual({ _: [], path: '/Dir/File.CSS' })
    })

    it('treats a flag followed by another flag as boolean', () => {
        expect(parseArgs(['--list', '--verbose'])).toEqual({ _: [], list: true, verbose: true })
    })

    it('consumes the next argument as a space-separated value', () => {
        expect(parseArgs(['--path', 'a.css', 'build'])).toEqual({ _: ['build'], path: 'a.css' })
    })

    it('keeps everything after the first = as the value', () => {
        expect(parseArgs(['--replace=a=b'])).toEqual({ _: [], replace: 'a=b' })
    })
})

describe('parseBooleanFlag', () => {
    it('returns undefined when the flag is absent', () => {
        expect(parseBooleanFlag()).toBeUndefined()
    })

    it('passes booleans through', () => {
        expect(parseBooleanFlag(true)).toBe(true)
        expect(parseBooleanFlag(false)).toBe(false)
    })

    it('treats false, 0 and n (any case) as false and any other string as true', () => {
        for (const value of ['false', 'FALSE', '0', 'n', 'N']) {
            expect(parseBooleanFlag(value)).toBe(false)
        }
        for (const value of ['true', 'yes', '1', '']) {
            expect(parseBooleanFlag(value)).toBe(true)
        }
    })
})

describe('initEnv', () => {
    const originalVerbose = process.env['VERBOSE']
    const originalWorkdir = process.env['CLI_WORKDIR']

    afterEach(() => {
        if (originalVerbose === undefined) {
            delete process.env['VERBOSE']
        } else {
            process.env['VERBOSE'] = originalVerbose
        }
        if (originalWorkdir === undefined) {
            delete process.env['CLI_WORKDIR']
        } else {
            process.env['CLI_WORKDIR'] = originalWorkdir
        }
    })

    it('sets VERBOSE and CLI_WORKDIR', () => {
        initEnv(true)
        expect(process.env['VERBOSE']).toBe('true')
        expect(process.env['CLI_WORKDIR']).toBe(process.cwd())

        initEnv()
        expect(process.env['VERBOSE']).toBe('false')
    })
})

describe('executeCommand', () => {
    it('resolves when the process exits with code 0', async () => {
        await expect(
            executeCommand(process.execPath, ['-e', 'process.exit(0)'], process.cwd()),
        ).resolves.toBeUndefined()
    })

    it('rejects with the exit code otherwise', async () => {
        await expect(
            executeCommand(process.execPath, ['-e', 'process.exit(3)'], process.cwd()),
        ).rejects.toThrow(`${process.execPath} exited with code 3`)
    })

    // Guards the cross-spawn dependency: plain child_process.spawn can't run npm's .cmd shim on Windows.
    it.runIf(process.platform === 'win32')('runs a Windows .cmd shim such as npm', async () => {
        await expect(executeCommand('npm', ['--version'], process.cwd())).resolves.toBeUndefined()
    })

    it('rejects when the command does not exist', async () => {
        await expect(
            executeCommand('minimaz-definitely-not-a-command', [], process.cwd()),
        ).rejects.toThrow()
    })
})
