import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initGit } from './core.js'

describe('initGit', () => {
    let targetDir: string

    beforeEach(async () => {
        targetDir = await mkdtemp(path.join(tmpdir(), 'site-builder-initgit-'))
    })

    afterEach(async () => {
        await rm(targetDir, { recursive: true, force: true })
    })

    it('runs a real local git init and writes .gitignore, when provider is "local"', async () => {
        await initGit('my-project', targetDir, 'local')

        const gitDir = await stat(path.join(targetDir, '.git'))
        expect(gitDir.isDirectory()).toBe(true)

        const gitignore = await readFile(path.join(targetDir, '.gitignore'), 'utf8')
        expect(gitignore).toContain('node_modules')
    })

    it('throws on an unsupported provider', async () => {
        await expect(initGit('my-project', targetDir, 'not-a-real-provider')).rejects.toThrow(
            'Unsupported git provider',
        )
    })
})
