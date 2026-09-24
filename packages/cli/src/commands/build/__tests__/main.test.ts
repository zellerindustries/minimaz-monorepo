import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathExists } from '@minimaz/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../main.js'

describe('build', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(path.join(tmpdir(), 'cli-build-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    async function writeConfig(config: Record<string, unknown>): Promise<void> {
        await writeFile(path.join(cwd, 'minimaz.config.json'), JSON.stringify(config), 'utf8')
    }

    it('builds a simple tree of HTML/CSS/JS files', async () => {
        await writeConfig({
            input: { dir: 'src' },
            output: {
                dir: 'dist',
                css: { bundling: false, minify: false },
                html: { minify: false },
            },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'index.html'), '<html></html>', 'utf8')
        await writeFile(path.join(cwd, 'src', 'style.css'), 'body {}', 'utf8')

        await build(cwd)

        expect(await pathExists(path.join(cwd, 'dist', 'index.html'))).toBe(true)
        expect(await pathExists(path.join(cwd, 'dist', 'style.css'))).toBe(true)
    })

    it('throws when output.js.bundling is true', async () => {
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: 'dist', js: { bundling: true, minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'a.js'), 'const x = 1;', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/js\.bundling/)
    })

    it('excludes a CSS partial pulled in via @import from standalone output when bundling', async () => {
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: 'dist', css: { bundling: true, minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', '_partial.css'), 'body { margin: 0; }', 'utf8')
        await writeFile(
            path.join(cwd, 'src', 'main.css'),
            '@import "./_partial.css";\nh1 { color: red; }',
            'utf8',
        )

        await build(cwd)

        expect(await pathExists(path.join(cwd, 'dist', '_partial.css'))).toBe(false)
        const mainOut = await readFile(path.join(cwd, 'dist', 'main.css'), 'utf8')
        expect(mainOut).toContain('body { margin: 0; }')
        expect(mainOut).toContain('h1 { color: red; }')
    })

    it('still emits a JS dependency file as its own output (bundling disabled)', async () => {
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: 'dist', js: { bundling: false, minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'util.js'), 'export const x = 1;', 'utf8')
        await writeFile(path.join(cwd, 'src', 'main.js'), "import { x } from './util.js';", 'utf8')

        await build(cwd)

        expect(await pathExists(path.join(cwd, 'dist', 'util.js'))).toBe(true)
        expect(await pathExists(path.join(cwd, 'dist', 'main.js'))).toBe(true)
    })

    it('throws when input.dir is empty', async () => {
        await writeConfig({ input: { dir: 'src' }, output: { dir: 'dist' } })
        await mkdir(path.join(cwd, 'src'), { recursive: true })

        await expect(build(cwd)).rejects.toThrow(/missing or empty/)
    })

    it('throws when input.dir does not exist', async () => {
        await writeConfig({ input: { dir: 'srcc' }, output: { dir: 'dist' } })

        await expect(build(cwd)).rejects.toThrow(/missing or empty/)
    })

    it('refuses an output directory equal to input.dir, leaving the source intact', async () => {
        await writeConfig({ input: { dir: 'src' }, output: { dir: './src' } })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'a.html'), '<html></html>', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/overlaps input directory/)
        expect(await pathExists(path.join(cwd, 'src', 'a.html'))).toBe(true)
    })

    it('refuses an output directory that contains input.dir, leaving the source intact', async () => {
        await writeConfig({ input: { dir: 'public/src' }, output: { dir: 'public' } })
        await mkdir(path.join(cwd, 'public', 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'public', 'src', 'a.html'), '<html></html>', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/overlaps input directory/)
        expect(await pathExists(path.join(cwd, 'public', 'src', 'a.html'))).toBe(true)
    })

    it('refuses an output directory nested inside input.dir', async () => {
        await writeConfig({ input: { dir: 'src' }, output: { dir: 'src/dist' } })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'a.html'), '<html></html>', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/overlaps input directory/)
    })

    it.runIf(process.platform === 'win32' || process.platform === 'darwin')(
        'refuses an output directory differing from input.dir only by case, leaving the source intact',
        async () => {
            await writeConfig({ input: { dir: 'src' }, output: { dir: './Src' } })
            await mkdir(path.join(cwd, 'src'), { recursive: true })
            await writeFile(path.join(cwd, 'src', 'a.html'), '<html></html>', 'utf8')

            await expect(build(cwd)).rejects.toThrow(/overlaps input directory/)
            expect(await pathExists(path.join(cwd, 'src', 'a.html'))).toBe(true)
        },
    )

    it('checks a local external whose path merely starts with "http" for overlap', async () => {
        await writeConfig({
            input: { dir: 'src', externals: { 'httpdocs/vendor': 'vendor' } },
            output: { dir: './httpdocs' },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'a.html'), '<html></html>', 'utf8')
        await mkdir(path.join(cwd, 'httpdocs', 'vendor'), { recursive: true })
        await writeFile(path.join(cwd, 'httpdocs', 'vendor', 'lib.js'), 'export {}', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/overlaps external/)
        expect(await pathExists(path.join(cwd, 'httpdocs', 'vendor', 'lib.js'))).toBe(true)
    })

    it('refuses an output directory that contains an external source, leaving it intact', async () => {
        await writeConfig({
            input: { dir: 'src', externals: { './dist/vendor': 'vendor' } },
            output: { dir: './dist' },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'a.html'), '<html></html>', 'utf8')
        await mkdir(path.join(cwd, 'dist', 'vendor'), { recursive: true })
        await writeFile(path.join(cwd, 'dist', 'vendor', 'lib.js'), 'export {}', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/overlaps external/)
        expect(await pathExists(path.join(cwd, 'dist', 'vendor', 'lib.js'))).toBe(true)
    })

    it('accepts a relative cwd', async () => {
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: 'dist', html: { minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'index.html'), '<html></html>', 'utf8')

        await build(path.relative(process.cwd(), cwd))

        expect(await pathExists(path.join(cwd, 'dist', 'index.html'))).toBe(true)
    })

    it('refuses to build into an unsafe output directory', async () => {
        await writeConfig({ input: { dir: 'src' }, output: { dir: '.' } })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'a.html'), '<html></html>', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/unsafe output directory/)
    })

    it('refuses a sibling directory even though its path is longer than cwd', async () => {
        // A string-length comparison would wrongly treat this as "safe" -
        // it's a sibling, not a descendant, of cwd.
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: `../${path.basename(cwd)}-backup-longer-name` },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'a.html'), '<html></html>', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/unsafe output directory/)
    })

    it('does not wipe an existing output directory when input.dir is empty', async () => {
        await writeConfig({ input: { dir: 'src' }, output: { dir: 'dist' } })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await mkdir(path.join(cwd, 'dist'), { recursive: true })
        await writeFile(path.join(cwd, 'dist', 'previous-build.html'), '<html></html>', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/missing or empty/)

        expect(await pathExists(path.join(cwd, 'dist', 'previous-build.html'))).toBe(true)
    })
})
