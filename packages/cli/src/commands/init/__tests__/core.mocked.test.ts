import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askQuestion, executeCommand } from '../../../cli/index.js'
import { initGit, initNpm } from '../core.js'

// Fully stubbed - never runs a real npm/git/gh/glab process or prompts on
// stdin. Branch-decision coverage for initGit's provider handling lives
// here; core.test.ts covers "local" and the unsupported-provider error
// against a real git invocation.
vi.mock('../../../cli/index.js', () => ({
    executeCommand: vi.fn(() => Promise.resolve()),
    askQuestion: vi.fn(() => Promise.resolve('local')),
}))

describe('initNpm', () => {
    let targetDir: string

    beforeEach(async () => {
        targetDir = await mkdtemp(path.join(tmpdir(), 'site-builder-initnpm-'))
    })

    afterEach(async () => {
        await rm(targetDir, { recursive: true, force: true })
    })

    it('writes package.json with the project name and runs npm install', async () => {
        await initNpm(targetDir, 'my-project')

        const pkg = JSON.parse(await readFile(path.join(targetDir, 'package.json'), 'utf8')) as {
            name: string
        }
        expect(pkg.name).toBe('my-project')
        expect(executeCommand).toHaveBeenCalledWith('npm', ['i'], targetDir)
    })
})

describe('initGit provider branches', () => {
    let targetDir: string

    beforeEach(async () => {
        targetDir = await mkdtemp(path.join(tmpdir(), 'site-builder-initgit-mocked-'))
        vi.clearAllMocks()
    })

    afterEach(async () => {
        await rm(targetDir, { recursive: true, force: true })
        vi.unstubAllEnvs()
    })

    it('falls back to an interactive prompt when no provider is given', async () => {
        await initGit('my-project', targetDir)

        expect(askQuestion).toHaveBeenCalledOnce()
        expect(executeCommand).toHaveBeenCalledWith('git', ['init'], targetDir)
    })

    it('adds an existing remote URL without creating anything remotely', async () => {
        await initGit('my-project', targetDir, 'https://example.com/my-project.git')

        expect(executeCommand).toHaveBeenCalledWith(
            'git',
            ['remote', 'add', 'origin', 'https://example.com/my-project.git'],
            targetDir,
        )
    })

    it('creates a GitHub repository via the gh CLI', async () => {
        await initGit('my-project', targetDir, 'github')

        expect(executeCommand).toHaveBeenCalledWith(
            'gh',
            ['repo', 'create', 'my-project', '--private', '--source=.', '--remote', 'origin'],
            targetDir,
        )
    })

    it('matches a mixed-case explicit provider the same as a lowercase one', async () => {
        await initGit('my-project', targetDir, 'GitHub')

        expect(executeCommand).toHaveBeenCalledWith(
            'gh',
            ['repo', 'create', 'my-project', '--private', '--source=.', '--remote', 'origin'],
            targetDir,
        )
    })

    it('treats an explicit "Local" (mixed case) the same as "local"', async () => {
        await initGit('my-project', targetDir, 'Local')

        expect(executeCommand).toHaveBeenCalledWith('git', ['init'], targetDir)
        expect(executeCommand).not.toHaveBeenCalledWith('gh', expect.anything(), expect.anything())
        expect(executeCommand).not.toHaveBeenCalledWith(
            'glab',
            expect.anything(),
            expect.anything(),
        )
    })

    it('creates a GitLab repository via the glab CLI when GITLAB_USER is set', async () => {
        vi.stubEnv('GITLAB_USER', 'alice')

        await initGit('my-project', targetDir, 'gitlab')

        expect(executeCommand).toHaveBeenCalledWith(
            'glab',
            ['repo', 'create', 'my-project', '--source=.'],
            targetDir,
        )
        expect(executeCommand).toHaveBeenCalledWith(
            'git',
            ['remote', 'add', 'origin', 'git@gitlab.com:alice/my-project.git'],
            targetDir,
        )
    })

    it('throws when GITLAB_USER is not set', async () => {
        vi.stubEnv('GITLAB_USER', '')

        await expect(initGit('my-project', targetDir, 'gitlab')).rejects.toThrow(
            'GITLAB_USER not set',
        )
    })
})
