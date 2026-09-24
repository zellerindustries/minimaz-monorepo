import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defaultBuildConfig, defaultConfig } from '@minimaz/config'
import type { MinimazConfig } from '@minimaz/config'
import { pathExists } from '@minimaz/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { processExternals, processFile, reCreateOutDir, runDiscovery, walkFolder } from '../core.js'
import type { File } from '../types.js'

function makeConfig(
    overrides: Partial<MinimazConfig['input']> = {},
    outputOverrides: Partial<MinimazConfig['output']> = {},
): MinimazConfig {
    return {
        ...defaultConfig,
        ...defaultBuildConfig,
        input: { ...defaultBuildConfig.input, ...overrides },
        output: { ...defaultBuildConfig.output, ...outputOverrides },
    }
}

describe('reCreateOutDir', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'build-outdir-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('removes existing contents and recreates the directory', async () => {
        const outDir = path.join(dir, 'dist')
        await mkdir(outDir, { recursive: true })
        await writeFile(path.join(outDir, 'stale.txt'), 'old', 'utf8')

        await reCreateOutDir(outDir)

        expect(await pathExists(outDir)).toBe(true)
        expect(await pathExists(path.join(outDir, 'stale.txt'))).toBe(false)
    })

    it('creates the directory when it does not already exist', async () => {
        const outDir = path.join(dir, 'dist')

        await reCreateOutDir(outDir)

        expect(await pathExists(outDir)).toBe(true)
    })
})

describe('runDiscovery', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'build-discovery-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('ignores a CSS partial pulled in via @import when css.bundling is enabled', async () => {
        await writeFile(path.join(dir, '_partial.css'), 'body { margin: 0; }', 'utf8')
        await writeFile(
            path.join(dir, 'main.css'),
            '@import "./_partial.css";\nh1 { color: red; }',
            'utf8',
        )

        const ignoredFiles = new Set<string>()
        await runDiscovery(
            dir,
            makeConfig({}, { css: { bundling: true, minify: false } }),
            ignoredFiles,
            new Map(),
        )

        expect(ignoredFiles.has(path.resolve(dir, '_partial.css'))).toBe(true)
        expect(ignoredFiles.has(path.resolve(dir, 'main.css'))).toBe(false)
    })

    it('does not ignore a CSS partial when css.bundling is disabled', async () => {
        await writeFile(path.join(dir, '_partial.css'), 'body { margin: 0; }', 'utf8')
        await writeFile(
            path.join(dir, 'main.css'),
            '@import "./_partial.css";\nh1 { color: red; }',
            'utf8',
        )

        const ignoredFiles = new Set<string>()
        await runDiscovery(
            dir,
            makeConfig({}, { css: { bundling: false, minify: false } }),
            ignoredFiles,
            new Map(),
        )

        expect(ignoredFiles.size).toBe(0)
    })

    it('never ignores JS/TS files regardless of config', async () => {
        await writeFile(path.join(dir, 'util.js'), 'export const x = 1;', 'utf8')
        await writeFile(path.join(dir, 'main.js'), "import { x } from './util.js';", 'utf8')

        const ignoredFiles = new Set<string>()
        await runDiscovery(
            dir,
            makeConfig({}, { js: { bundling: false, minify: false } }),
            ignoredFiles,
            new Map(),
        )

        expect(ignoredFiles.size).toBe(0)
    })

    it('skips excluded directory names', async () => {
        await mkdir(path.join(dir, 'node_modules'), { recursive: true })
        await writeFile(path.join(dir, 'node_modules', 'x.css'), 'body{}', 'utf8')

        const ignoredFiles = new Set<string>()
        await runDiscovery(
            dir,
            makeConfig({ exclude: ['node_modules'] }, { css: { bundling: true, minify: false } }),
            ignoredFiles,
            new Map(),
        )

        expect(ignoredFiles.size).toBe(0)
    })
})

describe('processFile', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'build-processfile-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('writes processed CSS to dest', async () => {
        const src = path.join(dir, 'a.css')
        const dest = path.join(dir, 'out', 'a.css')
        await writeFile(src, 'body { color: red; }', 'utf8')

        const file: File = { src, dest, content: 'body { color: red; }', ext: '.css' }
        await processFile(
            file,
            makeConfig({}, { css: { bundling: false, minify: false } }),
            new Map(),
        )

        expect(await readFile(dest, 'utf8')).toBe('body { color: red; }')
    })

    it('writes transpiled TS to a .js destination', async () => {
        const src = path.join(dir, 'a.ts')
        const dest = path.join(dir, 'out', 'a.ts')
        const file: File = { src, dest, content: 'const x: number = 1;', ext: '.ts' }

        await processFile(
            file,
            makeConfig({}, { js: { bundling: false, minify: false } }),
            new Map(),
        )

        const jsDest = path.join(dir, 'out', 'a.js')
        expect(await pathExists(jsDest)).toBe(true)
        expect(await pathExists(dest)).toBe(false)
        const written = await readFile(jsDest, 'utf8')
        expect(written).not.toContain(': number')
    })

    it('copies unrecognized extensions as-is', async () => {
        const src = path.join(dir, 'logo.png')
        const dest = path.join(dir, 'out', 'logo.png')
        await writeFile(src, 'binary-ish-content', 'utf8')

        const file: File = { src, dest, content: '', ext: '.png' }
        await processFile(file, makeConfig(), new Map())

        expect(await readFile(dest, 'utf8')).toBe('binary-ish-content')
    })
})

describe('walkFolder', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'build-walk-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('recursively walks and writes files preserving structure', async () => {
        const inDir = path.join(dir, 'src')
        const outDir = path.join(dir, 'dist')
        await mkdir(path.join(inDir, 'sub'), { recursive: true })
        await writeFile(path.join(inDir, 'a.css'), 'body{}', 'utf8')
        await writeFile(path.join(inDir, 'sub', 'b.css'), 'h1{}', 'utf8')

        await walkFolder(
            inDir,
            outDir,
            makeConfig({}, { css: { bundling: false, minify: false } }),
            new Set(),
            inDir,
            new Map(),
        )

        expect(await pathExists(path.join(outDir, 'a.css'))).toBe(true)
        expect(await pathExists(path.join(outDir, 'sub', 'b.css'))).toBe(true)
    })

    it('skips files in the ignoredFiles set', async () => {
        const inDir = path.join(dir, 'src')
        const outDir = path.join(dir, 'dist')
        await mkdir(inDir, { recursive: true })
        await writeFile(path.join(inDir, '_partial.css'), 'body{}', 'utf8')

        const ignoredFiles = new Set([path.resolve(inDir, '_partial.css')])
        await walkFolder(
            inDir,
            outDir,
            makeConfig({}, { css: { bundling: false, minify: false } }),
            ignoredFiles,
            inDir,
            new Map(),
        )

        expect(await pathExists(path.join(outDir, '_partial.css'))).toBe(false)
    })

    it('redirects a top-level mapped folder to the mapping destination', async () => {
        const inDir = path.join(dir, 'src')
        const outDir = path.join(dir, 'dist')
        await mkdir(path.join(inDir, 'pages'), { recursive: true })
        await writeFile(path.join(inDir, 'pages', 'index.html'), '<html></html>', 'utf8')

        await walkFolder(
            inDir,
            outDir,
            makeConfig({ mapping: { pages: '' } }, { html: { minify: false } }),
            new Set(),
            inDir,
            new Map(),
        )

        expect(await pathExists(path.join(outDir, 'index.html'))).toBe(true)
    })

    it('skips excluded names', async () => {
        const inDir = path.join(dir, 'src')
        const outDir = path.join(dir, 'dist')
        await mkdir(path.join(inDir, 'node_modules'), { recursive: true })
        await writeFile(path.join(inDir, 'node_modules', 'x.css'), 'body{}', 'utf8')

        await walkFolder(
            inDir,
            outDir,
            makeConfig({ exclude: ['node_modules'] }),
            new Set(),
            inDir,
            new Map(),
        )

        expect(await pathExists(path.join(outDir, 'node_modules'))).toBe(false)
    })
})

describe('processExternals', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'build-externals-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('copies a local external file to its destination', async () => {
        const externalSrc = path.join(dir, 'vendor', 'lib.css')
        await mkdir(path.dirname(externalSrc), { recursive: true })
        await writeFile(externalSrc, 'body{}', 'utf8')
        const outDir = path.join(dir, 'dist')
        await mkdir(outDir, { recursive: true })

        await processExternals(
            dir,
            dir,
            outDir,
            { 'vendor/lib.css': 'assets/lib.css' },
            makeConfig({}, { css: { bundling: false, minify: false } }),
            new Set(),
            new Map(),
        )

        expect(await pathExists(path.join(outDir, 'assets', 'lib.css'))).toBe(true)
    })

    it('skips remote (http) externals', async () => {
        const outDir = path.join(dir, 'dist')
        await mkdir(outDir, { recursive: true })

        await processExternals(
            dir,
            dir,
            outDir,
            { 'https://example.com/lib.css': 'assets/lib.css' },
            makeConfig(),
            new Set(),
            new Map(),
        )

        expect(await pathExists(path.join(outDir, 'assets', 'lib.css'))).toBe(false)
    })

    it('copies a local external whose path merely starts with "http"', async () => {
        const externalSrc = path.join(dir, 'httpdocs', 'lib.css')
        await mkdir(path.dirname(externalSrc), { recursive: true })
        await writeFile(externalSrc, 'body{}', 'utf8')
        const outDir = path.join(dir, 'dist')
        await mkdir(outDir, { recursive: true })

        await processExternals(
            dir,
            dir,
            outDir,
            { 'httpdocs/lib.css': 'assets/lib.css' },
            makeConfig({}, { css: { bundling: false, minify: false } }),
            new Set(),
            new Map(),
        )

        expect(await pathExists(path.join(outDir, 'assets', 'lib.css'))).toBe(true)
    })

    it('skips externals not found on disk', async () => {
        const outDir = path.join(dir, 'dist')
        await mkdir(outDir, { recursive: true })

        await expect(
            processExternals(
                dir,
                dir,
                outDir,
                { 'missing.css': 'assets/missing.css' },
                makeConfig(),
                new Set(),
                new Map(),
            ),
        ).resolves.toBeUndefined()
        expect(await pathExists(path.join(outDir, 'assets', 'missing.css'))).toBe(false)
    })
})
