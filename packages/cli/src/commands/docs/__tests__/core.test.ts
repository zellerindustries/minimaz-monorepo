import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configFileName } from '@minimaz/config'
import { KnownError } from '@minimaz/logger'
import { buildDocs } from '../core.js'

async function writeConfig(dir: string, docs: unknown, output?: unknown): Promise<void> {
    await writeFile(path.join(dir, configFileName), JSON.stringify({ docs, output }))
}

describe('buildDocs', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'docs-builder-core-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('converts each file individually, preserving relative subfolders', async () => {
        await mkdir(path.join(dir, 'docs', 'guides'), { recursive: true })
        await writeFile(path.join(dir, 'docs', 'index.md'), '# Home')
        await writeFile(path.join(dir, 'docs', 'guides', 'start.md'), '# Start')
        await writeConfig(dir, {
            input: { dir: 'docs' },
            output: { bundle: false, formats: ['html', 'pdf'] },
        })

        await buildDocs(dir)

        const home = await readFile(path.join(dir, 'dist-docs', 'html', 'index.html'), 'utf8')
        expect(home).toContain('<!DOCTYPE html>')
        expect(home).toContain('<h1>Home</h1>')

        const guide = await readFile(
            path.join(dir, 'dist-docs', 'html', 'guides', 'start.html'),
            'utf8',
        )
        expect(guide).toContain('<h1>Start</h1>')

        const pdf = await readFile(path.join(dir, 'dist-docs', 'pdf', 'index.pdf'), 'utf8')
        expect(pdf.startsWith('%PDF-1.4\n')).toBe(true)
    })

    it('bundles every file into a single converted output when docs.output.bundle is true', async () => {
        await mkdir(path.join(dir, 'docs'), { recursive: true })
        await writeFile(path.join(dir, 'docs', 'a.md'), 'First.')
        await writeFile(path.join(dir, 'docs', 'b.md'), 'Second.')
        await writeConfig(dir, {
            input: { dir: 'docs' },
            output: { bundle: true, formats: ['html'] },
        })

        await buildDocs(dir)

        const bundled = await readFile(path.join(dir, 'dist-docs', 'html', 'bundle.html'), 'utf8')
        expect(bundled).toContain('First.')
        expect(bundled).toContain('Second.')
        await expect(
            readFile(path.join(dir, 'dist-docs', 'html', 'a.html'), 'utf8'),
        ).rejects.toThrow()
    })

    it('separates bundled files with a horizontal rule, not visible comment text', async () => {
        await mkdir(path.join(dir, 'docs'), { recursive: true })
        await writeFile(path.join(dir, 'docs', 'a.md'), 'First.')
        await writeFile(path.join(dir, 'docs', 'b.md'), 'Second.')
        await writeConfig(dir, {
            input: { dir: 'docs' },
            output: { bundle: true, formats: ['html'] },
        })

        await buildDocs(dir)

        const bundled = await readFile(path.join(dir, 'dist-docs', 'html', 'bundle.html'), 'utf8')
        expect(bundled).not.toContain('&lt;!--')
        expect(bundled).toContain('<p>First.</p>\n<hr />\n<p>Second.</p>')
    })

    it.each([false, true])(
        'fails with file and line info on an unterminated code fence (bundle: %s), writing nothing',
        async (bundle) => {
            await mkdir(path.join(dir, 'docs', 'guides'), { recursive: true })
            await writeFile(path.join(dir, 'docs', 'a.md'), '# A')
            await writeFile(
                path.join(dir, 'docs', 'guides', 'b.md'),
                '# B\n\n```js\nconst x = 1\n\nMore prose.',
            )
            await writeConfig(dir, {
                input: { dir: 'docs' },
                output: { bundle, formats: ['html', 'pdf'] },
            })

            const result = buildDocs(dir)
            await expect(result).rejects.toBeInstanceOf(KnownError)
            await expect(result).rejects.toThrow(
                `${path.join('guides', 'b.md')}: Unterminated code fence opened at line 3`,
            )
            await expect(readFile(path.join(dir, 'dist-docs', 'html', 'a.html'))).rejects.toThrow()
            await expect(
                readFile(path.join(dir, 'dist-docs', 'html', 'bundle.html')),
            ).rejects.toThrow()
        },
    )

    it('writes docs to a sibling of output.dir, never inside the directory build/clear wipe', async () => {
        await mkdir(path.join(dir, 'docs'), { recursive: true })
        await writeFile(path.join(dir, 'docs', 'index.md'), '# Home')
        await writeConfig(
            dir,
            { input: { dir: 'docs' }, output: { bundle: false, formats: ['html'] } },
            { dir: './out' },
        )

        await buildDocs(dir)

        const home = await readFile(path.join(dir, 'out-docs', 'html', 'index.html'), 'utf8')
        expect(home).toContain('<h1>Home</h1>')
        await expect(readFile(path.join(dir, 'out', 'html', 'index.html'))).rejects.toThrow()
        await expect(readFile(path.join(dir, 'dist', 'html', 'index.html'))).rejects.toThrow()
    })

    it('hints at "minimaz docs init" when the config file is missing', async () => {
        await expect(buildDocs(dir)).rejects.toThrow('Run "minimaz docs init" first.')
    })
})
