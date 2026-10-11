import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defaultBuildConfig, defaultConfig, defaultServeConfig } from '@minimaz/config'
import type { MinimazConfig } from '@minimaz/config'
import { bundleCss } from '@minimaz/css'
import type * as MinimazCss from '@minimaz/css'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { File } from '../../types.js'
import { runDiscovery } from '../../core.js'
import { processCss } from '../css.js'

vi.mock('@minimaz/css', async (importOriginal) => ({
    ...(await importOriginal<typeof MinimazCss>()),
    bundleCss: vi.fn(),
}))

const config: MinimazConfig = {
    ...defaultConfig,
    ...defaultBuildConfig,
    ...defaultServeConfig,
    output: {
        ...defaultBuildConfig.output,
        replace: {},
        css: { bundling: true, minify: false },
    },
}

describe('bundleCss failure classification', () => {
    let dir: string
    let file: File

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'build-css-errors-'))
        const src = path.join(dir, 'main.css')
        await writeFile(src, 'body {}', 'utf8')
        file = { src, dest: path.join(dir, 'out.css'), content: 'body {}', ext: '.css' }
    })

    afterEach(async () => {
        vi.mocked(bundleCss).mockReset()
        await rm(dir, { recursive: true, force: true })
    })

    it('processCss lets a non-bundleCss error (an internal bug) propagate unchanged', async () => {
        const bug = new TypeError('x')
        vi.mocked(bundleCss).mockRejectedValueOnce(bug)

        const error: unknown = await processCss(file, config, new Map()).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBe(bug)
        expect(error).not.toBeInstanceOf(KnownError)
    })

    it('runDiscovery lets a non-bundleCss error (an internal bug) propagate unchanged', async () => {
        const bug = new TypeError('x')
        vi.mocked(bundleCss).mockRejectedValueOnce(bug)

        const error: unknown = await runDiscovery(dir, config, new Set<string>(), new Map()).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBe(bug)
        expect(error).not.toBeInstanceOf(KnownError)
    })

    it('processCss wraps a bundleCss: error into a KnownError with the cause', async () => {
        const cause = new Error('bundleCss: file not found: /x.css')
        vi.mocked(bundleCss).mockRejectedValueOnce(cause)

        const error: unknown = await processCss(file, config, new Map()).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBeInstanceOf(KnownError)
        expect((error as KnownError).message).toBe(cause.message)
        expect((error as KnownError).cause).toBe(cause)
    })

    it('runDiscovery wraps a bundleCss: error into a KnownError with the cause', async () => {
        const cause = new Error('bundleCss: file not found: /x.css')
        vi.mocked(bundleCss).mockRejectedValueOnce(cause)

        const error: unknown = await runDiscovery(dir, config, new Set<string>(), new Map()).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBeInstanceOf(KnownError)
        expect((error as KnownError).cause).toBe(cause)
    })

    it('rethrows an existing KnownError unchanged', async () => {
        const known = new KnownError('already known')
        vi.mocked(bundleCss).mockRejectedValueOnce(known)

        const error: unknown = await processCss(file, config, new Map()).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBe(known)
    })
})
