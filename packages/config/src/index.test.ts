import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KnownError } from '@minimaz/errors'
import {
    CONFIG_FILE_NAME,
    ConfigNotFoundError,
    DEFAULT_BUILD_CONFIG,
    DEFAULT_CONFIG,
    loadConfig,
} from './index.js'

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
            path.join(dir, CONFIG_FILE_NAME),
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
            ...DEFAULT_BUILD_CONFIG,
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
        await writeFile(path.join(dir, CONFIG_FILE_NAME), JSON.stringify(buildSection))
        const config = await loadConfig(dir)
        expect(config).toEqual({ ...DEFAULT_CONFIG, ...buildSection })
    })

    it('fills in defaults for every field when both sections are present but empty', async () => {
        await writeFile(
            path.join(dir, CONFIG_FILE_NAME),
            JSON.stringify({ docs: {}, input: {}, output: {} }),
        )
        const config = await loadConfig(dir)
        expect(config).toEqual({ ...DEFAULT_CONFIG, ...DEFAULT_BUILD_CONFIG })
    })

    it('fills in every default when neither section is present', async () => {
        await writeFile(path.join(dir, CONFIG_FILE_NAME), JSON.stringify({}))
        const config = await loadConfig(dir)
        expect(config).toEqual({ ...DEFAULT_CONFIG, ...DEFAULT_BUILD_CONFIG })
    })

    it('drops unrecognized format values and falls back to the default formats', async () => {
        await writeFile(
            path.join(dir, CONFIG_FILE_NAME),
            JSON.stringify({ docs: { output: { formats: ['docx', 'pdf'] } } }),
        )
        const config = await loadConfig(dir)
        expect(config.docs.output.formats).toEqual(['pdf'])
    })
})
