import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defaultBuildConfig, defaultConfig, defaultServeConfig } from '@minimaz/config'
import type { MinimazConfig } from '@minimaz/config'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { File } from '../../types.js'
import { processCss } from '../css.js'

function makeConfig(overrides: {
    bundling: boolean
    minify: boolean
    replace?: Record<string, string>
}): MinimazConfig {
    return {
        ...defaultConfig,
        ...defaultBuildConfig,
        ...defaultServeConfig,
        output: {
            ...defaultBuildConfig.output,
            replace: overrides.replace ?? {},
            css: { bundling: overrides.bundling, minify: overrides.minify },
        },
    }
}

describe('processCss', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'build-css-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('passes through raw content when bundling is disabled', async () => {
        const filePath = path.join(dir, 'main.css')
        await writeFile(filePath, 'body { color: red; }', 'utf8')

        const file: File = {
            src: filePath,
            dest: path.join(dir, 'out.css'),
            content: 'body { color: red; }',
            ext: '.css',
        }

        const result = await processCss(
            file,
            makeConfig({ bundling: false, minify: false }),
            new Map(),
        )

        expect(result).toBe('body { color: red; }')
    })

    it('minifies when minify is enabled and bundling is disabled', async () => {
        const filePath = path.join(dir, 'main.css')
        const raw = 'body {\n    color: red;\n}'
        await writeFile(filePath, raw, 'utf8')

        const file: File = {
            src: filePath,
            dest: path.join(dir, 'out.css'),
            content: raw,
            ext: '.css',
        }

        const result = await processCss(
            file,
            makeConfig({ bundling: false, minify: true }),
            new Map(),
        )

        expect(result).toBe('body{color:red}')
    })

    it('rejects with a KnownError (original error as cause) for a missing @import', async () => {
        const entryPath = path.join(dir, 'main.css')
        const entryRaw = '@import "./missing.css";'
        await writeFile(entryPath, entryRaw, 'utf8')
        const file: File = {
            src: entryPath,
            dest: path.join(dir, 'out.css'),
            content: entryRaw,
            ext: '.css',
        }

        const error: unknown = await processCss(
            file,
            makeConfig({ bundling: true, minify: false }),
            new Map(),
        ).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(KnownError)
        expect((error as KnownError).message).toContain('file not found')
        expect((error as KnownError).cause).toBeInstanceOf(Error)
    })

    it('inlines @import when bundling is enabled', async () => {
        await mkdir(path.join(dir, 'partials'), { recursive: true })
        await writeFile(path.join(dir, 'partials', '_base.css'), 'body { margin: 0; }', 'utf8')
        const entryPath = path.join(dir, 'main.css')
        const entryRaw = '@import "./partials/_base.css";\nh1 { color: blue; }'
        await writeFile(entryPath, entryRaw, 'utf8')

        const file: File = {
            src: entryPath,
            dest: path.join(dir, 'out.css'),
            content: entryRaw,
            ext: '.css',
        }

        const result = await processCss(
            file,
            makeConfig({ bundling: true, minify: false }),
            new Map(),
        )

        expect(result).toContain('body { margin: 0; }')
        expect(result).toContain('h1 { color: blue; }')
    })

    it('applies replacements to bundled output', async () => {
        const entryPath = path.join(dir, 'main.css')
        const entryRaw = 'body { color: __COLOR__; }'
        await writeFile(entryPath, entryRaw, 'utf8')

        const file: File = {
            src: entryPath,
            dest: path.join(dir, 'out.css'),
            content: entryRaw,
            ext: '.css',
        }

        const result = await processCss(
            file,
            makeConfig({ bundling: true, minify: false, replace: { __COLOR__: 'green' } }),
            new Map(),
        )

        expect(result).toBe('body { color: green; }')
    })

    it('reuses a cached bundle instead of re-resolving @import from disk', async () => {
        await mkdir(path.join(dir, 'partials'), { recursive: true })
        await writeFile(path.join(dir, 'partials', '_base.css'), 'body { margin: 0; }', 'utf8')
        const entryPath = path.join(dir, 'main.css')
        const entryRaw = '@import "./partials/_base.css";\nh1 { color: blue; }'
        await writeFile(entryPath, entryRaw, 'utf8')

        const file: File = {
            src: entryPath,
            dest: path.join(dir, 'out.css'),
            content: entryRaw,
            ext: '.css',
        }

        const cache = new Map([
            [path.resolve(entryPath), { code: 'h1 { color: cached; }', inputs: [entryPath] }],
        ])

        const result = await processCss(file, makeConfig({ bundling: true, minify: false }), cache)

        expect(result).toBe('h1 { color: cached; }')
    })
})
