import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathExists } from '@minimaz/core'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askYesNo } from '../../prompts.js'
import { getBuildOldDirName, getBuildTempDirName } from '../core.js'
import { build } from '../main.js'

vi.mock('../../prompts.js', () => ({
    askYesNo: vi.fn(),
}))

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

    it('writes rewritten imports for both files when output.js.bundling is true', async () => {
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: 'dist', js: { bundling: true, minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'sibling.ts'), 'export const x: number = 1', 'utf8')
        await writeFile(
            path.join(cwd, 'src', 'entry.js'),
            "import { x } from './sibling'\nconsole.log(x)\n",
            'utf8',
        )

        await build(cwd)

        const entryOut = await readFile(path.join(cwd, 'dist', 'entry.js'), 'utf8')
        expect(entryOut).toContain('./sibling.js')
        const siblingOut = await readFile(path.join(cwd, 'dist', 'sibling.js'), 'utf8')
        expect(siblingOut).not.toContain(': number')
    })

    it('reports an unresolvable import as a KnownError', async () => {
        await writeConfig({
            input: { dir: 'src' },
            output: { dir: 'dist', js: { bundling: true, minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'a.js'), "import './missing'\n", 'utf8')

        await expect(build(cwd)).rejects.toBeInstanceOf(KnownError)
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

    it('builds local externals into the output and skips remote ones', async () => {
        await writeConfig({
            input: {
                dir: 'src',
                externals: { 'https://cdn.example.com/lib.js': 'lib.js', vendor: 'assets/vendor' },
            },
            output: { dir: 'dist', html: { minify: false } },
        })
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'index.html'), '<html></html>', 'utf8')
        await mkdir(path.join(cwd, 'vendor'), { recursive: true })
        await writeFile(path.join(cwd, 'vendor', 'notes.txt'), 'vendored', 'utf8')

        await build(cwd)

        expect(
            await readFile(path.join(cwd, 'dist', 'assets', 'vendor', 'notes.txt'), 'utf8'),
        ).toBe('vendored')
        expect((await readdir(path.join(cwd, 'dist'))).sort()).toEqual(['assets', 'index.html'])
        expect((await readdir(cwd)).sort()).toEqual([
            'dist',
            'minimaz.config.json',
            'src',
            'vendor',
        ])
    })

    it.each([
        ['input.dir', { input: { dir: 'src' }, output: { dir: 'src/dist' } }],
        [
            'a local external',
            {
                input: { dir: 'src', externals: { './dist/vendor': 'vendor' } },
                output: { dir: 'dist' },
            },
        ],
        [
            'a local external alongside a remote one',
            {
                input: {
                    dir: 'src',
                    externals: {
                        'https://cdn.example.com/a.js': 'a.js',
                        './dist/vendor': 'vendor',
                    },
                },
                output: { dir: 'dist' },
            },
        ],
    ])(
        'refuses an output overlapping %s before touching the stale temp dir or the sources',
        async (_label, config) => {
            await writeConfig(config)
            await mkdir(path.join(cwd, 'src'), { recursive: true })
            await writeFile(path.join(cwd, 'src', 'a.html'), '<html></html>', 'utf8')
            await mkdir(path.join(cwd, 'dist', 'vendor'), { recursive: true })
            await writeFile(path.join(cwd, 'dist', 'vendor', 'lib.js'), 'export {}', 'utf8')
            const tempDir = path.join(cwd, getBuildTempDirName('dist'))
            await mkdir(tempDir, { recursive: true })
            await writeFile(path.join(tempDir, 'stale.txt'), 'stale', 'utf8')

            const result = build(cwd)

            await expect(result).rejects.toBeInstanceOf(KnownError)
            await expect(result).rejects.toThrow(/refusing output directory that overlaps/)
            expect(await readFile(path.join(tempDir, 'stale.txt'), 'utf8')).toBe('stale')
            expect(await readdir(tempDir)).toEqual(['stale.txt'])
            expect(await pathExists(path.join(cwd, 'src', 'a.html'))).toBe(true)
            expect(await pathExists(path.join(cwd, 'dist', 'vendor', 'lib.js'))).toBe(true)
            expect(await pathExists(path.join(cwd, getBuildOldDirName('dist')))).toBe(false)
        },
    )

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

        await expect(build(cwd, { overwrite: true })).rejects.toThrow(/file not found/)

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

        await build(cwd, { overwrite: true })

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

        await build(cwd, { overwrite: true })

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

        await expect(build(cwd, { overwrite: true })).rejects.toThrow(/file not found/)

        expect(await readFile(path.join(cwd, 'dist', 'old.txt'), 'utf8')).toBe('last good build')
        expect((await readdir(cwd)).sort()).toEqual(['dist', 'minimaz.config.json', 'src'])
    })

    it('puts a restored crashed-swap backup through the overwrite gate', async () => {
        await writeBrokenCssProject()
        await mkdir(path.join(cwd, getBuildOldDirName('dist')), { recursive: true })
        await writeFile(
            path.join(cwd, getBuildOldDirName('dist'), 'old.txt'),
            'last good build',
            'utf8',
        )

        await expect(build(cwd, { interactive: false })).rejects.toThrow(/--overwrite/)

        expect(await readFile(path.join(cwd, 'dist', 'old.txt'), 'utf8')).toBe('last good build')
        expect(await pathExists(path.join(cwd, getBuildTempDirName('dist')))).toBe(false)
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

describe('build with output.js.bundling', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(path.join(tmpdir(), 'cli-build-bundling-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    async function writeConfig(
        bundling: boolean,
        extra: { minify?: boolean; exclude?: string[]; replace?: Record<string, string> } = {},
    ): Promise<void> {
        const config = {
            input: { dir: 'src', exclude: extra.exclude ?? [] },
            output: {
                dir: 'dist',
                js: { bundling, minify: extra.minify ?? false },
                replace: extra.replace ?? {},
            },
        }
        await writeFile(path.join(cwd, 'minimaz.config.json'), JSON.stringify(config), 'utf8')
    }

    async function writeSrc(files: Record<string, string>): Promise<void> {
        for (const [name, content] of Object.entries(files)) {
            const full = path.join(cwd, 'src', name)
            await mkdir(path.dirname(full), { recursive: true })
            await writeFile(full, content, 'utf8')
        }
    }

    async function readDist(name: string): Promise<string> {
        return readFile(path.join(cwd, 'dist', name), 'utf8')
    }

    it('rewrites ../ imports between nested directories', async () => {
        await writeConfig(true)
        await writeSrc({
            'a/b/deep.js': "import { u } from '../util'\nimport { r } from '../../root'\n",
            'a/util.ts': 'export const u: number = 1\n',
            'root.js': 'export const r = 1\n',
        })

        await build(cwd)

        expect(await readDist('a/b/deep.js')).toBe(
            "import { u } from '../util.js'\nimport { r } from '../../root.js'\n",
        )
        expect(await pathExists(path.join(cwd, 'dist', 'a', 'util.js'))).toBe(true)
    })

    it('rewrites a directory import ./lib to ./lib/index.js', async () => {
        await writeConfig(true)
        await writeSrc({
            'main.js': "import { l } from './lib'\n",
            'lib/index.ts': 'export const l: number = 1\n',
        })

        await build(cwd)

        expect(await readDist('main.js')).toBe("import { l } from './lib/index.js'\n")
        expect(await readDist('lib/index.js')).toContain('export const l = 1')
    })

    it('transpiles a .tsx entry to .js and rewrites its imports', async () => {
        await writeConfig(true)
        await writeSrc({
            'app.tsx': "import { B } from './button'\nexport const App = () => <B />\n",
            'button.tsx': 'export const B = () => <b />\n',
        })

        await build(cwd)

        const app = await readDist('app.js')
        expect(app).toContain("from './button.js'")
        expect(app).not.toContain('<B')
        expect(await pathExists(path.join(cwd, 'dist', 'app.tsx'))).toBe(false)
        expect(await pathExists(path.join(cwd, 'dist', 'button.js'))).toBe(true)
    })

    it('rewrites side-effect imports and export-from re-exports', async () => {
        await writeConfig(true)
        await writeSrc({
            'main.js': "import './polyfill'\nexport * from './x'\nexport { a } from './x'\n",
            'polyfill.ts': 'globalThis.p = 1\n',
            'x.ts': 'export const a: number = 1\n',
        })

        await build(cwd)

        expect(await readDist('main.js')).toBe(
            "import './polyfill.js'\nexport * from './x.js'\nexport { a } from './x.js'\n",
        )
        expect(await pathExists(path.join(cwd, 'dist', 'polyfill.js'))).toBe(true)
        expect(await pathExists(path.join(cwd, 'dist', 'x.js'))).toBe(true)
    })

    it('builds circular imports without hanging, rewriting both sides', async () => {
        await writeConfig(true)
        await writeSrc({
            'a.js': "import './b'\nexport const a = 1\n",
            'b.js': "import './a'\nexport const b = 1\n",
        })

        await build(cwd)

        expect(await readDist('a.js')).toBe("import './b.js'\nexport const a = 1\n")
        expect(await readDist('b.js')).toBe("import './a.js'\nexport const b = 1\n")
    })

    it('still rewrites imports when minify is also enabled', async () => {
        await writeConfig(true, { minify: true })
        await writeSrc({
            'main.js': "import { x } from './dep'\n\n// a comment\nconsole.log( x )\n",
            'dep.ts': 'export const x: number = 1\n',
        })

        await build(cwd)

        const main = await readDist('main.js')
        expect(main).toBe('import{x as a}from"./dep.js";console.log(a)')
        expect(await readDist('dep.js')).not.toContain(': number')
    })

    it('emits a standalone file byte-identical to the bundling:false output', async () => {
        await writeSrc({
            'plain.js': "const a = 'x'\nconsole.log(a)\n",
            'typed.ts': 'export const t: string = "y"\n',
        })
        await writeConfig(false)
        await build(cwd)
        const plain = await readDist('plain.js')
        const typed = await readDist('typed.js')

        await writeConfig(true)
        await build(cwd, { overwrite: true })

        expect(await readDist('plain.js')).toBe(plain)
        expect(await readDist('typed.js')).toBe(typed)
    })

    it('leaves specifiers untouched when bundling is false (regression)', async () => {
        await writeConfig(false)
        await writeSrc({
            'main.js': "import { x } from './dep'\n",
            'dep.js': 'export const x = 1\n',
        })

        await build(cwd)

        expect(await readDist('main.js')).toBe("import { x } from './dep'\n")
    })

    it('leaves bare specifiers and ./data.json untouched', async () => {
        await writeConfig(true)
        const source = "import 'lodash'\nimport d from './data.json'\nconsole.log(d)\n"
        await writeSrc({ 'main.js': source, 'data.json': '{}' })

        await build(cwd)

        expect(await readDist('main.js')).toBe(source)
        expect(await readDist('data.json')).toBe('{}')
    })

    it('applies output.replace before rewriting imports', async () => {
        await writeConfig(true, { replace: { '@@DEP@@': './dep' } })
        await writeSrc({
            'main.js': "import { x } from '@@DEP@@'\nconsole.log('@@DEP@@')\n",
            'dep.js': 'export const x = 1\n',
        })

        await build(cwd)

        expect(await readDist('main.js')).toBe(
            "import { x } from './dep.js'\nconsole.log('./dep')\n",
        )
    })

    it('fails with a KnownError on a relative dynamic import and keeps the previous dist', async () => {
        await writeConfig(true)
        await writeSrc({ 'main.js': "const m = import('./x')\n", 'x.js': 'export {}\n' })
        await mkdir(path.join(cwd, 'dist'), { recursive: true })
        await writeFile(path.join(cwd, 'dist', 'old.txt'), 'last good build', 'utf8')

        const result = build(cwd, { overwrite: true })

        await expect(result).rejects.toBeInstanceOf(KnownError)
        await expect(result).rejects.toThrow(/Dynamic import\("\.\/x"\)/)
        expect(await readDist('old.txt')).toBe('last good build')
        expect((await readdir(path.join(cwd, 'dist'))).sort()).toEqual(['old.txt'])
        expect((await readdir(cwd)).sort()).toEqual(['dist', 'minimaz.config.json', 'src'])
    })

    it('names the missing specifier in a KnownError and keeps the previous dist', async () => {
        await writeConfig(true)
        await writeSrc({ 'main.js': "import './missing'\n" })
        await mkdir(path.join(cwd, 'dist'), { recursive: true })
        await writeFile(path.join(cwd, 'dist', 'old.txt'), 'last good build', 'utf8')

        const result = build(cwd, { overwrite: true })

        await expect(result).rejects.toBeInstanceOf(KnownError)
        await expect(result).rejects.toThrow(/Cannot resolve "\.\/missing"/)
        expect(await readDist('old.txt')).toBe('last good build')
        expect((await readdir(cwd)).sort()).toEqual(['dist', 'minimaz.config.json', 'src'])
    })

    it('fails with a KnownError on a TypeScript syntax error and keeps the previous dist', async () => {
        await writeConfig(true)
        await writeSrc({ 'main.ts': 'const = ;\n' })
        await mkdir(path.join(cwd, 'dist'), { recursive: true })
        await writeFile(path.join(cwd, 'dist', 'old.txt'), 'last good build', 'utf8')

        const result = build(cwd, { overwrite: true })

        await expect(result).rejects.toBeInstanceOf(KnownError)
        await expect(result).rejects.toThrow(/main\.ts.*syntax error/s)
        expect(await readDist('old.txt')).toBe('last good build')
        expect((await readdir(cwd)).sort()).toEqual(['dist', 'minimaz.config.json', 'src'])
    })

    it('pins current behavior: an import of an input.exclude file is rewritten but the target is not emitted', async () => {
        await writeConfig(true, { exclude: ['legacy.js'] })
        await writeSrc({
            'main.js': "import './legacy'\n",
            'legacy.js': 'export const l = 1\n',
        })

        await build(cwd)

        expect(await readDist('main.js')).toBe("import './legacy.js'\n")
        expect(await pathExists(path.join(cwd, 'dist', 'legacy.js'))).toBe(false)
    })

    it('pins current behavior: an import resolving outside input.dir is rewritten to a ../ path and not emitted', async () => {
        await writeConfig(true)
        await writeSrc({ 'main.js': "import '../shared'\n" })
        await writeFile(path.join(cwd, 'shared.js'), 'export const s = 1\n', 'utf8')

        await build(cwd)

        expect(await readDist('main.js')).toBe("import '../shared.js'\n")
        expect(await pathExists(path.join(cwd, 'dist', 'shared.js'))).toBe(false)
    })
})

describe('build with an existing output directory', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(path.join(tmpdir(), 'cli-build-overwrite-'))
        vi.mocked(askYesNo).mockReset()
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    async function writeProject(): Promise<void> {
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({
                input: { dir: 'src' },
                output: { dir: 'dist', html: { minify: false } },
            }),
            'utf8',
        )
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'index.html'), '<html></html>', 'utf8')
    }

    async function writeOldOutput(): Promise<void> {
        await mkdir(path.join(cwd, 'dist'), { recursive: true })
        await writeFile(path.join(cwd, 'dist', 'old.txt'), 'last good build', 'utf8')
    }

    async function expectNoScratchDirs(): Promise<void> {
        expect(await pathExists(path.join(cwd, getBuildTempDirName('dist')))).toBe(false)
        expect(await pathExists(path.join(cwd, getBuildOldDirName('dist')))).toBe(false)
    }

    it('throws a KnownError naming --overwrite when output.dir exists and the run is non-interactive', async () => {
        await writeProject()
        await writeOldOutput()

        const result = build(cwd, { interactive: false })

        await expect(result).rejects.toBeInstanceOf(KnownError)
        await expect(result).rejects.toThrow(/--overwrite/)
        expect(askYesNo).not.toHaveBeenCalled()
        expect(await readFile(path.join(cwd, 'dist', 'old.txt'), 'utf8')).toBe('last good build')
        await expectNoScratchDirs()
    })

    it('asks before replacing and aborts with a KnownError on "no"', async () => {
        await writeProject()
        await writeOldOutput()
        vi.mocked(askYesNo).mockResolvedValue(false)

        const result = build(cwd, { interactive: true })

        await expect(result).rejects.toBeInstanceOf(KnownError)
        expect(askYesNo).toHaveBeenCalledTimes(1)
        const [query, defaultAnswer] = vi.mocked(askYesNo).mock.calls[0] ?? []
        expect(query).toContain('dist')
        expect(query).toContain('[y/N]')
        expect(defaultAnswer).toBe('n')
        expect(await readFile(path.join(cwd, 'dist', 'old.txt'), 'utf8')).toBe('last good build')
        await expectNoScratchDirs()
    })

    it('replaces the output when the prompt is answered "yes"', async () => {
        await writeProject()
        await writeOldOutput()
        vi.mocked(askYesNo).mockResolvedValue(true)

        await build(cwd, { interactive: true })

        expect(askYesNo).toHaveBeenCalledTimes(1)
        expect(await readdir(path.join(cwd, 'dist'))).toEqual(['index.html'])
        await expectNoScratchDirs()
    })

    it('replaces the output without asking when overwrite is true', async () => {
        await writeProject()
        await writeOldOutput()

        await build(cwd, { overwrite: true, interactive: false })

        expect(askYesNo).not.toHaveBeenCalled()
        expect(await readdir(path.join(cwd, 'dist'))).toEqual(['index.html'])
        await expectNoScratchDirs()
    })

    it.each([
        ['without overwrite', {}],
        ['with overwrite', { overwrite: true }],
    ])('does not ask when output.dir does not exist (%s)', async (_label, options) => {
        await writeProject()

        await build(cwd, { ...options, interactive: true })

        expect(askYesNo).not.toHaveBeenCalled()
        expect(await readdir(path.join(cwd, 'dist'))).toEqual(['index.html'])
        await expectNoScratchDirs()
    })

    it('keeps the previous output when an --overwrite build fails', async () => {
        await writeFile(
            path.join(cwd, 'minimaz.config.json'),
            JSON.stringify({
                input: { dir: 'src' },
                output: { dir: 'dist', css: { bundling: true, minify: false } },
            }),
            'utf8',
        )
        await mkdir(path.join(cwd, 'src'), { recursive: true })
        await writeFile(path.join(cwd, 'src', 'main.css'), '@import "./missing.css";', 'utf8')
        await writeOldOutput()

        await expect(build(cwd, { overwrite: true })).rejects.toThrow(/file not found/)

        expect(askYesNo).not.toHaveBeenCalled()
        expect(await readFile(path.join(cwd, 'dist', 'old.txt'), 'utf8')).toBe('last good build')
        await expectNoScratchDirs()
    })

    it('gates an existing but empty output.dir', async () => {
        await writeProject()
        await mkdir(path.join(cwd, 'dist'), { recursive: true })

        const result = build(cwd, { interactive: false })

        await expect(result).rejects.toBeInstanceOf(KnownError)
        await expect(result).rejects.toThrow(/--overwrite/)
        expect(await readdir(path.join(cwd, 'dist'))).toEqual([])
        await expectNoScratchDirs()
    })
})
