import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathExists } from '@minimaz/core'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askQuestion, executeCommand } from '../../../cli/index.js'
import { init } from '../main.js'

// Never prompts on stdin or runs a real npm/git process; main.test.ts covers
// the flag-driven (no prompt) paths against the real helpers.
vi.mock('../../../cli/index.js', () => ({
    executeCommand: vi.fn(() => Promise.resolve()),
    askQuestion: vi.fn(() => Promise.resolve('y')),
}))

describe('init prompts', () => {
    let root: string
    let templatesDir: string
    let targetDir: string

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'init-prompts-'))
        templatesDir = path.join(root, 'templates')
        await mkdir(path.join(templatesDir, 'simple'), { recursive: true })
        await writeFile(path.join(templatesDir, 'simple', 'index.html'), '<html></html>')
        targetDir = path.join(root, 'my-project')
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('asks about npm and git when neither flag is given, and runs both on "y"', async () => {
        await init(
            'my-project',
            { template: 'simple', gitprovider: 'local' },
            targetDir,
            templatesDir,
        )

        expect(askQuestion).toHaveBeenNthCalledWith(1, 'Init NPM? [Y/n]:', 'y')
        expect(askQuestion).toHaveBeenNthCalledWith(2, 'Init Git repository? [Y/n]:', 'y')
        expect(executeCommand).toHaveBeenCalledWith('npm', ['i'], targetDir)
        expect(executeCommand).toHaveBeenCalledWith('git', ['init'], targetDir)
        expect(await pathExists(path.join(targetDir, 'package.json'))).toBe(true)
        expect(await pathExists(path.join(targetDir, '.gitignore'))).toBe(true)
    })

    it('skips npm and git when both prompts are answered "n"', async () => {
        vi.mocked(askQuestion).mockResolvedValue('n')

        await init('my-project', { template: 'simple' }, targetDir, templatesDir)

        expect(askQuestion).toHaveBeenCalledTimes(2)
        expect(executeCommand).not.toHaveBeenCalled()
        expect(await pathExists(path.join(targetDir, 'package.json'))).toBe(false)
        expect(await pathExists(path.join(targetDir, '.gitignore'))).toBe(false)
    })

    it('matches the answer case-insensitively on its first letter', async () => {
        vi.mocked(askQuestion).mockResolvedValueOnce('YES').mockResolvedValueOnce('No')

        await init('my-project', { template: 'simple' }, targetDir, templatesDir)

        expect(executeCommand).toHaveBeenCalledTimes(1)
        expect(executeCommand).toHaveBeenCalledWith('npm', ['i'], targetDir)
    })

    it('does not prompt for a step whose flag is explicit, even when false', async () => {
        vi.mocked(askQuestion).mockResolvedValueOnce('local')

        await init(
            'my-project',
            { template: 'simple', npm: false, git: true },
            targetDir,
            templatesDir,
        )

        expect(askQuestion).toHaveBeenCalledTimes(1)
        expect(askQuestion).toHaveBeenCalledWith(
            expect.stringContaining('[LOCAL/github/gitlab]'),
            'local',
        )
        expect(executeCommand).not.toHaveBeenCalledWith('npm', expect.anything(), expect.anything())
        expect(executeCommand).toHaveBeenCalledWith('git', ['init'], targetDir)
    })

    it('wraps a non-Error step failure in a KnownError naming the left-behind directory', async () => {
        vi.mocked(executeCommand).mockRejectedValueOnce('npm blew up')

        const error = await init(
            'my-project',
            { template: 'simple', npm: true, git: false },
            targetDir,
            templatesDir,
        ).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(KnownError)
        const failure = error as KnownError
        expect(failure.message).toContain('npm blew up')
        expect(failure.message).toContain(`Project left in ${targetDir}`)
        expect(failure.cause).toBe('npm blew up')
        expect(await pathExists(targetDir)).toBe(true)
    })
})
