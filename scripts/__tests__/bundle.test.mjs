import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const bundleScript = join(dirname(fileURLToPath(import.meta.url)), '..', 'bundle.mjs')

describe('bundle.mjs', () => {
    let root
    let pkgDir

    // Mirrors the real layout: <root>/LICENSE and <root>/packages/<pkg>, since the script copies ../../LICENSE.
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'bundle-script-'))
        pkgDir = join(root, 'packages', 'fixture')
        await mkdir(join(pkgDir, 'src'), { recursive: true })
        await mkdir(join(pkgDir, 'dist'), { recursive: true })
        await writeFile(join(root, 'LICENSE'), 'MIT License\n\nfixture licence text\n', 'utf8')
        await writeFile(
            join(pkgDir, 'package.json'),
            JSON.stringify({ name: '@fixture/pkg', main: './dist/index.js' }),
            'utf8',
        )
        await writeFile(join(pkgDir, 'README.md'), '# fixture readme\n', 'utf8')
        await writeFile(
            join(pkgDir, 'src', 'index.ts'),
            'export const answer: number = 42\n',
            'utf8',
        )
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    function runBundle() {
        return spawnSync(process.execPath, [bundleScript], { cwd: pkgDir, encoding: 'utf8' })
    }

    it('copies the repo LICENSE into the package directory', async () => {
        const result = runBundle()

        expect(result.status, result.stderr).toBe(0)
        expect(await readFile(join(pkgDir, 'LICENSE'), 'utf8')).toBe(
            'MIT License\n\nfixture licence text\n',
        )
    })

    it("copies the package's README.md into dist/", async () => {
        const result = runBundle()

        expect(result.status, result.stderr).toBe(0)
        expect(await readFile(join(pkgDir, 'dist', 'README.md'), 'utf8')).toBe('# fixture readme\n')
    })

    it('overwrites a stale LICENSE with the current repo one', async () => {
        await writeFile(join(pkgDir, 'LICENSE'), 'stale', 'utf8')

        const result = runBundle()

        expect(result.status, result.stderr).toBe(0)
        expect(await readFile(join(pkgDir, 'LICENSE'), 'utf8')).toContain('fixture licence text')
    })

    it('bundles the main entry from src/ and removes stray compiled tests from dist/', async () => {
        await writeFile(join(pkgDir, 'dist', 'index.test.js'), '// stray', 'utf8')
        await writeFile(join(pkgDir, 'dist', 'index.test.d.ts'), '// stray', 'utf8')

        const result = runBundle()

        expect(result.status, result.stderr).toBe(0)
        expect(await readFile(join(pkgDir, 'dist', 'index.js'), 'utf8')).toContain('42')
        expect(existsSync(join(pkgDir, 'dist', 'index.test.js'))).toBe(false)
        expect(existsSync(join(pkgDir, 'dist', 'index.test.d.ts'))).toBe(false)
        expect(result.stdout).toContain('Bundled @fixture/pkg')
    })

    it('removes whole __tests__ and __mocks__ directories from dist/, helpers included', async () => {
        await mkdir(join(pkgDir, 'dist', '__tests__'), { recursive: true })
        await mkdir(join(pkgDir, 'dist', 'nested', '__mocks__'), { recursive: true })
        await writeFile(join(pkgDir, 'dist', '__tests__', 'helpers.js'), '// helper', 'utf8')
        await writeFile(join(pkgDir, 'dist', '__tests__', 'helpers.d.ts'), '// helper', 'utf8')
        await writeFile(join(pkgDir, 'dist', 'nested', '__mocks__', 'fs.js'), '// mock', 'utf8')
        await writeFile(join(pkgDir, 'dist', 'nested', 'kept.d.ts'), '// kept', 'utf8')

        const result = runBundle()

        expect(result.status, result.stderr).toBe(0)
        expect(existsSync(join(pkgDir, 'dist', '__tests__'))).toBe(false)
        expect(existsSync(join(pkgDir, 'dist', 'nested', '__mocks__'))).toBe(false)
        expect(existsSync(join(pkgDir, 'dist', 'nested', 'kept.d.ts'))).toBe(true)
    })

    it('fails when the repo LICENSE is missing', async () => {
        await rm(join(root, 'LICENSE'))

        const result = runBundle()

        expect(result.status).not.toBe(0)
        expect(existsSync(join(pkgDir, 'LICENSE'))).toBe(false)
    })

    it('rejects an entry point outside dist/', async () => {
        await writeFile(
            join(pkgDir, 'package.json'),
            JSON.stringify({ name: '@fixture/pkg', main: './lib/index.js' }),
            'utf8',
        )

        const result = runBundle()

        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('must be a dist/*.js path')
    })
})
