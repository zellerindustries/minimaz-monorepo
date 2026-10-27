import { resolve } from 'node:path'
import { log } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    build,
    buildDocs,
    clear,
    config,
    docsInit,
    help,
    init,
    resolveDocsCommand,
    serve,
    template,
    validate,
    version,
} from '../../commands/index.js'
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
    serve: vi.fn(() => Promise.resolve()),
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
    const originalDebug = process.env['DEBUG']

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
        if (originalDebug === undefined) {
            delete process.env['DEBUG']
        } else {
            process.env['DEBUG'] = originalDebug
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

    it('dispatches single-letter aliases to the same handlers', async () => {
        await run('b')
        await run('c')
        await run('i')
        await run('t')

        expect(build).toHaveBeenCalledWith(process.cwd())
        expect(clear).toHaveBeenCalledWith(process.cwd())
        expect(init).toHaveBeenCalledWith(
            'minimaz-project',
            { template: 'default' },
            resolve(process.cwd(), 'minimaz-project'),
            'TEMPLATES',
        )
        expect(template).toHaveBeenCalledWith('GLOBAL', 'TEMPLATES', { list: false }, process.cwd())
    })

    it('logs the bug-report and re-run hints for an unexpected error when verbose is off', async () => {
        delete process.env['DEBUG']
        const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => undefined)
        vi.mocked(build).mockRejectedValueOnce(new Error('boom'))

        await run('build')

        expect(errorSpy).toHaveBeenCalledWith([
            'boom',
            'This looks like a bug — please report it.',
            'Re-run with --verbose (or DEBUG=true) for a stack trace.',
        ])
        expect(process.exitCode).toBe(1)
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

    it.each([
        [['-l'], { list: true }],
        [['--list=yes'], { list: false }],
        [['-d'], { list: false }],
        [['--delete=a', '-d', 'b'], { list: false, delete: 'a' }],
        [['-u'], { list: false, update: true }],
        [['-u', 'site'], { list: false, update: 'site' }],
        [['--update', '-u', 'site'], { list: false, update: 'site' }],
        [['--update=a', '-u', 'b'], { list: false, update: 'a' }],
    ])('resolves template alias flags %j to %j', async (flags, options) => {
        await run('template', ...flags)

        expect(template).toHaveBeenCalledWith('GLOBAL', 'TEMPLATES', options, process.cwd())
    })

    it.each([
        [['-t'], 'default'],
        [['-t', 'blog'], 'blog'],
        [['--template=blog', '-t', 'docs'], 'blog'],
        [['--template', '-t', 'docs'], 'docs'],
    ])('resolves init template alias flags %j to %j', async (flags, templateName) => {
        await run('init', ...flags)

        expect(init).toHaveBeenCalledWith(
            'minimaz-project',
            { template: templateName },
            resolve(process.cwd(), 'minimaz-project'),
            'TEMPLATES',
        )
    })

    it('passes an empty path to validate for a bare --path flag', async () => {
        await run('validate', '--path')

        expect(validate).toHaveBeenCalledWith('')
    })

    it('shows help for -h and sets VERBOSE for -v', async () => {
        await run('build', '-h')
        expect(help).toHaveBeenCalledWith(undefined)
        expect(build).not.toHaveBeenCalled()

        await run('build', '-v')
        expect(process.env['VERBOSE']).toBe('true')
        expect(build).toHaveBeenCalledOnce()
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

    it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
        'treats inherited Object property "%s" as an unknown command',
        async (name) => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

            await run(name)

            expect(process.exitCode).toBe(1)
            expect(String(errorSpy.mock.calls[0]?.[0])).toContain(`Unknown command "${name}"`)
        },
    )

    it('routes the "t" alias with -l like the full template command', async () => {
        await run('t', '-l')

        expect(template).toHaveBeenCalledWith('GLOBAL', 'TEMPLATES', { list: true }, process.cwd())
    })

    it('never treats a bare -t flag as a command', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        await run('-t', 'x')

        expect(template).not.toHaveBeenCalled()
        expect(process.exitCode).toBe(1)
        expect(String(errorSpy.mock.calls[0]?.[0])).toContain('Unknown command')
    })

    it('uses -t as the init template flag after the command', async () => {
        await run('init', '-t', 'blog')

        expect(init).toHaveBeenCalledWith(
            'minimaz-project',
            { template: 'blog' },
            resolve(process.cwd(), 'minimaz-project'),
            'TEMPLATES',
        )
    })

    it.each(['version', 'v'])('passes the package path to version for "%s"', async (name) => {
        await run(name)

        expect(version).toHaveBeenCalledWith('package.json')
    })

    it('shows general help for the "h" command', async () => {
        await run('h')

        expect(help).toHaveBeenCalledWith()
        expect(process.exitCode).not.toBe(1)
    })

    it('serves the working directory', async () => {
        await run('serve')

        expect(serve).toHaveBeenCalledWith(process.cwd())
    })

    it('runs docsInit for "docs init" and buildDocs otherwise', async () => {
        vi.mocked(resolveDocsCommand).mockReturnValueOnce('init')
        await run('docs', 'init')

        expect(resolveDocsCommand).toHaveBeenCalledWith('init')
        expect(docsInit).toHaveBeenCalledWith(process.cwd())
        expect(buildDocs).not.toHaveBeenCalled()

        await run('docs', 'build')

        expect(resolveDocsCommand).toHaveBeenLastCalledWith('build')
        expect(docsInit).toHaveBeenCalledOnce()
        expect(buildDocs).toHaveBeenCalledOnce()
        expect(buildDocs).toHaveBeenCalledWith(process.cwd())
    })

    it('passes --gitprovider through to init', async () => {
        await run('init', 'site', '--git', '--gitprovider=github')

        expect(init).toHaveBeenCalledWith(
            'site',
            { template: 'default', git: true, gitprovider: 'github' },
            resolve(process.cwd(), 'site'),
            'TEMPLATES',
        )
    })

    it('resolves the template source path from the positional argument', async () => {
        await run('template', 'my-template', '--delete=old', '-u', 'site')

        expect(template).toHaveBeenCalledWith(
            'GLOBAL',
            'TEMPLATES',
            { list: false, delete: 'old', update: 'site' },
            resolve(process.cwd(), 'my-template'),
        )
    })

    it('sets VERBOSE for --verbose and clears it otherwise', async () => {
        await run('build', '--verbose')
        expect(process.env['VERBOSE']).toBe('true')

        await run('build')
        expect(process.env['VERBOSE']).toBe('false')
    })

    it.each([
        ['a string', 'plain failure', 'plain failure'],
        ['a number', 42, '42'],
        ['an object', { code: 7 }, '[object Object]'],
    ])(
        'exits non-zero and logs the message when a handler rejects with %s',
        async (_label, rejection, message) => {
            delete process.env['DEBUG']
            const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => undefined)
            vi.mocked(build).mockRejectedValueOnce(rejection)

            await run('build')

            expect(errorSpy).toHaveBeenCalledWith([
                message,
                'This looks like a bug — please report it.',
            ])
            expect(process.exitCode).toBe(1)
        },
    )

    it('exits non-zero when the version handler rejects with a non-Error', async () => {
        const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => undefined)
        vi.mocked(version).mockRejectedValueOnce('nope')

        await run('version')

        expect(errorSpy).toHaveBeenCalledWith(['nope', 'This looks like a bug — please report it.'])
        expect(process.exitCode).toBe(1)
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

        it('stringifies a non-Error bootstrap failure in the skip warning', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
            vi.mocked(config).mockRejectedValueOnce('disk full')

            await expect(run()).resolves.toBeUndefined()

            expect(process.exitCode).not.toBe(1)
            expect(String(warnSpy.mock.calls[0]?.[0])).toContain('Post install skipped: disk full')
        })

        it('runs a normal command when arguments are given', async () => {
            await run('build')

            expect(build).toHaveBeenCalled()
            expect(config).not.toHaveBeenCalled()
        })
    })
})
