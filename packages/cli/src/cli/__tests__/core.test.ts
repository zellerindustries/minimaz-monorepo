import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    askQuestion,
    envWithoutNpmConfig,
    executeCommand,
    initEnv,
    parseArgs,
    parseBooleanFlag,
} from '../core.js'

vi.mock('node:readline', () => ({ createInterface: vi.fn() }))

describe('askQuestion', () => {
    interface FakeInterface extends EventEmitter {
        question: ReturnType<typeof vi.fn>
        close: ReturnType<typeof vi.fn>
    }

    /** Builds a fake readline interface whose `question` callback the test drives manually. */
    function mockInterface(): FakeInterface {
        const rl = Object.assign(new EventEmitter(), {
            question: vi.fn(),
            close: vi.fn(),
        }) as FakeInterface
        vi.mocked(createInterface).mockReturnValue(
            rl as unknown as ReturnType<typeof createInterface>,
        )
        return rl
    }

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('resolves with the trimmed answer and closes the interface', async () => {
        const rl = mockInterface()
        rl.question.mockImplementation((_query: string, cb: (answer: string) => void) => {
            cb('  blog  ')
        })

        await expect(askQuestion('Template?', 'default')).resolves.toBe('blog')
        expect(rl.question).toHaveBeenCalledWith('[QUESTION] Template? ', expect.any(Function))
        expect(rl.close).toHaveBeenCalled()
    })

    it('falls back to the default answer on empty input', async () => {
        const rl = mockInterface()
        rl.question.mockImplementation((_query: string, cb: (answer: string) => void) => {
            cb('   ')
        })

        await expect(askQuestion('Template?', 'default')).resolves.toBe('default')
    })

    it('falls back to the default answer after the 60s timeout', async () => {
        vi.useFakeTimers()
        const rl = mockInterface()

        const answer = askQuestion('Template?', 'default')
        await vi.advanceTimersByTimeAsync(60000)

        await expect(answer).resolves.toBe('default')
        expect(rl.close).toHaveBeenCalled()
    })

    it('exits with code 130 on SIGINT', () => {
        const rl = mockInterface()
        const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

        void askQuestion('Template?')
        rl.emit('SIGINT')

        expect(rl.close).toHaveBeenCalled()
        expect(exit).toHaveBeenCalledWith(130)
    })
})

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

describe('envWithoutNpmConfig', () => {
    const keys = [
        'npm_config_registry',
        'npm_config_allow_scripts',
        'npm_config_allow-scripts',
        'NPM_CONFIG_ALLOW_SCRIPTS',
    ]

    afterEach(() => {
        for (const key of keys) {
            Reflect.deleteProperty(process.env, key)
        }
    })

    it('keeps unrelated npm_config_* vars and drops only allow-scripts spellings', () => {
        process.env['npm_config_registry'] = 'https://r.example'
        process.env['npm_config_allow_scripts'] = 'x'
        process.env['npm_config_allow-scripts'] = 'x'
        process.env['NPM_CONFIG_ALLOW_SCRIPTS'] = 'x'

        const env = envWithoutNpmConfig()

        expect(env['npm_config_registry']).toBe('https://r.example')
        expect(env['npm_config_allow_scripts']).toBeUndefined()
        expect(env['npm_config_allow-scripts']).toBeUndefined()
        expect(env['NPM_CONFIG_ALLOW_SCRIPTS']).toBeUndefined()
    })
})
