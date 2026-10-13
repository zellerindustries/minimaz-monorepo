import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defaultBuildConfig, defaultConfig, defaultServeConfig } from '@minimaz/config'
import type { MinimazConfig } from '@minimaz/config'
import { pathExists } from '@minimaz/core'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    getBuildOldDirName,
    getBuildTempDirName,
    processExternals,
    processFile,
    reCreateOutDir,
    replaceOutDir,
    runDiscovery,
    walkFolder,
} from '../core.js'
import type { File } from '../types.js'

function makeConfig(
    overrides: Partial<MinimazConfig['input']> = {},
    outputOverrides: Partial<MinimazConfig['output']> = {},
): MinimazConfig {
    return {
        ...defaultConfig,
        ...defaultBuildConfig,
        ...defaultServeConfig,
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

describe('replaceOutDir', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'build-replace-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('replaces an existing output directory with the temp directory', async () => {
        const outDir = path.join(dir, 'dist')
        const tempDir = getBuildTempDirName(outDir)
        await mkdir(outDir, { recursive: true })
        await writeFile(path.join(outDir, 'old.txt'), 'old', 'utf8')
        await mkdir(tempDir, { recursive: true })
        await writeFile(path.join(tempDir, 'new.txt'), 'new', 'utf8')

        await replaceOutDir(tempDir, outDir)

        expect(await readFile(path.join(outDir, 'new.txt'), 'utf8')).toBe('new')
        expect(await pathExists(path.join(outDir, 'old.txt'))).toBe(false)
        expect(await pathExists(tempDir)).toBe(false)
    })

    it('throws a KnownError naming the temp directory when the swap fails', async () => {
        const outDir = path.join(dir, 'dist')
        const tempDir = getBuildTempDirName(outDir)

        const result = replaceOutDir(tempDir, outDir, { retryDelayMs: 0 })

        await expect(result).rejects.toBeInstanceOf(KnownError)
        await expect(result).rejects.toThrow(tempDir)
    })

    function errnoError(code: string): NodeJS.ErrnoException {
        const error: NodeJS.ErrnoException = new Error(`${code}: simulated`)
        error.code = code
        return error
    }

    async function writeOldAndTemp(): Promise<{ outDir: string; tempDir: string }> {
        const outDir = path.join(dir, 'dist')
        const tempDir = getBuildTempDirName(outDir)
        await mkdir(outDir, { recursive: true })
        await writeFile(path.join(outDir, 'old.txt'), 'old', 'utf8')
        await mkdir(tempDir, { recursive: true })
        await writeFile(path.join(tempDir, 'new.txt'), 'new', 'utf8')
        return { outDir, tempDir }
    }

    it('retries a rename that fails transiently with EPERM', async () => {
        const { outDir, tempDir } = await writeOldAndTemp()
        let failures = 0
        const renameDir = async (from: string, to: string): Promise<void> => {
            if (from === tempDir && failures === 0) {
                failures += 1
                throw errnoError('EPERM')
            }
            await rename(from, to)
        }

        await replaceOutDir(tempDir, outDir, { renameDir, retryDelayMs: 0 })

        expect(failures).toBe(1)
        expect(await readFile(path.join(outDir, 'new.txt'), 'utf8')).toBe('new')
        expect(await pathExists(path.join(outDir, 'old.txt'))).toBe(false)
        expect(await pathExists(tempDir)).toBe(false)
        expect(await pathExists(getBuildOldDirName(outDir))).toBe(false)
    })

    it('restores the previous output when moving the new build in fails permanently', async () => {
        const { outDir, tempDir } = await writeOldAndTemp()
        const renameDir = async (from: string, to: string): Promise<void> => {
            if (from === tempDir) {
                throw errnoError('EPERM')
            }
            await rename(from, to)
        }

        const result = replaceOutDir(tempDir, outDir, { renameDir, retryDelayMs: 0 })

        await expect(result).rejects.toBeInstanceOf(KnownError)
        await expect(result).rejects.toThrow(tempDir)
        expect(await readFile(path.join(outDir, 'old.txt'), 'utf8')).toBe('old')
        expect(await readFile(path.join(tempDir, 'new.txt'), 'utf8')).toBe('new')
        expect(await pathExists(getBuildOldDirName(outDir))).toBe(false)
    })

    it('does not retry a non-transient rename error', async () => {
        const { outDir, tempDir } = await writeOldAndTemp()
        let calls = 0
        const renameDir = async (from: string, to: string): Promise<void> => {
            if (from === tempDir) {
                calls += 1
                throw errnoError('EXDEV')
            }
            await rename(from, to)
        }

        await expect(
            replaceOutDir(tempDir, outDir, { renameDir, retryDelayMs: 0 }),
        ).rejects.toBeInstanceOf(KnownError)
        expect(calls).toBe(1)
        expect(await readFile(path.join(outDir, 'old.txt'), 'utf8')).toBe('old')
    })

    it('refuses to swap when the previous output cannot be moved aside, leaving it unchanged', async () => {
        const { outDir, tempDir } = await writeOldAndTemp()
        const renameDir = async (from: string, to: string): Promise<void> => {
            if (from === outDir) {
                throw errnoError('EXDEV')
            }
            await rename(from, to)
        }

        const result = replaceOutDir(tempDir, outDir, { renameDir, retryDelayMs: 0 })

        await expect(result).rejects.toBeInstanceOf(KnownError)
        await expect(result).rejects.toThrow(/could not move the previous output .* aside/)
        await expect(result).rejects.toThrow(tempDir)
        expect(await readFile(path.join(outDir, 'old.txt'), 'utf8')).toBe('old')
        expect(await readFile(path.join(tempDir, 'new.txt'), 'utf8')).toBe('new')
    })

    it('reports where both builds are when the swap and the restore both fail', async () => {
        const { outDir, tempDir } = await writeOldAndTemp()
        const oldDir = getBuildOldDirName(outDir)
        const renameDir = async (from: string, to: string): Promise<void> => {
            if (from === tempDir || from === oldDir) {
                throw errnoError('EXDEV')
            }
            await rename(from, to)
        }

        const result = replaceOutDir(tempDir, outDir, { renameDir, retryDelayMs: 0 })

        await expect(result).rejects.toBeInstanceOf(KnownError)
        await expect(result).rejects.toThrow(/nor restore the previous output/)
        await expect(result).rejects.toThrow(`The previous output is in ${oldDir}`)
        await expect(result).rejects.toThrow(`the completed build is in ${tempDir}`)
        expect(await readFile(path.join(oldDir, 'old.txt'), 'utf8')).toBe('old')
        expect(await readFile(path.join(tempDir, 'new.txt'), 'utf8')).toBe('new')
        expect(await pathExists(outDir)).toBe(false)
    })

    it('has nothing to restore when there was no previous output and the move-in fails', async () => {
        const outDir = path.join(dir, 'dist')
        const tempDir = getBuildTempDirName(outDir)
        await mkdir(tempDir, { recursive: true })
        await writeFile(path.join(tempDir, 'new.txt'), 'new', 'utf8')
        const renameDir = (): Promise<void> => Promise.reject(errnoError('EXDEV'))

        const result = replaceOutDir(tempDir, outDir, { renameDir, retryDelayMs: 0 })

        await expect(result).rejects.toBeInstanceOf(KnownError)
        await expect(result).rejects.toThrow(
            `could not move the completed build into ${outDir} (EXDEV: simulated). The completed build is in ${tempDir}`,
        )
        expect(await readFile(path.join(tempDir, 'new.txt'), 'utf8')).toBe('new')
    })

    it('does not retry an error that has no code, and stringifies a non-Error rejection', async () => {
        const { outDir, tempDir } = await writeOldAndTemp()
        let plainCalls = 0
        const plainError = (from: string, to: string): Promise<void> => {
            if (from === tempDir) {
                plainCalls += 1
                return Promise.reject(new Error('plain failure'))
            }
            return rename(from, to)
        }

        await expect(
            replaceOutDir(tempDir, outDir, { renameDir: plainError, retryDelayMs: 0 }),
        ).rejects.toThrow('plain failure')
        expect(plainCalls).toBe(1)
        expect(await readFile(path.join(outDir, 'old.txt'), 'utf8')).toBe('old')
    })

    it('treats a non-Error rejection as non-transient and uses its string form', async () => {
        const { outDir, tempDir } = await writeOldAndTemp()
        let calls = 0
        const renameDir = (from: string, to: string): Promise<void> => {
            if (from === tempDir) {
                calls += 1
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                return Promise.reject('disk on fire')
            }
            return rename(from, to)
        }

        const result = replaceOutDir(tempDir, outDir, { renameDir, retryDelayMs: 0 })

        await expect(result).rejects.toThrow(/\(disk on fire\); the previous output was restored/)
        expect(calls).toBe(1)
        expect(await readFile(path.join(outDir, 'old.txt'), 'utf8')).toBe('old')
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

    it('skips an external already claimed by ignoredFiles', async () => {
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
            new Set([externalSrc]),
            new Map(),
        )

        expect(await pathExists(path.join(outDir, 'assets', 'lib.css'))).toBe(false)
    })

    it('walks a local external directory into its destination', async () => {
        await mkdir(path.join(dir, 'vendor', 'nested'), { recursive: true })
        await writeFile(path.join(dir, 'vendor', 'a.txt'), 'a', 'utf8')
        await writeFile(path.join(dir, 'vendor', 'nested', 'b.txt'), 'b', 'utf8')
        const outDir = path.join(dir, 'dist')
        await mkdir(outDir, { recursive: true })

        await processExternals(
            dir,
            dir,
            outDir,
            { vendor: 'assets/vendor' },
            makeConfig(),
            new Set(),
            new Map(),
        )

        expect(await readFile(path.join(outDir, 'assets', 'vendor', 'a.txt'), 'utf8')).toBe('a')
        expect(
            await readFile(path.join(outDir, 'assets', 'vendor', 'nested', 'b.txt'), 'utf8'),
        ).toBe('b')
    })

    it('copies a local external file with an unprocessed extension byte-for-byte', async () => {
        const bytes = Buffer.from([0, 1, 2, 255, 254])
        await mkdir(path.join(dir, 'vendor'), { recursive: true })
        await writeFile(path.join(dir, 'vendor', 'logo.bin'), bytes)
        const outDir = path.join(dir, 'dist')
        await mkdir(outDir, { recursive: true })

        await processExternals(
            dir,
            dir,
            outDir,
            { 'vendor/logo.bin': 'logo.bin' },
            makeConfig(),
            new Set(),
            new Map(),
        )

        expect(await readFile(path.join(outDir, 'logo.bin'))).toEqual(bytes)
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
