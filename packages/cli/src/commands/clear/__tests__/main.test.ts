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

    it('refuses an output directory that contains input.dir, leaving the source intact', async () => {
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({ input: { dir: './public/src' }, output: { dir: './public' } }),
            'utf8',
        )
        await mkdir(path.join(cwd, 'public', 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'public', 'src', 'a.html'), '<html></html>', 'utf8')

        await expect(clear(cwd)).rejects.toThrow(/overlaps input directory/)
        expect(await pathExists(path.join(cwd, 'public', 'src', 'a.html'))).toBe(true)
    })

    it('refuses an output directory nested inside input.dir, leaving it intact', async () => {
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({ input: { dir: './src' }, output: { dir: './src/assets' } }),
            'utf8',
        )
        await mkdir(path.join(cwd, 'src', 'assets'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'assets', 'logo.svg'), '<svg></svg>', 'utf8')

        await expect(clear(cwd)).rejects.toThrow(/overlaps input directory/)
        expect(await pathExists(path.join(cwd, 'src', 'assets', 'logo.svg'))).toBe(true)
    })

    it.runIf(process.platform === 'win32' || process.platform === 'darwin')(
        'refuses an output directory differing from input.dir only by case',
        async () => {
            await writeFile(
                path.join(cwd, 'minimaz.config.json'),
                JSON.stringify({ input: { dir: './public/src' }, output: { dir: './Public' } }),
                'utf8',
            )
            await mkdir(path.join(cwd, 'public', 'src'), { recursive: true })
            await writeFile(path.join(cwd, 'public', 'src', 'a.html'), '<html></html>', 'utf8')

            await expect(clear(cwd)).rejects.toThrow(/overlaps input directory/)
            expect(await pathExists(path.join(cwd, 'public', 'src', 'a.html'))).toBe(true)
        },
    )

    it('checks a local external whose path merely starts with "http" for overlap', async () => {
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({
                input: { dir: './src', externals: { 'httpdocs/vendor': 'vendor' } },
                output: { dir: './httpdocs' },
            }),
            'utf8',
        )
        await mkdir(path.join(cwd, 'httpdocs', 'vendor'), { recursive: true })
        await writeFile(path.join(cwd, 'httpdocs', 'vendor', 'lib.js'), 'export {}', 'utf8')

        await expect(clear(cwd)).rejects.toThrow(/overlaps external/)
        expect(await pathExists(path.join(cwd, 'httpdocs', 'vendor', 'lib.js'))).toBe(true)
    })

    it('refuses an output directory that contains an external source, leaving it intact', async () => {
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({
                input: { dir: './src', externals: { './dist/vendor': 'vendor' } },
                output: { dir: './dist' },
            }),
            'utf8',
        )
        await mkdir(path.join(cwd, 'dist', 'vendor'), { recursive: true })
        await writeFile(path.join(cwd, 'dist', 'vendor', 'lib.js'), 'export {}', 'utf8')

        await expect(clear(cwd)).rejects.toThrow(/overlaps external/)
        expect(await pathExists(path.join(cwd, 'dist', 'vendor', 'lib.js'))).toBe(true)
    })

    it('ignores remote externals when checking for overlap', async () => {
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({
                input: { dir: './src', externals: { 'https://cdn.example.com/x.css': 'x.css' } },
                output: { dir: './dist' },
            }),
            'utf8',
        )
        await mkdir(path.join(cwd, 'dist'), { recursive: true })

        await clear(cwd)

        expect(await pathExists(path.join(cwd, 'dist'))).toBe(false)
    })

    it('accepts a relative cwd', async () => {
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({ output: { dir: './dist' } }),
            'utf8',
        )
        await mkdir(path.join(cwd, 'dist'), { recursive: true })

        await clear(path.relative(process.cwd(), cwd))

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

    it('refuses a sibling directory even though its path is longer than cwd', async () => {
        // A string-length comparison would wrongly treat this as "safe" -
        // it's a sibling, not a descendant, of cwd.
        const siblingName = `${path.basename(cwd)}-backup-longer-name`
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({ output: { dir: `../${siblingName}` } }),
            'utf8',
        )
        await mkdir(path.join(path.dirname(cwd), siblingName), { recursive: true })

        try {
            await expect(clear(cwd)).rejects.toThrow(/Refusing to delete/)
            expect(await pathExists(path.join(path.dirname(cwd), siblingName))).toBe(true)
        } finally {
            await rm(path.join(path.dirname(cwd), siblingName), { recursive: true, force: true })
        }
    })
})
