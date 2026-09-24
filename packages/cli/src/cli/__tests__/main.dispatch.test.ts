import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { build, clear, config, help, init, template, validate } from '../../commands/index.js'
import { runCli } from '../main.js'

vi.mock('../../commands/index.js', () => ({
    build: vi.fn(() => Promise.resolve()),
    buildDocs: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
    config: vi.fn(() => Promise.resolve()),
    docsInit: vi.fn(() => Promise.resolve()),
    help: vi.fn(),
    init: vi.fn(() => Promise.resolve()),
    resolveDocsCommand: vi.fn(() => 'build'),
    template: vi.fn(() => Promise.resolve()),
    validate: vi.fn(() => Promise.resolve()),
    version: vi.fn(() => Promise.resolve()),
}))

vi.mock('@minimaz/templates', () => ({
    getGlobalDir: vi.fn(() => 'GLOBAL'),
    getTemplatesDir: vi.fn(() => 'TEMPLATES'),
}))

describe('runCli dispatch', () => {
    const originalArgv = process.argv
    const originalExitCode = process.exitCode
    const originalVerbose = process.env['VERBOSE']
    const originalWorkdir = process.env['CLI_WORKDIR']
    const originalLifecycleEvent = process.env['npm_lifecycle_event']

    beforeEach(() => {
        delete process.env['npm_lifecycle_event']
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
        process.argv = originalArgv
        process.exitCode = originalExitCode
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
        if (originalLifecycleEvent === undefined) {
            delete process.env['npm_lifecycle_event']
        } else {
            process.env['npm_lifecycle_event'] = originalLifecycleEvent
        }
    })

    async function run(...args: string[]): Promise<void> {
        process.argv = ['node', 'main.js', ...args]
        await runCli('package.json')
    }

    it('runs build and clear in the working directory', async () => {
        await run('build')
        await run('clear')

        expect(build).toHaveBeenCalledWith(process.cwd())
        expect(clear).toHaveBeenCalledWith(process.cwd())
    })

    it('passes --path to validate, or an empty string without it', async () => {
        await run('validate', '--path=a.css')
        await run('validate')

        expect(validate).toHaveBeenNthCalledWith(1, 'a.css')
        expect(validate).toHaveBeenNthCalledWith(2, '')
    })

    it('shows help for a named command, and for --help', async () => {
        await run('help', 'build')
        await run('--help')

        expect(help).toHaveBeenNthCalledWith(1, 'build')
        expect(help).toHaveBeenNthCalledWith(2, undefined)
    })

    it('builds init options from flags', async () => {
        await run('init', 'site', '--template=blog', '--npm=false', '--git')

        expect(init).toHaveBeenCalledWith(
            'site',
            { template: 'blog', npm: false, git: true },
            resolve(process.cwd(), 'site'),
            'TEMPLATES',
        )
    })

    it('defaults the init project name and template, leaving npm/git to the prompts', async () => {
        await run('init')

        expect(init).toHaveBeenCalledWith(
            'minimaz-project',
            { template: 'default' },
            resolve(process.cwd(), 'minimaz-project'),
            'TEMPLATES',
        )
    })

    it.each([
        [['--list'], { list: true }],
        [['-d', 'old'], { list: false, delete: 'old' }],
        [['--update'], { list: false, update: true }],
        [['--update=site'], { list: false, update: 'site' }],
    ])('maps template flags %j to %j', async (flags, options) => {
        await run('template', ...flags)

        expect(template).toHaveBeenCalledWith('GLOBAL', 'TEMPLATES', options, process.cwd())
    })

    it('passes --overwrite to config', async () => {
        await run('config', '--overwrite')
        await run('config')

        expect(config).toHaveBeenNthCalledWith(1, 'GLOBAL', 'TEMPLATES', true)
        expect(config).toHaveBeenNthCalledWith(2, 'GLOBAL', 'TEMPLATES', false)
    })

    it('exits non-zero and shows help for an unknown command', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        await run('nope')

        expect(process.exitCode).toBe(1)
        expect(help).toHaveBeenCalledWith()
        expect(String(errorSpy.mock.calls[0]?.[0])).toContain('Unknown command "nope"')
    })

    describe('npm postinstall', () => {
        beforeEach(() => {
            process.env['npm_lifecycle_event'] = 'postinstall'
        })

        it('bootstraps the global directory without overwriting', async () => {
            await run()

            expect(config).toHaveBeenCalledWith('GLOBAL', 'TEMPLATES', false)
        })

        it('never fails the install when bootstrapping fails', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
            vi.mocked(config).mockRejectedValueOnce(new Error('EACCES'))

            await expect(run()).resolves.toBeUndefined()

            expect(process.exitCode).not.toBe(1)
            expect(String(warnSpy.mock.calls[0]?.[0])).toContain('Post install skipped: EACCES')
        })

        it('runs a normal command when arguments are given', async () => {
            await run('build')

            expect(build).toHaveBeenCalled()
            expect(config).not.toHaveBeenCalled()
        })
    })
})
