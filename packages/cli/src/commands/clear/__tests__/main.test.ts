import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathExists } from '@minimaz/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clear } from '../main.js'

describe('clear', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(path.join(tmpdir(), 'cli-clear-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    it('removes the configured output directory', async () => {
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({ output: { dir: './dist' } }),
            'utf8',
        )
        await mkdir(path.join(cwd, 'dist'), { recursive: true })
        await writeFile(path.join(cwd, 'dist', 'index.html'), '<html></html>', 'utf8')

        await clear(cwd)

        expect(await pathExists(path.join(cwd, 'dist'))).toBe(false)
    })

    it('does nothing when the output directory does not exist', async () => {
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({ output: { dir: './dist' } }),
            'utf8',
        )

        await expect(clear(cwd)).resolves.toBeUndefined()
    })

    it('refuses to delete the project root itself', async () => {
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({ output: { dir: '.' } }),
            'utf8',
        )

        await expect(clear(cwd)).rejects.toThrow(/Refusing to delete/)
        expect(await pathExists(cwd)).toBe(true)
    })
})
