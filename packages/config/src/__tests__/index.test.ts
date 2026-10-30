import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KnownError, log } from '@minimaz/logger'
import {
    configFileName,
    ConfigNotFoundError,
    ConfigReadError,
    ConfigValidationError,
    defaultBuildConfig,
    defaultConfig,
    defaultServeConfig,
    loadConfig,
    outputDirs,
    resolveDocsOutputDirs,
} from '../index.js'

describe('loadConfig', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'config-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('throws ConfigNotFoundError when no config file exists', async () => {
        await expect(loadConfig(dir)).rejects.toBeInstanceOf(ConfigNotFoundError)
    })

    it('ConfigNotFoundError is a KnownError', async () => {
        await expect(loadConfig(dir)).rejects.toBeInstanceOf(KnownError)
    })

    it('parses a full docs config file, defaulting the build section', async () => {
        await writeFile(
            path.join(dir, configFileName),
            JSON.stringify({
                docs: {
                    input: { dir: 'guides' },
                    output: { bundle: true, formats: ['pdf'] },
                },
            }),
        )
        const config = await loadConfig(dir)
        expect(config).toEqual({
            docs: {
                input: { dir: 'guides' },
                output: { bundle: true, formats: ['pdf'] },
            },
            ...defaultBuildConfig,
            ...defaultServeConfig,
        })
    })

    it('parses a full build config file, defaulting the docs section', async () => {
        const buildSection = {
            input: {
                dir: './app',
                mapping: { pages: 'pages' },
                externals: {},
                exclude: ['*.tmp'],
            },
            output: {
                dir: './out',
                replace: { '/old/': '/new/' },
                css: { bundling: false, minify: false },
                html: { minify: false },
                js: { bundling: false, minify: false },
            },
        }
        await writeFile(path.join(dir, configFileName), JSON.stringify(buildSection))
        const config = await loadConfig(dir)
        expect(config).toEqual({ ...defaultConfig, ...buildSection, ...defaultServeConfig })
    })

    it('fills in defaults for every field when both sections are present but empty', async () => {
        await writeFile(
            path.join(dir, configFileName),
            JSON.stringify({ docs: {}, input: {}, output: {} }),
        )
        const config = await loadConfig(dir)
        expect(config).toEqual({ ...defaultConfig, ...defaultBuildConfig, ...defaultServeConfig })
    })

    it('fills in every default when neither section is present', async () => {
        await writeFile(path.join(dir, configFileName), JSON.stringify({}))
        const config = await loadConfig(dir)
        expect(config).toEqual({ ...defaultConfig, ...defaultBuildConfig, ...defaultServeConfig })
    })

    it('drops unrecognized format values and falls back to the default formats', async () => {
        await writeFile(
            path.join(dir, configFileName),
            JSON.stringify({ docs: { output: { formats: ['docx', 'pdf'] } } }),
        )
        const config = await loadConfig(dir)
        expect(config.docs.output.formats).toEqual(['pdf'])
    })

    it('parses a full serve config file, defaulting the docs and build sections', async () => {
        const serveSection = {
            serve: {
                port: 5000,
                host: '0.0.0.0',
                liveReload: false,
                cleanUrls: true,
                singlePageApp: true,
                directoryListing: true,
                cacheControl: true,
            },
        }
        await writeFile(path.join(dir, configFileName), JSON.stringify(serveSection))
        const config = await loadConfig(dir)
        expect(config).toEqual({
            ...defaultConfig,
            ...defaultBuildConfig,
            serve: { ...serveSection.serve, portDefaulted: false },
        })
    })

    it('defaults serve.port to 4173 and flags it as defaulted when the file omits it', async () => {
        await writeFile(path.join(dir, configFileName), JSON.stringify({ serve: {} }))
        const config = await loadConfig(dir)
        expect(config.serve.port).toBe(4173)
        expect(config.serve.portDefaulted).toBe(true)
    })

    it('keeps an explicit serve.port and reports it as not defaulted', async () => {
        await writeFile(path.join(dir, configFileName), JSON.stringify({ serve: { port: 8080 } }))
        const config = await loadConfig(dir)
        expect(config.serve.port).toBe(8080)
        expect(config.serve.portDefaulted).toBe(false)
    })

    it('treats an explicit serve.port of 0 as not defaulted', async () => {
        await writeFile(path.join(dir, configFileName), JSON.stringify({ serve: { port: 0 } }))
        const config = await loadConfig(dir)
        expect(config.serve.port).toBe(0)
        expect(config.serve.portDefaulted).toBe(false)
    })

    it('fills in serve defaults when the serve section is present but empty', async () => {
        await writeFile(path.join(dir, configFileName), JSON.stringify({ serve: {} }))
        const config = await loadConfig(dir)
        expect(config.serve).toEqual(defaultServeConfig.serve)
    })

    it('fills in serve defaults when the serve section is absent entirely', async () => {
        await writeFile(path.join(dir, configFileName), JSON.stringify({}))
        const config = await loadConfig(dir)
        expect(config.serve).toEqual(defaultServeConfig.serve)
    })

    it('reports a non-ENOENT read failure as its real cause, not as a missing config', async () => {
        await mkdir(path.join(dir, configFileName))
        const error: unknown = await loadConfig(dir).catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(ConfigReadError)
        expect(error).toBeInstanceOf(KnownError)
        expect(error).not.toBeInstanceOf(ConfigNotFoundError)
        expect((error as Error).message).toContain('EISDIR')
        expect((error as Error).cause).toBeInstanceOf(Error)
    })

    it('omits the init hint from ConfigNotFoundError unless the caller supplies one', async () => {
        const error: unknown = await loadConfig(dir).catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(ConfigNotFoundError)
        expect((error as Error).message).not.toContain('docs init')
        expect((error as Error).message).not.toContain('Run ')
    })

    it('includes the caller-supplied init command in ConfigNotFoundError', async () => {
        const error: unknown = await loadConfig(dir, { initCommand: 'minimaz init' }).catch(
            (caught: unknown) => caught,
        )
        expect(error).toBeInstanceOf(ConfigNotFoundError)
        expect((error as Error).message).toContain('Run "minimaz init" first.')
    })

    it('rejects a wrongly-typed serve.port with a ConfigValidationError', async () => {
        await writeFile(path.join(dir, configFileName), JSON.stringify({ serve: { port: '3000' } }))
        const error: unknown = await loadConfig(dir).catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(ConfigValidationError)
        expect(error).toBeInstanceOf(KnownError)
        expect((error as ConfigValidationError).errors).toEqual([
            '"serve.port" must be an integer port between 0 and 65535 (got string)',
        ])
    })

    it('warns about an unrecognized field (e.g. a top-level exclude) instead of ignoring it', async () => {
        const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => undefined)
        await writeFile(
            path.join(dir, configFileName),
            JSON.stringify({ exclude: 'node_modules', input: { excludes: [] } }),
        )
        const config = await loadConfig(dir)
        expect(config.input.exclude).toEqual(defaultBuildConfig.input.exclude)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown key "exclude"'))
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Unknown key "input.excludes"'),
        )
    })

    it('does not warn about free-form keys inside record fields', async () => {
        const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => undefined)
        await writeFile(
            path.join(dir, configFileName),
            JSON.stringify({ input: { mapping: { pages: '' } }, output: { replace: { a: 'b' } } }),
        )
        await loadConfig(dir)
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('rejects a wrongly-typed input.exclude with a ConfigValidationError', async () => {
        await writeFile(
            path.join(dir, configFileName),
            JSON.stringify({ input: { exclude: 'node_modules' } }),
        )
        const error: unknown = await loadConfig(dir).catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(ConfigValidationError)
        expect((error as ConfigValidationError).errors).toEqual([
            '"input.exclude" must be an array of strings (got string)',
        ])
    })

    it('collects every bad field into one ConfigValidationError', async () => {
        await writeFile(
            path.join(dir, configFileName),
            JSON.stringify({
                docs: { output: { bundle: 'yes', formats: 'html' } },
                input: { dir: 42, mapping: { a: 1 } },
                output: { css: { minify: 'no' }, html: [] },
                serve: { port: '3000', host: 1 },
            }),
        )
        const error: unknown = await loadConfig(dir).catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(ConfigValidationError)
        expect((error as ConfigValidationError).errors).toEqual([
            '"docs.output.bundle" must be a boolean (got string)',
            '"docs.output.formats" must be an array of strings (got string)',
            '"input.dir" must be a string (got number)',
            '"input.mapping" must be an object of string values (got object)',
            '"output.css.minify" must be a boolean (got string)',
            '"output.html" must be an object (got array)',
            '"serve.port" must be an integer port between 0 and 65535 (got string)',
            '"serve.host" must be a string (got number)',
        ])
    })

    it('treats an explicit null section or field like an absent one, applying defaults', async () => {
        await writeFile(
            path.join(dir, configFileName),
            JSON.stringify({
                docs: null,
                input: { exclude: null, dir: null },
                output: { css: null, html: { minify: null } },
                serve: null,
            }),
        )
        const config = await loadConfig(dir)
        expect(config).toEqual({ ...defaultConfig, ...defaultBuildConfig, ...defaultServeConfig })
    })

    it('treats null serve/docs sections as absent', async () => {
        await writeFile(path.join(dir, configFileName), JSON.stringify({ serve: null }))
        expect((await loadConfig(dir)).serve).toEqual(defaultServeConfig.serve)
        await writeFile(path.join(dir, configFileName), JSON.stringify({ docs: null }))
        expect((await loadConfig(dir)).docs).toEqual(defaultConfig.docs)
    })

    it('rejects a config whose root is not a JSON object', async () => {
        await writeFile(path.join(dir, configFileName), JSON.stringify([1, 2]))
        const error: unknown = await loadConfig(dir).catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(ConfigValidationError)
        expect((error as ConfigValidationError).errors).toEqual([
            'the config root must be an object (got array)',
        ])
    })
})

describe('resolveDocsOutputDirs', () => {
    it('places docs output in a sibling of output.dir, never inside it', () => {
        expect(resolveDocsOutputDirs('./out')).toEqual({
            html: 'out-docs/html',
            pdf: 'out-docs/pdf',
        })
    })

    it('handles nested and trailing-slash output dirs', () => {
        expect(resolveDocsOutputDirs('build/site/')).toEqual({
            html: 'build/site-docs/html',
            pdf: 'build/site-docs/pdf',
        })
        expect(resolveDocsOutputDirs('build\\site')).toEqual({
            html: 'build/site-docs/html',
            pdf: 'build/site-docs/pdf',
        })
    })

    it('rejects an output.dir with no directory name to derive a sibling from', () => {
        expect(() => resolveDocsOutputDirs('.')).toThrow(KnownError)
        expect(() => resolveDocsOutputDirs('..')).toThrow(KnownError)
        expect(() => resolveDocsOutputDirs('/')).toThrow(KnownError)
    })

    it('defaults outputDirs to the sibling of the default output.dir', () => {
        expect(defaultBuildConfig.output.dir).toBe('./dist')
        expect(outputDirs).toEqual({ html: 'dist-docs/html', pdf: 'dist-docs/pdf' })
        expect(outputDirs).toEqual(resolveDocsOutputDirs(defaultBuildConfig.output.dir))
    })
})
