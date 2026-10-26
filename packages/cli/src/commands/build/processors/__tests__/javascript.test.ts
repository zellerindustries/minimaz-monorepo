import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BundlerError } from '@minimaz/bundler'
import { defaultBuildConfig, defaultConfig, defaultServeConfig } from '@minimaz/config'
import type { MinimazConfig } from '@minimaz/config'
import { applyReplacements } from '@minimaz/core'
import { KnownError } from '@minimaz/logger'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { File } from '../../types.js'
import { processJs, processTs } from '../javascript.js'

function makeConfig(
    minify: boolean,
    bundling = false,
    replace: Record<string, string> = {},
): MinimazConfig {
    return {
        ...defaultConfig,
        ...defaultBuildConfig,
        ...defaultServeConfig,
        output: {
            ...defaultBuildConfig.output,
            js: { bundling, minify },
            replace,
        },
    }
}

describe('processJs', () => {
    it('passes through raw content when minify is disabled', async () => {
        const file: File = { src: 'a.js', dest: 'a.js', content: 'const x = 1;', ext: '.js' }

        expect(await processJs(file, makeConfig(false))).toBe('const x = 1;')
    })

    it('minifies when minify is enabled', async () => {
        const file: File = {
            src: 'a.js',
            dest: 'a.js',
            content: 'const x = 1;\n\n\nconst y = 2;',
            ext: '.js',
        }

        const result = await processJs(file, makeConfig(true))

        expect(result).not.toContain('\n\n\n')
        expect(result).toBe('const x=1;const y=2;')
    })

    it('re-throws an unterminated-literal minify error as a KnownError naming the file', async () => {
        const file: File = { src: 'bad.js', dest: 'bad.js', content: 'const s = "abc', ext: '.js' }

        const error: unknown = await processJs(file, makeConfig(true)).catch((e: unknown) => e)

        expect(error).toBeInstanceOf(KnownError)
        expect((error as KnownError).message).toBe(
            'bad.js: minifyJs: unterminated string at offset 10',
        )
        expect((error as KnownError).cause).toBeInstanceOf(Error)
    })

    it('does not minify (and so does not throw) when minify is disabled', async () => {
        const file: File = { src: 'bad.js', dest: 'bad.js', content: 'const s = "abc', ext: '.js' }

        expect(await processJs(file, makeConfig(false))).toBe('const s = "abc')
    })
})

describe('processTs', () => {
    it('transpiles TypeScript to JavaScript', async () => {
        const file: File = {
            src: 'a.ts',
            dest: 'a.js',
            content: 'const x: number = 1;',
            ext: '.ts',
        }

        const result = await processTs(file, makeConfig(false))

        expect(result).not.toContain(': number')
        expect(result).toContain('const x = 1;')
    })

    it('transpiles JSX when the extension is .tsx', async () => {
        const file: File = {
            src: 'a.tsx',
            dest: 'a.js',
            content: 'const el = <div />;',
            ext: '.tsx',
        }

        const result = await processTs(file, makeConfig(false))

        expect(result).not.toContain('<div')
    })

    it('minifies transpiled output when minify is enabled', async () => {
        const file: File = {
            src: 'a.ts',
            dest: 'a.js',
            content: 'const x: number = 1;\n\n\nconst y: number = 2;',
            ext: '.ts',
        }

        const result = await processTs(file, makeConfig(true))

        expect(result).not.toContain('\n\n\n')
    })
})

describe('bundling', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'cli-js-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    // Mirrors the build pipeline: disk holds the raw source, `content` has replacements applied.
    async function makeFile(
        name: string,
        raw: string,
        ext: '.js' | '.ts',
        replace: Record<string, string> = {},
    ): Promise<File> {
        const src = path.join(dir, name)
        await writeFile(src, raw, 'utf8')
        return { src, dest: src, content: applyReplacements(raw, replace), ext }
    }

    it('bundling: true rewrites a .ts sibling import to .js', async () => {
        await writeFile(path.join(dir, 'b.ts'), 'export const b = 1', 'utf8')
        const file = await makeFile('a.js', "import { b } from './b'\nconsole.log(b)\n", '.js')

        const result = await processJs(file, makeConfig(false, true))

        expect(result).toContain("from './b.js'")
    })

    it('bundling: true transpiles and rewrites a .ts entry', async () => {
        await writeFile(path.join(dir, 'b.ts'), 'export const b = 1', 'utf8')
        const file = await makeFile(
            'a.ts',
            "import { b } from './b'\nconst x: number = b\nconsole.log(x)\n",
            '.ts',
        )

        const result = await processTs(file, makeConfig(false, true))

        expect(result).not.toContain(': number')
        expect(result).toContain("from './b.js'")
    })

    it('bundling: false leaves specifiers untouched', async () => {
        await writeFile(path.join(dir, 'b.ts'), 'export const b = 1', 'utf8')
        const file = await makeFile('a.js', "import { b } from './b'\nconsole.log(b)\n", '.js')

        const result = await processJs(file, makeConfig(false, false))

        expect(result).toContain("from './b'")
        expect(result).not.toContain("from './b.js'")
    })

    it('bundling: true on a file with no imports equals bundling: false output', async () => {
        const file = await makeFile('a.js', 'const x = 1;\nconsole.log(x);\n', '.js')

        const bundled = await processJs(file, makeConfig(false, true))
        const plain = await processJs(file, makeConfig(false, false))

        expect(bundled).toBe(plain)
    })

    it('applies output.replace to bundled content', async () => {
        const file = await makeFile('a.js', "console.log('@@NAME@@')\n", '.js', {
            '@@NAME@@': 'hello',
        })

        const result = await processJs(file, makeConfig(false, true, { '@@NAME@@': 'hello' }))

        expect(result).toContain('hello')
        expect(result).not.toContain('@@NAME@@')
    })

    it('applies output.replace to a bundled .ts file', async () => {
        const file = await makeFile('a.ts', "const n: string = '@@NAME@@'\n", '.ts', {
            '@@NAME@@': 'hello',
        })

        const result = await processTs(file, makeConfig(false, true, { '@@NAME@@': 'hello' }))

        expect(result).toContain('hello')
        expect(result).not.toContain('@@NAME@@')
        expect(result).not.toContain(': string')
    })

    it('resolves a replacement token inside a .js import specifier', async () => {
        await mkdir(path.join(dir, 'lib'))
        await writeFile(path.join(dir, 'lib', 'x.ts'), 'export const x = 1', 'utf8')
        const file = await makeFile('a.js', "import { x } from './@@DIR@@/x'\n", '.js', {
            '@@DIR@@': 'lib',
        })

        const result = await processJs(file, makeConfig(false, true, { '@@DIR@@': 'lib' }))

        expect(result).toContain("from './lib/x.js'")
    })

    it('resolves a replacement token inside a .ts import specifier', async () => {
        await mkdir(path.join(dir, 'lib'))
        await writeFile(path.join(dir, 'lib', 'x.ts'), 'export const x = 1', 'utf8')
        const file = await makeFile(
            'a.ts',
            "import { x } from './@@DIR@@/x'\nconsole.log(x)\n",
            '.ts',
            { '@@DIR@@': 'lib' },
        )

        const result = await processTs(file, makeConfig(false, true, { '@@DIR@@': 'lib' }))

        expect(result).toContain("from './lib/x.js'")
    })

    it('handles a .ts token that is invalid TypeScript before replacement', async () => {
        const file = await makeFile('a.ts', 'const n: number = @@VALUE@@\n', '.ts', {
            '@@VALUE@@': '42',
        })

        const result = await processTs(file, makeConfig(false, true, { '@@VALUE@@': '42' }))

        expect(result).toContain('const n = 42')
    })

    it('bundling: true on an import-free file with replace equals bundling: false output', async () => {
        const replace = { '@@NAME@@': 'hello' }
        const js = await makeFile('a.js', "console.log('@@NAME@@');\n", '.js', replace)
        const ts = await makeFile('b.ts', "const n: string = '@@NAME@@';\n", '.ts', replace)

        expect(await processJs(js, makeConfig(false, true, replace))).toBe(
            await processJs(js, makeConfig(false, false, replace)),
        )
        expect(await processTs(ts, makeConfig(false, true, replace))).toBe(
            await processTs(ts, makeConfig(false, false, replace)),
        )
    })

    it('still minifies rewritten content when bundling and minify are both true', async () => {
        await writeFile(path.join(dir, 'b.ts'), 'export const b = 1', 'utf8')
        const file = await makeFile('a.js', "import { b } from './b'\n\n\nconsole.log(b)\n", '.js')

        const result = await processJs(file, makeConfig(true, true))

        expect(result).toContain("from'./b.js'")
        expect(result).not.toContain('\n\n\n')
    })

    it('reports a TypeScript syntax error under bundling as a KnownError naming the file', async () => {
        const file = await makeFile('a.ts', 'const = ;\n', '.ts')

        const error: unknown = await processTs(file, makeConfig(false, true)).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBeInstanceOf(KnownError)
        expect((error as KnownError).message).toContain(file.src)
        expect((error as KnownError).message).toContain('syntax error')
        expect((error as KnownError).cause).toBeInstanceOf(Error)
    })

    it('reports a TypeScript syntax error without bundling as a KnownError naming the file', async () => {
        const file = await makeFile('a.ts', 'const = ;\n', '.ts')

        const error: unknown = await processTs(file, makeConfig(false, false)).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBeInstanceOf(KnownError)
        expect((error as KnownError).message).toContain(file.src)
        expect((error as KnownError).message).toContain('syntax error')
        expect((error as KnownError).cause).toBeInstanceOf(Error)
    })

    it('keeps a non-syntax transpileTs misuse error as a plain Error', async () => {
        const file: File = {
            src: path.join(dir, 'a.ts'),
            dest: 'a.js',
            content: 42 as unknown as string,
            ext: '.ts',
        }

        const error: unknown = await processTs(file, makeConfig(false, false)).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBeInstanceOf(Error)
        expect(error).not.toBeInstanceOf(KnownError)
        expect((error as Error).message).toContain('code must be a string')
    })

    it.each([true, false])(
        'reports a .tsx syntax error as a KnownError naming the file (bundling: %s)',
        async (bundling) => {
            const src = path.join(dir, 'a.tsx')
            const raw = 'const el = <div;\n'
            await writeFile(src, raw, 'utf8')
            const file: File = { src, dest: src, content: raw, ext: '.tsx' }

            const error: unknown = await processTs(file, makeConfig(false, bundling)).catch(
                (caught: unknown) => caught,
            )

            expect(error).toBeInstanceOf(KnownError)
            expect((error as KnownError).message).toContain(src)
            expect((error as KnownError).message).toContain('syntax error')
        },
    )

    it('unresolvable import rejects with KnownError caused by BundlerError', async () => {
        const file = await makeFile('a.js', "import './missing'\n", '.js')

        const error: unknown = await processJs(file, makeConfig(false, true)).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBeInstanceOf(KnownError)
        expect((error as KnownError).cause).toBeInstanceOf(BundlerError)
    })
})
