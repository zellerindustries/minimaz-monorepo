import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathExists } from '@minimaz/core'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getBuildOldDirName, getBuildTempDirName } from '../core.js'
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

    it('hints at "minimaz init" (not "docs init") when the config file is missing', async () => {
        await expect(build(cwd)).rejects.toThrow('Run "minimaz init" first.')
    })

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

    it('reports CSS bundling failures (circular, missing, supports()) as KnownErrors', async () => {
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: 'dist', css: { bundling: true, minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        const cases = [
            ['@import "./b.css";', '@import "./a.css";', /circular @import/],
            ['@import "./missing.css";', 'b {}', /file not found/],
            ['@import "./b.css" supports(display: grid);', 'b {}', /supports\(\) and layer/],
        ] as const
        for (const [a, b, message] of cases) {
            await writeFile(path.join(cwd, 'src', 'a.css'), a, 'utf8')
            await writeFile(path.join(cwd, 'src', 'b.css'), b, 'utf8')

            const result = build(cwd)

            await expect(result).rejects.toBeInstanceOf(KnownError)
            await expect(result).rejects.toThrow(message)
        }
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

    async function writeBrokenCssProject(): Promise<void> {
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: 'dist', css: { bundling: true, minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'main.css'), '@import "./missing.css";', 'utf8')
    }

    it('keeps the previous output intact and leaves no temp dir when the build fails', async () => {
        await writeBrokenCssProject()
        await mkdir(path.join(cwd, 'dist'), { recursive: true })
        await writeFile(path.join(cwd, 'dist', 'old.txt'), 'last good build', 'utf8')

        await expect(build(cwd)).rejects.toThrow()

        expect(await readFile(path.join(cwd, 'dist', 'old.txt'), 'utf8')).toBe('last good build')
        expect((await readdir(cwd)).sort()).toEqual(['dist', 'minimaz.config.json', 'src'])
    })

    it('replaces the previous output entirely on success and leaves no temp dir', async () => {
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: 'dist', html: { minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'index.html'), '<html></html>', 'utf8')
        await mkdir(path.join(cwd, 'dist'), { recursive: true })
        await writeFile(path.join(cwd, 'dist', 'stale.txt'), 'stale', 'utf8')

        await build(cwd)

        expect(await readdir(path.join(cwd, 'dist'))).toEqual(['index.html'])
        expect((await readdir(cwd)).sort()).toEqual(['dist', 'minimaz.config.json', 'src'])
    })

    it('ignores a stale temp dir left behind by a crashed previous build', async () => {
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: 'dist', html: { minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'index.html'), '<html></html>', 'utf8')
        await mkdir(path.join(cwd, getBuildTempDirName('dist')), { recursive: true })
        await writeFile(path.join(cwd, getBuildTempDirName('dist'), 'junk.txt'), 'x', 'utf8')

        await build(cwd)

        expect(await readdir(path.join(cwd, 'dist'))).toEqual(['index.html'])
        expect((await readdir(cwd)).sort()).toEqual(['dist', 'minimaz.config.json', 'src'])
    })

    it('clears a stale previous-output backup left behind by a crashed swap', async () => {
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: 'dist', html: { minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'index.html'), '<html></html>', 'utf8')
        await mkdir(path.join(cwd, 'dist'), { recursive: true })
        await mkdir(path.join(cwd, getBuildOldDirName('dist')), { recursive: true })
        await writeFile(path.join(cwd, getBuildOldDirName('dist'), 'junk.txt'), 'x', 'utf8')

        await build(cwd)

        expect(await readdir(path.join(cwd, 'dist'))).toEqual(['index.html'])
        expect((await readdir(cwd)).sort()).toEqual(['dist', 'minimaz.config.json', 'src'])
    })

    it('restores a crashed swap backup as output.dir when output.dir is missing', async () => {
        await writeBrokenCssProject()
        await mkdir(path.join(cwd, getBuildOldDirName('dist')), { recursive: true })
        await writeFile(
            path.join(cwd, getBuildOldDirName('dist'), 'old.txt'),
            'last good build',
            'utf8',
        )

        await expect(build(cwd)).rejects.toThrow()

        expect(await readFile(path.join(cwd, 'dist', 'old.txt'), 'utf8')).toBe('last good build')
        expect((await readdir(cwd)).sort()).toEqual(['dist', 'minimaz.config.json', 'src'])
    })

    it('refuses a previous-output backup dir that overlaps input.dir, leaving the source intact', async () => {
        const oldName = getBuildOldDirName('dist')
        await writeConfig({ input: { dir: oldName }, output: { dir: 'dist' } })
        await mkdir(path.join(cwd, oldName), { recursive: true })
        await writeFile(path.join(cwd, oldName, 'a.html'), '<html></html>', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/backup directory that overlaps input directory/)
        expect(await pathExists(path.join(cwd, oldName, 'a.html'))).toBe(true)
    })

    it('refuses a build temp dir that overlaps input.dir, leaving the source intact', async () => {
        const tempName = getBuildTempDirName('dist')
        await writeConfig({ input: { dir: tempName }, output: { dir: 'dist' } })
        await mkdir(path.join(cwd, tempName), { recursive: true })
        await writeFile(path.join(cwd, tempName, 'a.html'), '<html></html>', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/temp directory that overlaps input directory/)
        expect(await pathExists(path.join(cwd, tempName, 'a.html'))).toBe(true)
    })

    it('refuses a build temp dir that overlaps a local external, leaving it intact', async () => {
        const tempName = getBuildTempDirName('dist')
        await writeConfig({
            input: { dir: 'src', externals: { [`${tempName}/vendor`]: 'vendor' } },
            output: { dir: 'dist' },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'a.html'), '<html></html>', 'utf8')
        await mkdir(path.join(cwd, tempName, 'vendor'), { recursive: true })
        await writeFile(path.join(cwd, tempName, 'vendor', 'lib.js'), 'export {}', 'utf8')

        await expect(build(cwd)).rejects.toThrow(/temp directory that overlaps external/)
        expect(await pathExists(path.join(cwd, tempName, 'vendor', 'lib.js'))).toBe(true)
    })
})
